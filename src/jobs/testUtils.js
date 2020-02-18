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
// import chai, {expect} from 'chai';
// import nock from 'nock';
// import {chaiNock} from 'chai-nock';
// import fixtureFactory, {READERS} from '@natlibfi/fixura';
// import mongoFixturesFactory from '@natlibfi/fixura-mongo';
// import startTask, {__RewireAPI__ as RewireAPI} from '../index1'; // eslint-disable-line import/named
// import {readdirSync} from 'fs';
// import {join as joinPath} from 'path';

// chai.use(chaiNock);
// export default ({rootPath}) => {
// 	let requester;
// 	let mongoFixtures;

// 	after(() => {
// 		RewireAPI.__ResetDependency__('MONGO_URI');
// 	});

// 	afterEach(async () => {
// 		await mongoFixtures.close();
// 		RewireAPI.__ResetDependency__('MONGO_URI');
// 	});

// 	return (...args) => {
// 		return async () => {
// 			const dir = rootPath.concat(args);
// 			const {getFixture} = fixtureFactory({rooot: dir});
// 			const subDirs = readdirSync(joinPath.apply(undefined, dir));
// 			return iterate();

// 			async function iterate() {
// 				const sub = subDirs.shift();
// 				// Const PASSPORT_LOCAL_USERS = `file://${joinPath.apply(undefined, dir)}/${sub}/local.json`;

// 				if (sub) {
// 					const {
// 						descr,
// 						skip,
// 						state,
// 						apiUrl,
// 						query
// 					} = getData(sub);

// 					if (skip) {
// 						it.skip(`${sub} ${descr}`);
// 					} else {
// 						it(`${sub} ${descr}`, async () => {
// 							mongoFixtures = await mongoFixturesFactory({rootPath: dir, useObjectId: true});
// 							RewireAPI.__Rewire__('MONGO_URI', await mongoFixtures.getConnectionString());
// 							RewireAPI.__Rewire__('JOB_STATE', state);

// 							const task = await startTask();

// 							await mongoFixtures.populate([sub, 'dbContents.json']);
// 							const scope = nock(apiUrl).post('/requests/user', {query: query});
// 						});
// 					}
// 				}
// 			}

// 			function getData(subDir) {
// 				const {descr, skip, state, apiUrl, query} = getFixture({
// 					componenets: [subDir, 'metadata.json'],
// 					reader: READERS.JSON
// 				});
// 				return {descr, skip, state, apiUrl, query};
// 			}
// 		};
// 	};
// };