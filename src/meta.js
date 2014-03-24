"use strict";

var fs = require('fs'),
	path = require('path'),
	async = require('async'),
	winston = require('winston'),
	nconf = require('nconf'),
	_ = require('underscore'),

	utils = require('./../public/src/utils'),
	translator = require('./../public/src/translator'),
	db = require('./database'),
	plugins = require('./plugins'),
	User = require('./user');


(function (Meta) {
	Meta.config = {};

	Meta.configs = {
		init: function (callback) {
			delete Meta.config;

			Meta.configs.list(function (err, config) {
				if(err) {
					winston.error(err);
					return callback(err);
				}

				Meta.config = config;
				callback();
			});
		},
		list: function (callback) {
			db.getObject('config', function (err, config) {
				if(err) {
					return callback(err);
				}

				config = config || {};
				config.status = 'ok';
				callback(err, config);
			});
		},
		get: function (field, callback) {
			db.getObjectField('config', field, callback);
		},
		getFields: function (fields, callback) {
			db.getObjectFields('config', fields, callback);
		},
		set: function (field, value, callback) {
			if(!field) {
				return callback(new Error('invalid config field'));
			}

			db.setObjectField('config', field, value, function(err, res) {
				if (callback) {
					if(!err && Meta.config) {
						Meta.config[field] = value;
					}

					callback(err, res);
				}

				// this might be a good spot to add a hook
				if (field === 'defaultLang') {
					translator.loadServer();
				}
			});
		},
		setOnEmpty: function (field, value, callback) {
			Meta.configs.get(field, function (err, curValue) {
				if(err) {
					return callback(err);
				}

				if (!curValue) {
					Meta.configs.set(field, value, callback);
				} else {
					callback();
				}
			});
		},
		remove: function (field) {
			db.deleteObjectField('config', field);
		}
	};

	Meta.themes = {
		get: function (callback) {
			var themePath = nconf.get('themes_path');
			if (typeof themePath !== 'string') {
				return callback(null, []);
			}
			fs.readdir(themePath, function (err, files) {
				async.filter(files, function (file, next) {
					fs.stat(path.join(themePath, file), function (err, fileStat) {
						if (err) {
							return next(false);
						}

						next((fileStat.isDirectory() && file.slice(0, 13) === 'nodebb-theme-'));
					});
				}, function (themes) {
					async.map(themes, function (theme, next) {
						var config = path.join(themePath, theme, 'theme.json');

						if (fs.existsSync(config)) {
							fs.readFile(config, function (err, file) {
								if (err) {
									return next();
								} else {
									var configObj = JSON.parse(file.toString());
									next(err, configObj);
								}
							});
						} else {
							next();
						}
					}, function (err, themes) {
						themes = themes.filter(function (theme) {
							return (theme !== undefined);
						});
						callback(null, themes);
					});
				});
			});
		},
		set: function(data, callback) {
			var	themeData = {
				'theme:type': data.type,
				'theme:id': data.id,
				'theme:staticDir': '',
				'theme:templates': '',
				'theme:src': ''
			};

			switch(data.type) {
				case 'local':
					async.waterfall([
						function(next) {
							fs.readFile(path.join(nconf.get('themes_path'), data.id, 'theme.json'), function(err, config) {
								if (!err) {
									config = JSON.parse(config.toString());
									next(null, config);
								} else {
									next(err);
								}
							});
						},
						function(config, next) {
							themeData['theme:staticDir'] = config.staticDir ? config.staticDir : '';
							themeData['theme:templates'] = config.templates ? config.templates : '';
							themeData['theme:src'] = config.frameworkCSS ? config.frameworkCSS : '';

							db.setObject('config', themeData, next);
						}
					], callback);
					break;

				case 'bootswatch':
					themeData['theme:src'] = data.src;
					db.setObject('config', themeData, callback);
					break;
			}
		}
	};

	Meta.title = {
		tests: {
			isCategory: /^category\/\d+\/?/,
			isTopic: /^topic\/\d+\/?/,
			isUserPage: /^user\/[^\/]+(\/[\w]+)?/
		},
		build: function (urlFragment, callback) {
			var user = require('./user');

			Meta.title.parseFragment(decodeURIComponent(urlFragment), function(err, title) {
				if (err) {
					title = Meta.config.browserTitle || 'NodeBB';
				} else {
					title = (title ? title + ' | ' : '') + (Meta.config.browserTitle || 'NodeBB');
				}

				callback(null, title);
			});
		},
		parseFragment: function (urlFragment, callback) {
			var	translated = ['', 'recent', 'unread', 'users', 'notifications'];
			if (translated.indexOf(urlFragment) !== -1) {
				if (!urlFragment.length) {
					urlFragment = 'home';
				}

				translator.translate('[[pages:' + urlFragment + ']]', function(translated) {
					callback(null, translated);
				});
			} else if (this.tests.isCategory.test(urlFragment)) {
				var cid = urlFragment.match(/category\/(\d+)/)[1];

				require('./categories').getCategoryField(cid, 'name', function (err, name) {
					callback(null, name);
				});
			} else if (this.tests.isTopic.test(urlFragment)) {
				var tid = urlFragment.match(/topic\/(\d+)/)[1];

				require('./topics').getTopicField(tid, 'title', function (err, title) {
					callback(null, title);
				});
			} else if (this.tests.isUserPage.test(urlFragment)) {
				var	matches = urlFragment.match(/user\/([^\/]+)\/?([\w]+)?/),
					userslug = matches[1],
					subpage = matches[2];

				User.getUsernameByUserslug(userslug, function(err, username) {
					if (subpage) {
						translator.translate('[[pages:user.' + subpage + ', ' + username + ']]', function(translated) {
							callback(null, translated);
						});
					} else {
						callback(null, username);
					}
				});
			} else {
				callback(null);
			}
		}
	};

	Meta.js = {
		cache: undefined,
		scripts: [
			'vendor/jquery/js/jquery.js',
			'vendor/jquery/js/jquery-ui-1.10.4.custom.js',
			'vendor/jquery/timeago/jquery.timeago.min.js',
			'vendor/jquery/js/jquery.form.min.js',
			'vendor/bootstrap/js/bootstrap.min.js',
			'vendor/requirejs/require.js',
			'vendor/bootbox/bootbox.min.js',
			'vendor/tinycon/tinycon.js',
			'vendor/xregexp/xregexp.js',
			'vendor/xregexp/unicode/unicode-base.js',
			'src/app.js',
			'src/templates.js',
			'src/ajaxify.js',
			'src/translator.js',
			'src/overrides.js',
			'src/utils.js'
		],
		minFile: 'nodebb.min.js',
		get: function (callback) {
			plugins.fireHook('filter:scripts.get', this.scripts, function(err, scripts) {
				var ctime,
					jsPaths = scripts.map(function (jsPath) {
						jsPath = path.normalize(jsPath);

						// The filter:scripts.get plugin will be deprecated as of v0.5.0, specify scripts in plugin.json instead
						if (jsPath.substring(0, 7) === 'plugins') {
							var	matches = _.map(plugins.staticDirs, function(realPath, mappedPath) {
								if (jsPath.match(mappedPath)) {
									return mappedPath;
								} else {
									return null;
								}
							}).filter(function(a) { return a; });

							if (matches.length) {
								var	relPath = jsPath.slice(new String('plugins/' + matches[0]).length),
									pluginId = matches[0].split(path.sep)[0];

								winston.warn('[meta.scripts.get (' + pluginId + ')] filter:scripts.get is deprecated, consider using "scripts" in plugin.json');
								return plugins.staticDirs[matches[0]] + relPath;
							} else {
								winston.warn('[meta.scripts.get] Could not resolve mapped path: ' + jsPath + '. Are you sure it is defined by a plugin?');
								return null;
							}
						} else {
							return path.join(__dirname, '..', '/public', jsPath);
						}
					});

				// Remove scripts that could not be found (remove this line at v0.5.0)
				Meta.js.scripts = jsPaths.filter(function(path) {
					return path !== null;
				});

				// Add plugin scripts
				Meta.js.scripts = Meta.js.scripts.concat(plugins.clientScripts);

				callback(null, [
					Meta.js.minFile
				]);
			});
		},
		minify: function (callback) {
			var uglifyjs = require('uglify-js'),
				minified;

			if (process.env.NODE_ENV === 'development') {
				winston.info('Minifying client-side libraries');
			}

			minified = uglifyjs.minify(this.scripts);
			this.cache = minified.code;
			callback();
		},
		concatenate: function(callback) {
			if (process.env.NODE_ENV === 'development') {
				winston.info('Concatenating client-side libraries into one file');
			}

			async.map(this.scripts, function(path, next) {
				fs.readFile(path, { encoding: 'utf-8' }, next);
			}, function(err, contents) {
				if (err) {
					winston.error('[meta.js.concatenate] Could not minify javascript! Error: ' + err.message);
					process.exit();
				}

				Meta.js.cache = contents.reduce(function(output, src) {
					return output.length ? output + ';\n' + src : src;
				}, '');
				callback();
			});
		}
	};

	/* Sounds */
	Meta.sounds = {};

	// todo: Possibly move these into a bundled module?
	Meta.sounds.getLocal = function(callback) {
		fs.readdir(path.join(__dirname, '../public/sounds'), function(err, files) {
			var	localList = {};

			if (err) {
				winston.error('Could not get local sound files:' + err.message);
				console.log(err.stack);
				return callback(null, []);
			}

			// Return proper paths
			files.forEach(function(filename) {
				localList[filename] = nconf.get('url') + '/sounds/' + filename;
			});

			callback(null, localList);
		});
	};

	Meta.sounds.getMapping = function(callback) {
		db.getObject('settings:sounds', function(err, sounds) {
			if (err || !sounds) {
				// Send default sounds
				var	defaults = {
						notification: 'notification.wav',
						'chat-incoming': 'waterdrop-high.wav',
						'chat-outgoing': 'waterdrop-low.wav'
					};

				return callback(null, defaults);
			}

			callback.apply(null, arguments);
		});
	};

	/* Settings */
	Meta.settings = {};
	Meta.settings.get = function(hash, callback) {
		hash = 'settings:' + hash;
		db.getObject(hash, callback);
	};

	Meta.settings.getOne = function(hash, field, callback) {
		hash = 'settings:' + hash;
		db.getObjectField(hash, field, callback);
	};

	Meta.settings.set = function(hash, values, callback) {
		hash = 'settings:' + hash;
		db.setObject(hash, values, callback);
	};

	Meta.settings.setOne = function(hash, field, value, callback) {
		hash = 'settings:' + hash;
		db.setObjectField(hash, field, value, callback);
	};

	Meta.settings.setOnEmpty = function (hash, field, value, callback) {
		Meta.settings.getOne(hash, field, function (err, curValue) {
			if (err) {
				return callback(err);
			}

			if (!curValue) {
				Meta.settings.setOne(hash, field, value, callback);
			} else {
				callback();
			}
		});
	};

	/* Assorted */
	Meta.css = {
		cache: undefined
	};

	Meta.restart = function() {
		if (process.send) {
			process.send('nodebb:restart');
		} else {
			winston.error('[meta.restart] Could not restart, are you sure NodeBB was started with `./nodebb start`?');
		}
	};
}(exports));
