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
import {readdirSync} from 'fs';
import {join as joinPath} from 'path';

import {API_URL} from './config';
import startTask, {__RewireAPI__ as RewireAPI} from './app';

const setTimeoutPromise = promisify(setTimeout);

export default ({rootPath}) => {
  // eslint-disable-next-line functional/no-let
  let MongoServer;

  beforeEach(async () => {
    MongoServer = getMongoMethods();
    RewireAPI.__Rewire__('MONGO_URI', await MongoServer.getConnectionString());
    nock.cleanAll();
    nock(API_URL)
      .post('/auth')
      .reply(204);
  });

  afterEach(async () => {
    await MongoServer.closeCallback();
    RewireAPI.__ResetDependency__('MONGO_URI');
    RewireAPI.__ResetDependency__('REQUEST_JOBS');
    RewireAPI.__ResetDependency__('CLEAN_UP_JOBS');
    RewireAPI.__ResetDependency__('MELINDA_JOBS');
  });

  return (...args) => () => {
    const dir = rootPath.concat(args);
    const {getFixture} = fixtureFactory({root: dir});
    const subDirs = readdirSync(joinPath(...dir));

    return iterate();

    function iterate() {
      subDirs.forEach(subD => {
        if (subD) {
          const {
            descr,
            httpRequest,
            getHttpRequest,
            reqheader,
            JOBS,
            pendingMock,
            timeout,
            pollFrequency,
            skip
          } = getData(subD);

          if (skip) {
            return it.skip(`${subD} ${descr}`);
          }

          // eslint-disable-next-line max-statements
          return it(`${subD} ${descr}`, async () => {
            RewireAPI.__Rewire__('REQUEST_JOBS', JOBS);
            RewireAPI.__Rewire__('CLEAN_UP_JOBS', []);
            RewireAPI.__Rewire__('MELINDA_JOBS', []);

            const scope = nock(API_URL, {
              reqheaders: {
                [`${reqheader.contentType}`]: 'application/json',
                Authorization: `${reqheader.Authorization}`
              }
            });

            const scopeGet = getHttpRequest && nock(API_URL, {
              reqheaders: {
                accept: 'application/json',
                Authorization: `${reqheader.Authorization}`
              }
            });

            mockRequest({subD, scope, scopeGet, httpRequest, getHttpRequest});

            setTimeout(() => {
              if (pendingMock) {
                const nockPending = nock.pendingMocks();
                if (nockPending.length === 1 && `${pendingMock.method} ${API_URL}${pendingMock.url}` === nockPending[0]) {
                  nock.cleanAll();
                  return;
                }
              }

              if (nock.pendingMocks().length === 0) {
                scopeGet.done();
                return scope.done();
              }
            }, timeout);

            const agenda = await startTask();
            await poll();
            await agenda.stop();

            async function poll() {
              if (nock.isDone() === false) {
                await setTimeoutPromise(pollFrequency);
                return poll();
              }
            }
          });
        }

        function normalMockRequest({subD, scope, requests}) {
          return requests.forEach(request => {
            const newScope = request.twice ? scope[request.method](`${request.url}`).twice() : scope[request.method](`${request.url}`);
            if (request.responseBody) {
              const queryResponse = getFixture({
                components: [
                  subD,
                  request.responseBody
                ], reader: READERS.JSON
              });
              return newScope.reply(request.responseStatus, queryResponse);
            }

            return newScope.reply(request.responseStatus);
          });
        }

        function mockRequest({subD, scope, scopeGet, httpRequest, getHttpRequest}) {
          if (scopeGet) {
            normalMockRequest({subD, scope, requests: httpRequest});
            normalMockRequest({subD, scope: scopeGet, requests: getHttpRequest});
            return;
          }

          return normalMockRequest({subD, scope, requests: httpRequest});
        }

        function getData(subD) {
          const {descr, httpRequest, getHttpRequest, reqheader, JOBS, pendingMock, timeout, pollFrequency, skip} = getFixture({
            components: [
              subD,
              'metadata.json'
            ],
            reader: READERS.JSON
          });
          const result = getHttpRequest
            ? {descr, httpRequest, reqheader, JOBS, timeout, pollFrequency, skip, getHttpRequest}
            : {descr, httpRequest, reqheader, JOBS, timeout, pollFrequency, skip};

          if (pendingMock) {
            return {...result, pendingMock};
          }

          return result;
        }
      });
    }
  };

  function getMongoMethods() {
    const Mongo = new MongoMemoryServer();
    return {
      getConnectionString: () => Mongo.getConnectionString(),
      getInstanceInfo: () => Mongo.getInstanceInfo(),
      closeCallback: () => {
        const {childProcess} = Mongo.getInstanceInfo();

        if (childProcess && !childProcess.killed) {
          return Mongo.stop();
        }
      }
    };
  }
};
