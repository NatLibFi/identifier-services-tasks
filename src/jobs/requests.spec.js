/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Tasks microservice of Identifier Services
*
* Copyright (C) 2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of identifier-services-tasks
*
* identifier-services-tasks program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* identifier-services-tasks is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

import nock from 'nock';
import {promisify} from 'util';
import fixtureFactory, {READERS} from '@natlibfi/fixura';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import startTask, {__RewireAPI__ as RewireAPI} from '../app'; // eslint-disable-line

const setTimeoutPromise = promisify(setTimeout);

describe('task', () => {
	let mongoFixtures;
	const dir = [__dirname, '..', '..', 'test-fixtures', 'requests'];
	const {getFixture} = fixtureFactory({
		root: dir,
		reader: READERS.json
	});

	beforeEach(async () => {
		mongoFixtures = await mongoFixturesFactory({rootPath: dir, useObjectId: true});
		RewireAPI.__Rewire__('MONGO_URI', await mongoFixtures.getConnectionString());
		nock('http://localhost:8081')
			.post('/auth')
			.reply(204);
	});

	after(() => {
		RewireAPI.__ResetDependency__('MONGO_URI');
	});

	afterEach(async () => {
		await mongoFixtures.close();
		RewireAPI.__ResetDependency__('MONGO_URI');
		RewireAPI.__ResetDependency__('JOB_STATE');
		RewireAPI.__ResetDependency__('JOB_TYPE');
	});
	describe('#users', () => {
		it('should pass', async () => {
			RewireAPI.__Rewire__('JOB_STATE', 'new');
			RewireAPI.__Rewire__('JOB_TYPE', 'users');

			await mongoFixtures.populate(['users', '0', 'dbContents.json']);
			const queryResponse = getFixture({components: ['users', '0', 'queryResponse.json']});
			const inProgressPayload = getFixture({components: ['users', '0', 'inProgressPayload.json']});
			const parseInProgressPayload = JSON.parse(inProgressPayload);
			const {_id, ...payload} = parseInProgressPayload.usersRequest[0];

			const pendingQuery = {queries: [{query: {state: 'new', backgroundProcessingState: 'pending'}}], offset: null};
			const scope = nock('http://localhost:8081', {
				reqheaders: {
					'Content-type': 'application/json',
					Authorization: 'Bearer null'
				}
			})
				.log(console.log)
				.post('/requests/users/query', JSON.stringify(pendingQuery))
				.reply(200, queryResponse)
				.put('/requests/users/5cd3e9e5f2376736726e4c19')
				.reply(async (uri, requestBody) => {
					return (JSON.stringify(payload) === JSON.stringify(requestBody)) &&
						[200, await mongoFixtures.populate(['users', '0', 'inProgressPayload.json'])];
				})
				.put('/requests/users/5cd3e9e5f2376736726e4c19')
				.reply(async (uri, requestBody) => {
					return (JSON.stringify({...payload, backgroundProcessingState: 'processed'}) === JSON.stringify(requestBody)) &&
						[200, await mongoFixtures.populate(['users', '0', 'processedPayload.json'])];
				});

			setTimeout(() => {
				scope.done();
			}, 200);

			startTask();
			await poll();

			async function poll() {
				if (!nock.isDone()) {
					await setTimeoutPromise(100);
					return poll();
				}

				return nock.isDone();
			}
		});
	});
});
