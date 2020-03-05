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
import {MongoMemoryServer} from 'mongodb-memory-server';
import fixtureFactory, {READERS} from '@natlibfi/fixura';
import {MONGO_URI, TZ, MAX_CONCURRENCY, JOB_FREQ_REQUEST_STATE_NEW, JOBS, API_URL} from '../config';
import startTask, {__RewireAPI__ as RewireAPI} from '../app'; // eslint-disable-line

const setTimeoutPromise = promisify(setTimeout);

describe('task', () => {
	let mongoServer;
	const dir = [__dirname, '..', '..', 'test-fixtures', 'requests'];
	const {getFixture} = fixtureFactory({
		root: dir,
		reader: READERS.json
	});

	beforeEach(async () => {
		mongoServer = new MongoMemoryServer();
		RewireAPI.__Rewire__('MONGO_URI', await mongoServer.getConnectionString());
		nock('http://localhost:8081')
			.post('/auth')
			.reply(204);
	});

	afterEach(async () => {
		await mongoServer.stop();
		RewireAPI.__ResetDependency__('MONGO_URI');
		RewireAPI.__ResetDependency__('JOBS');
	});

	describe('#users', () => {
		it('should no update when the reply is empty', async () => {
			RewireAPI.__Rewire__('JOBS', [{jobFreq: JOB_FREQ_REQUEST_STATE_NEW, jobName: 'JOB_USER_REQUEST_STATE_NEW'}]);
			const scope = nock('http://localhost:8081', {
				reqheaders: {
					'Content-type': 'application/json',
					Authorization: 'Bearer null'
				}
			})
				// .log(console.log)
				.post('/requests/users/query')
				.reply(200, {})
				.put('/requests/users/5cd3e9e5f2376736726e4c19')
				.reply(200, {test: 'test'});

			const pendingMocks = '/requests/users/5cd3e9e5f2376736726e4c19';

			setTimeout(() => {
				if (nock.pendingMocks().includes(`PUT ${API_URL}${pendingMocks}`)) {
					nock.cleanAll();
					scope.done();
				}
			}, 45);

			startTask({MONGO_URI, TZ, MAX_CONCURRENCY, JOBS});
			await poll();

			async function poll() {
				if (!nock.isDone()) {
					await setTimeoutPromise(35);
					return poll();
				}
			}
		});

		it('should sucessfully processed a request', async () => {
			RewireAPI.__Rewire__('JOBS', [{jobFreq: JOB_FREQ_REQUEST_STATE_NEW, jobName: 'JOB_USER_REQUEST_STATE_NEW'}]);
			const queryResponse = getFixture({components: ['users', '0', 'queryResponse.json']});
			const templatesPostResponse = getFixture({components: ['users', '0', 'templatesPostResponse.json']});
			const templatesGetResponse = getFixture({components: ['users', '0', 'templatesGetResponse.json']});

			const scope = nock('http://localhost:8081', {
				reqheaders: {
					'Content-type': 'application/json',
					Authorization: 'Bearer null'
				}
			})
				.log(console.log)
				.post('/requests/users/query')
				.reply(200, queryResponse)
				.put('/requests/users/5cd3e9e5f2376736726e4c19')
				.reply(200)
				.post('/templates/query')
				.reply(200, templatesPostResponse)
				.put('/requests/users/5cd3e9e5f2376736726e4c19')
				// .twice()
				.reply(200);

			const scopeGet = nock('http://localhost:8081', {
				reqheaders: {
					accept: 'application/json',
					Authorization: 'Bearer null'
				}
			})
				.get('/templates/5e5e07f0616dc6f5bdb9eee9')
				.reply(200, templatesGetResponse);

			setTimeout(() => {
				scope.done();
				scopeGet.done();
			}, 200);

			startTask({MONGO_URI, TZ, MAX_CONCURRENCY, JOBS});
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
