
'use strict';

const _ = require('lodash');

const user = require('../user');
const groups = require('../groups');
const helpers = require('./helpers');
const plugins = require('../plugins');
const utils = require('../utils');

module.exports = function (privileges) {
	privileges.admin = {};

	privileges.admin.privilegeLabels = [
		{ name: '[[admin/manage/privileges:admin-dashboard]]' },
		{ name: '[[admin/manage/privileges:admin-categories]]' },
		{ name: '[[admin/manage/privileges:admin-settings]]' },
	];

	privileges.admin.userPrivilegeList = [
		'admin:dashboard',
		'admin:categories',
		'admin:settings',
	];

	privileges.admin.groupPrivilegeList = privileges.admin.userPrivilegeList.map(privilege => 'groups:' + privilege);

	// Mapping for a page route (via direct match or regexp) to a privilege
	privileges.admin.routeMap = {
		dashboard: 'admin:dashboard',
		'manage/categories': 'admin:categories',
		'extend/plugins': 'admin:settings',
		'extend/widgets': 'admin:settings',
		'extend/rewards': 'admin:settings',
	};
	privileges.admin.routeRegexpMap = {
		'^manage/categories/\\d+': 'admin:categories',
		'^settings/[\\w\\-]+$': 'admin:settings',
		'^appearance/[\\w]+$': 'admin:settings',
		'^plugins/[\\w\\-]+$': 'admin:settings',
	};

	// Mapping for socket call methods to a privilege
	// In NodeBB v2, these socket calls will be removed in favour of xhr calls
	privileges.admin.socketMap = {
		'admin.rooms.getAll': 'admin:dashboard',
		'admin.analytics.get': 'admin:dashboard',

		'admin.categories.getAll': 'admin:categories',
		'admin.categories.create': 'admin:categories',
		'admin.categories.update': 'admin:categories',
		'admin.categories.purge': 'admin:categories',
		'admin.categories.copySettingsFrom': 'admin:categories',

		'admin.getSearchDict': 'admin:settings',
		'admin.config.setMultiple': 'admin:settings',
		'admin.config.remove': 'admin:settings',
		'admin.themes.getInstalled': 'admin:settings',
		'admin.themes.set': 'admin:settings',
		'admin.reloadAllSessions': 'admin:settings',
		'admin.settings.get': 'admin:settings',
	};

	privileges.admin.resolve = (path) => {
		if (privileges.admin.routeMap[path]) {
			return privileges.admin.routeMap[path];
		} else if (path === '') {
			return 'manage:dashboard';
		}

		let privilege;
		Object.keys(privileges.admin.routeRegexpMap).forEach((regexp) => {
			if (!privilege) {
				if (new RegExp(regexp).test(path)) {
					privilege = privileges.admin.routeRegexpMap[regexp];
				}
			}
		});

		return privilege;
	};

	privileges.admin.list = async function () {
		async function getLabels() {
			return await utils.promiseParallel({
				users: plugins.fireHook('filter:privileges.admin.list_human', privileges.admin.privilegeLabels.slice()),
				groups: plugins.fireHook('filter:privileges.admin.groups.list_human', privileges.admin.privilegeLabels.slice()),
			});
		}
		const payload = await utils.promiseParallel({
			labels: getLabels(),
			users: helpers.getUserPrivileges(0, 'filter:privileges.admin.list', privileges.admin.userPrivilegeList),
			groups: helpers.getGroupPrivileges(0, 'filter:privileges.admin.groups.list', privileges.admin.groupPrivilegeList),
		});
		// This is a hack because I can't do {labels.users.length} to echo the count in templates.js
		payload.columnCount = payload.labels.users.length + 2;
		return payload;
	};

	privileges.admin.get = async function (uid) {
		const [userPrivileges, isAdministrator] = await Promise.all([
			helpers.isUserAllowedTo(privileges.admin.userPrivilegeList, uid, 0),
			user.isAdministrator(uid),
		]);

		const combined = userPrivileges.map(allowed => allowed || isAdministrator);
		const privData = _.zipObject(privileges.admin.userPrivilegeList, combined);

		privData.superadmin = isAdministrator;
		return await plugins.fireHook('filter:privileges.admin.get', privData);
	};

	privileges.admin.can = async function (privilege, uid) {
		const isUserAllowedTo = await helpers.isUserAllowedTo(privilege, uid, [0]);
		return isUserAllowedTo[0];
	};

	// privileges.admin.canGroup = async function (privilege, groupName) {
	// 	return await groups.isMember(groupName, 'cid:0:privileges:groups:' + privilege);
	// };

	privileges.admin.give = async function (privileges, groupName) {
		await helpers.giveOrRescind(groups.join, privileges, 'admin', groupName);
		plugins.fireHook('action:privileges.admin.give', {
			privileges: privileges,
			groupNames: Array.isArray(groupName) ? groupName : [groupName],
		});
	};

	privileges.admin.rescind = async function (privileges, groupName) {
		await helpers.giveOrRescind(groups.leave, privileges, 'admin', groupName);
		plugins.fireHook('action:privileges.admin.rescind', {
			privileges: privileges,
			groupNames: Array.isArray(groupName) ? groupName : [groupName],
		});
	};

	// privileges.admin.userPrivileges = async function (uid) {
	// 	const tasks = {};
	// 	privileges.admin.userPrivilegeList.forEach(function (privilege) {
	// 		tasks[privilege] = groups.isMember(uid, 'cid:0:privileges:' + privilege);
	// 	});
	// 	return await utils.promiseParallel(tasks);
	// };

	// privileges.admin.groupPrivileges = async function (groupName) {
	// 	const tasks = {};
	// 	privileges.admin.groupPrivilegeList.forEach(function (privilege) {
	// 		tasks[privilege] = groups.isMember(groupName, 'cid:0:privileges:' + privilege);
	// 	});
	// 	return await utils.promiseParallel(tasks);
	// };
};
