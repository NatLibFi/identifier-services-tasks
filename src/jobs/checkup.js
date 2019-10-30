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
import {Utils} from '@natlibfi/identifier-services-commons';
import {createApiClient} from '@natlibfi/identifier-services-commons';
import {API_URL, API_USERNAME, API_PASSWORD, API_CLIENT_USER_AGENT, JOB_PUBLISHER_REQUEST_STATE_NEW_CHECK, REQUEST_TTL} from '../config';
const {createLogger} = Utils;
import moment from 'moment';
import humanInterval from 'human-interval';

export default function (agenda) {
	const logger = createLogger();

	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	agenda.define(JOB_PUBLISHER_REQUEST_STATE_NEW_CHECK, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'new', 'publishers');
	});

	// eslint-disable-next-line max-params
	async function request(job, done, state, type, subtype) {
		try {
			await getRequests();
		} finally {
			done();
		}

		async function getRequests() {
			await processRequest({
				client,
				processCallback,
				query: {queries: [{query: {state: state, backgroundProcessingState: 'inProgress'}}], offset: null},
				messageCallback: count => `${count} requests are inProgress`, type: type, subtype: subtype,
				ttl: humanInterval(REQUEST_TTL)
			});
		}

		async function processCallback(requests, type, subtype) {
			await Promise.all(requests.map(async request => {
				switch (request.state) {
					case 'new':
						await setBackground(request, type, subtype, 'pending');
						break;
					default:
						break;
				}
			}));

			async function setBackground(request, type, subtype, state) {
				const payload = {...request, backgroundProcessingState: state};
				const {requests} = client;
				switch (type) {
					case 'publishers':
						await requests.update({path: `requests/${type}/${request.id}`, payload: payload});
						break;
					default:
						break;
				}

				logger.log('info', `Background processing State changed to ${state} for${request.id}`);
			}
		}

		async function processRequest({client, processCallback, messageCallback, query, type, ttl, subtype, filter = () => true}) {
			try {
				let response;
				let res;
				const {requests} = client;
				switch (type) {
					case 'publishers':
						response = await requests.fetchList({path: `requests/${type}`, query: query});
						res = await response.json();
						break;

					default:
						break;
				}

				let requestsTotal = 0;
				const pendingProcessors = [];
				if (res.results) {
					const filteredRequests = res.results.filter(filter);
					if (filteredRequests.length > 0) {
						const result = filteredRequests.map(request => {
							const modificationTime = moment(request.lastUpdated.timestamp);
							if (modificationTime.add(ttl).isBefore(moment())) {
								return request;
							}

							return null;
						});
						pendingProcessors.push(processCallback(result, type, subtype));
						return pendingProcessors;
					}

					requestsTotal += filteredRequests.length;
				}

				if (messageCallback) {
					logger.log('debug', messageCallback(requestsTotal));
				}
			} catch (err) {
				return err;
			}
		}
	}
}
