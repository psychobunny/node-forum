'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const nconf = require('nconf');
const request = require('request-promise-native');

var db = require('../mocks/databasemock');

const meta = require('../../src/meta');
const user = require('../../src/user');
const groups = require('../../src/groups');
const topics = require('../../src/topics');
const categories = require('../../src/categories');
const file = require('../../src/file');
const utils = require('../../src/utils');

const helpers = require('../helpers');

describe('Topic thumbs', () => {
	let topicObj;
	let categoryObj;
	let adminUid;
	let adminJar;
	let adminCSRF;
	let fooJar;
	let fooCSRF;
	let fooUid;
	const thumbPaths = ['files/test.png', 'files/test2.png'];
	const uuid = utils.generateUUID();

	function createFiles() {
		fs.closeSync(fs.openSync(path.resolve(__dirname, '../uploads', thumbPaths[0]), 'w'));
		fs.closeSync(fs.openSync(path.resolve(__dirname, '../uploads', thumbPaths[1]), 'w'));
	}

	before(async () => {
		meta.config.allowTopicsThumbnail = 1;

		adminUid = await user.create({ username: 'admin', password: '123456' });
		fooUid = await user.create({ username: 'foo', password: '123456' });
		await groups.join('administrators', adminUid);
		({ adminJar, adminCSRF } = await new Promise((resolve, reject) => {
			helpers.loginUser('admin', '123456', (err, adminJar, adminCSRF) => {
				if (err) {
					return reject(err);
				}

				resolve({ adminJar, adminCSRF });
			});
		}));
		({ fooJar, fooCSRF } = await new Promise((resolve, reject) => {
			helpers.loginUser('foo', '123456', (err, fooJar, fooCSRF) => {
				if (err) {
					return reject(err);
				}

				resolve({ fooJar, fooCSRF });
			});
		}));

		categoryObj = await categories.create({
			name: 'Test Category',
			description: 'Test category created by testing script',
		});
		topicObj = await topics.post({
			uid: adminUid,
			cid: categoryObj.cid,
			title: 'Test Topic Title',
			content: 'The content of test topic',
		});

		// Touch a couple files and associate it to a topic
		createFiles();
		db.sortedSetAdd(`topic:${topicObj.tid}:thumbs`, 0, `/${thumbPaths[0]}`);
	});

	it('should return bool for whether a thumb exists', async () => {
		const exists = await topics.thumbs.exists(topicObj.tid, `/${thumbPaths[0]}`);
		assert.strictEqual(exists, true);
	});

	describe('.get()', () => {
		it('should return an array of thumbs', async () => {
			const thumbs = await topics.thumbs.get(topicObj.tid);
			assert.deepStrictEqual(thumbs, [{ url: `${nconf.get('upload_url')}/${thumbPaths[0]}` }]);
		});

		it('should return an array of an array of thumbs if multiple tids are passed in', async () => {
			const thumbs = await topics.thumbs.get([topicObj.tid, topicObj.tid + 1]);
			assert.deepStrictEqual(thumbs, [
				[{ url: `${nconf.get('upload_url')}/${thumbPaths[0]}` }],
				[],
			]);
		});
	});

	describe('.associate()', () => {
		it('should add an uploaded file to a zset', async () => {
			await topics.thumbs.associate(2, thumbPaths[0]);

			const exists = await db.isSortedSetMember(`topic:2:thumbs`, thumbPaths[0]);
			assert(exists);
		});

		it('should also work with UUIDs', async () => {
			await topics.thumbs.associate(uuid, thumbPaths[1]);

			const exists = await db.isSortedSetMember(`draft:${uuid}:thumbs`, thumbPaths[1]);
			assert(exists);
		});
	});

	describe('.migrate()', () => {
		it('should combine the thumbs uploaded to a UUID zset and combine it with a topic\'s thumb zset', async () => {
			await topics.thumbs.migrate(uuid, 2);

			const thumbs = await topics.thumbs.get(2);
			assert.strictEqual(thumbs.length, 2);
			assert.deepStrictEqual(thumbs, [
				{ url: `${nconf.get('upload_url')}/${thumbPaths[0]}` },
				{ url: `${nconf.get('upload_url')}/${thumbPaths[1]}` },
			]);
		});
	});

	describe(`.delete()`, () => {
		it('should remove a file from sorted set AND disk', async () => {
			await topics.thumbs.delete(1, thumbPaths[0]);

			assert.strictEqual(await db.isSortedSetMember('topic:1:thumbs', thumbPaths[0]), false);
			assert.strictEqual(await file.exists(`${nconf.get('upload_path')}/${thumbPaths[0]}`), false);
		});

		it('should also work with UUIDs', async () => {
			await topics.thumbs.associate(uuid, thumbPaths[1]);
			await topics.thumbs.delete(uuid, thumbPaths[1]);

			assert.strictEqual(await db.isSortedSetMember(`draft:${uuid}:thumbs`, thumbPaths[1]), false);
			assert.strictEqual(await file.exists(`${nconf.get('upload_path')}/${thumbPaths[1]}`), false);
		});
	});

	describe('HTTP calls to topic thumb routes', () => {
		before(() => {
			createFiles();
		});

		it('should succeed with a valid tid', (done) => {
			helpers.uploadFile(`${nconf.get('url')}/api/v3/topics/1/thumbs`, path.join(__dirname, '../files/test.png'), {}, adminJar, adminCSRF, function (err, res, body) {
				assert.ifError(err);
				assert.strictEqual(res.statusCode, 200);
				done();
			});
		});

		it('should succeed with a uuid', (done) => {
			helpers.uploadFile(`${nconf.get('url')}/api/v3/topics/${uuid}/thumbs`, path.join(__dirname, '../files/test.png'), {}, adminJar, adminCSRF, function (err, res, body) {
				assert.ifError(err);
				assert.strictEqual(res.statusCode, 200);
				done();
			});
		});

		it('should fail with a non-existant tid', (done) => {
			helpers.uploadFile(`${nconf.get('url')}/api/v3/topics/2/thumbs`, path.join(__dirname, '../files/test.png'), {}, adminJar, adminCSRF, function (err, res, body) {
				assert.ifError(err);
				assert.strictEqual(res.statusCode, 404);
				done();
			});
		});

		it('should fail when garbage is passed in', (done) => {
			helpers.uploadFile(`${nconf.get('url')}/api/v3/topics/abracadabra/thumbs`, path.join(__dirname, '../files/test.png'), {}, adminJar, adminCSRF, function (err, res, body) {
				assert.ifError(err);
				assert.strictEqual(res.statusCode, 404);
				done();
			});
		});

		it('should fail when calling user cannot edit the tid', (done) => {
			helpers.uploadFile(`${nconf.get('url')}/api/v3/topics/1/thumbs`, path.join(__dirname, '../files/test.png'), {}, fooJar, fooCSRF, function (err, res, body) {
				assert.ifError(err);
				assert.strictEqual(res.statusCode, 403);
				done();
			});
		});
	});
});
