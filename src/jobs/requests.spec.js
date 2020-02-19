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
// import testSuiteFactory from './testUtils';

// describe('task', () => {
// 	const generateTestSuite = testSuiteFactory({
// 		rootPath: [__dirname, '..', '..', 'test-features']
// 	});
// 	describe('requests', () => {
// 		describe('#users', geeTestSuite('requests', 'users'));
// 	});
// });

import chai, {expect} from 'chai';
import nock from 'nock';
import fixtureFactory, {READERS} from '@natlibfi/fixura';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import base64 from 'base-64';
import {MongoClient, MongoError} from 'mongodb';
import startTask, {__RewireAPI__ as RewireAPI} from '../index'; // eslint-disable-line import/named
import * as environments from '../config';

describe('task', () => {
	let requester;
	let mongoFixtures;
	const dir = [__dirname, '..', '..', 'test-fixtures', 'requests'];
	const {getFixture} = fixtureFactory({
		root: dir,
		reader: READERS.json
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

	describe('#publishers', () => {
		it('should pass', async () => {
			mongoFixtures = await mongoFixturesFactory({rootPath: dir, useObjectId: true});
			RewireAPI.__Rewire__('MONGO_URI', await mongoFixtures.getConnectionString());
			RewireAPI.__Rewire__('JOB_STATE', 'new');
			RewireAPI.__Rewire__('JOB_TYPE', 'publishers');

			await mongoFixtures.populate(['publishers', '0', 'dbContents.json']);
			const response = getFixture({components: ['publishers', '0', 'response.json']});
			const payload = getFixture({components: ['publishers', '0', 'payload.json']});
			const expectedDb = getFixture({components: ['publishers', '0', 'dbExpected.json']});
			const parseResponse = JSON.parse(response);
			const query = {queries: [{query: {state: 'new', backgroundProcessingState: 'pending'}}], offset: null};

			const scope = nock('http://localhost:8081');

			scope.matchHeader('Content-Type', 'application/json')
				.post('/requests/publishers/query', query)
				.reply(200, response);

			const {id, ...inProgressPayload} = {...parseResponse.results[0], backgroundProcessingState: 'inProgress'};

			scope.matchHeader('Content-Type', 'application/json')
				.put('/requests/publishers/5cdff4db937aed356a2b5817', JSON.stringify(inProgressPayload))
				.reply(200, payload);


			nock('http://localhost:8081')
				.get('/requests/publishers/5cdff4db937aed356a2b5817')
				.reply(200, {...parseResponse.results[0], backgroundProcessingState: 'processed', initialRequest: true});


			await startTask();
			await poll();

			async function poll() {
				const db = await mongoFixtures.dump();
				if (db.PublisherRequest[0].backgroundProcessingState === 'progressed') {
					const result = await db.PublisherRequest.find({_id: '5cdff4db937aed356a2b5817'});
					console.log(result);
				}

				await setTimeout(() => poll(), 100);
				return poll();
			}

		});
	});
});
