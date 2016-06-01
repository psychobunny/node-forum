/**
 * environment constant values
 */
var winston = require('winston'),
	cfenv = require('cfenv');
var env = env || {};

var appEnv = {};
try {
	appEnv = cfenv.getAppEnv();
} catch (e) {
	winston.info('This platform does not support cfenv.getAppEnv() method.');
}

// ipaddress openshift - Cloud Foundry(IBM Bluemix, Amazon EC2 etc.) - '127.0.0.1'
env.IPADDRESS = process.env.OPENSHIFT_NODEJS_IP || appEnv.bind || '127.0.0.1';
// port openshift - Cloud Foundry(IBM Bluemix, Amazon EC2 etc.) - 4567
env.PORT = process.env.OPENSHIFT_NODEJS_PORT || appEnv.port || 4567;

module.exports = env;
