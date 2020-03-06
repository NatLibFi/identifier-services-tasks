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
	JOB_REQUEST_BG_PROCESSING_CLEANUP_USERS,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN,
	REQUEST_TTL
} from '../config';
const {createLogger} = Utils;
import moment from 'moment';
import humanInterval from 'human-interval';

export default async function (agenda) {
	const logger = createLogger();

	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	agenda.define(JOB_REQUEST_BG_PROCESSING_CLEANUP_USERS, {concurrency: 1}, async (_, done) => {
		await request(done, 'users');
	});
	agenda.define(JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS, {concurrency: 1}, async (_, done) => {
		await request(done, 'publishers');
	});
	agenda.define(JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN, {concurrency: 1}, async (_, done) => {
		await request(done, 'publications/isbn-ismn');
	});
	agenda.define(JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN, {concurrency: 1}, async (_, done) => {
		await request(done, 'publications/issn');
	});

	async function request(done, type) {
		try {
			const requests = await getRequests(done, type);
			const filteredRequests = await filterRequests(requests);
			logger.log('debug', `${filteredRequests.length} requests for ${type} need to have their background processing state set to 'pending'`);
			await processRequests(filteredRequests);
		} finally {
			done();
		}

		async function getRequests(_, type) {
			try {
				const {requests} = client;
				const response = await requests.fetchList({path: `requests/${type}`, query: {queries: [{query: {backgroundProcessingState: 'inProgress'}}], offset: null}});
				const result = await response.json();
				return result.results;
			} catch (err) {
				return err;
			}
		}

		async function filterRequests(requests) {
			return requests.filter(request => moment(request.lastUpdated.timestamp).add(humanInterval(REQUEST_TTL)).isBefore(moment()));
		}

		async function processRequests(filteredRequests) {
			await Promise.all(filteredRequests.map(async request => setBackground(request, 'pending')));

			async function setBackground(request, state) {
				const payload = {...request, backgroundProcessingState: state};
				const {requests} = client;
				await requests.update({path: `requests/${type}/${request.id}`, payload: payload});

				logger.log('info', `Background processing State changed to ${state} for ${request.id}`);
			}
		}
	}
}
