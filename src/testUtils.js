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

import nock, { pendingMocks } from 'nock';
import {promisify} from 'util';
import {MongoMemoryServer} from 'mongodb-memory-server';
import fixtureFactory, {READERS} from '@natlibfi/fixura';
import {readdirSync} from 'fs';
import {join as joinPath} from 'path';

import {API_URL} from './config';
import startTask, {__RewireAPI__ as RewireAPI} from './app'; // eslint-disable-line

const setTimeoutPromise = promisify(setTimeout);

export default ({rootPath}) => {
	let mongoServer;

	beforeEach(async () => {
		mongoServer = new MongoMemoryServer();
		RewireAPI.__Rewire__('MONGO_URI', await mongoServer.getConnectionString());
		nock(API_URL)
			.post('/auth')
			.reply(204);
	});

	afterEach(async () => {
		await mongoServer.stop();
		RewireAPI.__ResetDependency__('MONGO_URI');
		RewireAPI.__ResetDependency__('JOBS');
	});

	after(async () => {
		await mongoServer.stop();
	});

	return (...args) => {
		return async () => {
			const dir = rootPath.concat(args);
			const {getFixture} = fixtureFactory({root: dir});
			const subDirs = readdirSync(joinPath.apply(undefined, dir));

			return iterate();

			async function iterate() {
				const subD = subDirs.shift();

				if (subD) {
					const {
						descr,
						httpRequest,
						getHttpRequest,
						reqheader,
						JOBS,
						pendingMock,
						timeout,
						timeoutPromise,
						skip
					} = getData(subD);

					if (skip) {
						it.skip(`${subD} ${descr}`);
					} else {
						it(`${subD} ${descr}`, async () => {
							RewireAPI.__Rewire__('JOBS', JOBS);
							const scope = nock(API_URL, {
								reqheaders: {
									[`${reqheader.contentType}`]: 'application/json',
									Authorization: `${reqheader.Authorization}`
								}
							});

							formatScope({subD, scope, requests: httpRequest});

							if (getHttpRequest) {
								const scopeGet = nock(API_URL, {
									reqheaders: {
										accept: 'application/json',
										Authorization: `${reqheader.Authorization}`
									}
								}).log(console.log);

								formatScope({subD, scope: scopeGet, requests: getHttpRequest});
							}

							setTimeout(() => {
								if (pendingMock) {
									const nockPending = nock.pendingMocks();
									if (nockPending.length === 1 && `${pendingMock.method} ${API_URL}${pendingMock.url}` === nockPending[0]) {
										nock.cleanAll();
										scope.done();
									}
								} else if (nock.pendingMocks().length === 0) {
									scope.done();
								}
							}, timeout);

							startTask();
							await poll();

							async function poll() {
								if (!nock.isDone()) {
									await setTimeoutPromise(timeoutPromise);
									return poll();
								}
							}
						});
					}

					iterate();
				}

				function formatScope({subD, scope, requests}) {
					requests.forEach(request => {
						if (request.responseBody) {
							const queryResponse = getFixture({components: [subD, request.responseBody], reader: READERS.JSON});
							if (request.times) {
								scope[request.method](`${request.url}`).times(request.times).reply(request.responseStatus, queryResponse);
							}

							scope[request.method](`${request.url}`).reply(request.responseStatus, queryResponse);
						} else {
							if (request.times) {
								scope[request.method](`${request.url}`).times(request.times).reply(request.responseStatus);
							}

							scope[request.method](`${request.url}`).reply(request.responseStatus);
						}
					});
				}

				function getData(subD) {
					const {descr, httpRequest, getHttpRequest, reqheader, JOBS, pendingMock, timeout, timeoutPromise, skip} = getFixture({
						components: [subD, 'metadata.json'],
						reader: READERS.JSON
					});
					if (pendingMock) {
						if (getHttpRequest) {
							return {descr, httpRequest, getHttpRequest, reqheader, JOBS, pendingMock, timeout, timeoutPromise, skip};
						}

						return {descr, httpRequest, reqheader, JOBS, pendingMock, timeout, timeoutPromise, skip};
					}

					if (getHttpRequest) {
						return {descr, httpRequest, getHttpRequest, reqheader, JOBS, timeout, timeoutPromise, skip};
					}

					return {descr, httpRequest, reqheader, JOBS, timeout, timeoutPromise, skip};
				}
			}
		};
	};
};
