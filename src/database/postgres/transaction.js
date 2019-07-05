'use strict';

module.exports = function (db, dbNamespace, module) {
	module.transaction = async function (perform, txClient) {
		// if (dbNamespace.active && dbNamespace.get('db')) {
		let res;
		if (txClient) {
			// const client = dbNamespace.get('db');
			await txClient.query(`SAVEPOINT nodebb_subtx`);
			try {
				res = await perform(txClient);
			} catch (err) {
				await txClient.query(`ROLLBACK TO SAVEPOINT nodebb_subtx`);
				throw err;
			}
			await txClient.query(`RELEASE SAVEPOINT nodebb_subtx`);
			return res;
		}

		const client = await db.connect();
		console.log('transaction', client, client.query, '--');
		try {
			console.log('calling begin', client.query);
			await client.query(`BEGIN`);
			console.log('calling perform', client.query, perform, typeof perform);
			res = await perform(client);
			console.log('returned from perform');
			await client.query('COMMIT');
			// dbNamespace.set('db', null);
		} catch (err) {
			await client.query('ROLLBACK');
			// dbNamespace.set('db', null);
			throw err;
		}
		return res;
	};
};
