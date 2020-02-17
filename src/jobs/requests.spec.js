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
// 		describe('#users', generateTestSuite('requests', 'users'));
// 	});
// });

import chai, {expect} from 'chai';
import chaiNock from 'chai-nock';
import nock from 'nock';
import fixtureFactory, {READERS} from '@natlibfi/fixura';
import mongoFixturesFactory from '@natlibfi/fixura-mongo';
import base64 from 'base-64';
import startTask, {__RewireAPI__ as RewireAPI} from '../index'; // eslint-disable-line import/named

chai.use(chaiNock);
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
		await mongoFixtures.clear();
		await mongoFixtures.close();
		RewireAPI.__ResetDependency__('MONGO_URI');
		RewireAPI.__ResetDependency__('JOB_STATE');
		RewireAPI.__ResetDependency__('JOB_TYPE');
	});

	describe('#users', () => {
		it('should pass', async () => {
			mongoFixtures = await mongoFixturesFactory({rootPath: dir, useObjectId: true});
			RewireAPI.__Rewire__('MONGO_URI', await mongoFixtures.getConnectionString());
			RewireAPI.__Rewire__('JOB_STATE', 'new');
			RewireAPI.__Rewire__('JOB_TYPE', 'users');

			await mongoFixtures.populate(['users', '0', 'dbContents.json']);
			const dbExpected = getFixture({components: ['users', '0', 'dbExpected.json']});
			const response = {
				offset: '5cd3e9e5f2376736726e4c19',
				queryDocCount: 1,
				totalDoc: 1,
				results: [
					{
						id: '5cd3e9e5f2376736726e4c19',
						userId: 'foo.bar@foo.bar',
						publisher: '5dde33ad22f69862179e3d22',
						creator: 'pubisher-admin',
						givenName: 'Barbar',
						familyName: 'Bar',
						email: 'foo.bar@foo.bar',
						state: 'new',
						backgroundProcessingState: 'pending',
						notes: ['This is a note'],
						preferences: {
							defaultLanguage: 'eng'
						},
						lastUpdated: {
							timestamp: '838383838',
							user: 'bar'
						}
					}
				]
			};

			nock('http://localhost:8081')
				.post('/requests/users')
				// .basicAuth({user: base64.encode('admin'), pass: base64.encode('gM3RsfxAr7e5VwsSPAC6')})
				.query({query: [{queries: {query: {state: 'new', backgroundProcessingState: 'pending'}}}], offset: null})
				.reply(200, response);

			nock('http://localhost:8081')
				.get('/users/foo.bar@foo.bar')
				.reply(200, 'foo.bar@foo.bar');

			const backgroundProcessingState = ['inProgress', 'processed'];
			let processedData;

			backgroundProcessingState.forEach(state => {
				nock('http://localhost:8081')
					.put('/requests/users/5cd3e9e5f2376736726e4c19', {...response.results, backgroundProcessingState: state, initialRequest: true})
					// .basicAuth({user: base64.encode('admin'), pass: base64.encode('gM3RsfxAr7e5VwsSPAC6')})
					.reply(201, {...response, results: {...response.results, state: backgroundProcessingState}});
			});
		});
	});
});
