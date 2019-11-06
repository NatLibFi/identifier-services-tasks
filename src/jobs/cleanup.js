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
import {
	API_URL,
	API_USERNAME,
	API_PASSWORD,
	API_CLIENT_USER_AGENT,
	JOB_REQUEST_BG_PROCESSING_CLEANUP,
	REQUEST_TTL
} from '../config';
const {createLogger} = Utils;
import moment from 'moment';
import humanInterval from 'human-interval';

export default async function (agenda) {
	const logger = createLogger();
	const types = ['users', 'publishers', 'publications/isbn-ismn', 'publications/issn'];
	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	agenda.define(JOB_REQUEST_BG_PROCESSING_CLEANUP, {concurrency: 1}, async (_, done) => {
		try {
			const requests = await getRequests();
			const newResult = requests.reduce((acc, cVal) => {
				return acc.concat(cVal);
			}, []);
			logger.log('debug', `${newResult.length} requests are inProgress`);
			newResult.map(async request => {
				const modificationTime = moment(request.lastUpdated.timestamp);
				if (modificationTime.add(humanInterval(REQUEST_TTL)).isBefore(moment())) {
					await processCallback(request);
				}

				return null;
			});
		} finally {
			done();
		}
	});

	async function getRequests() {
		const {requests} = client;
		return Promise.all(
			types.map(async type => {
				const response = await requests.fetchList({path: `requests/${type}`, query: {queries: [{query: {backgroundProcessingState: 'inProgress'}}], offset: null}});
				const res = await response.json();
				const result = res.results.map(item => {
					const o = Object.assign({}, item);
					o.requestType = type;
					return o;
				});
				return result;
			})
		);
	}

	async function processCallback(request) {
		await setBackground(request, request.requestType, 'pending');

		async function setBackground(request, type, state) {
			delete request.requestType;
			const payload = {...request, backgroundProcessingState: state};
			const {requests} = client;
			const response = await requests.update({path: `requests/${type}/${request.id}`, payload: payload});
			logger.log('info', `Background processing State changed to ${state} for${request.id}`);
			return response;
		}
	}
}
