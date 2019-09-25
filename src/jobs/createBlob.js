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

import {Utils} from '@natlibfi/melinda-commons';
import {createApiClient} from '../api-client';
import {
	API_URL,
	JOB_BACKGROUND_PROCESSING_PENDING,
	JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
	JOB_BACKGROUND_PROCESSING_PROCESSED,
	JOB_BIBLIOGRAPHIC_METADATA_PENDING,
	JOB_BIBLIOGRAPHIC_METADATA_INPROGRESS,
	JOB_BIBLIOGRAPHIC_METADATA_PROCESSED,
	API_CLIENT_USER_AGENT,
	API_PASSWORD,
	API_USERNAME
} from '../config';

const {createLogger} = Utils;

export default function (agenda) {
	const logger = createLogger();

	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	agenda.define(JOB_BIBLIOGRAPHIC_METADATA_PENDING, {concurrency: 1}, async (job, done) => {
		await request(job, done, JOB_BACKGROUND_PROCESSING_PENDING);
	});

	agenda.define(JOB_BIBLIOGRAPHIC_METADATA_INPROGRESS, {concurrency: 1}, async (job, done) => {
		await request(job, done, JOB_BACKGROUND_PROCESSING_IN_PROGRESS);
	});

	async function request(job, done, state) {
		try {
			await getRequests();
		} finally {
			done();
		}

		async function getRequests() {
			await processRequest({
				client, processCallback,
				query: {queries: [{query: {metadataReference: state}}], offset: null},
				messageCallback: count => `${count} requests are ${state}`
			});
		}
	}

	async function processCallback(requests) {
		await Promise.all(requests.map(async request => {
			await setBackground(request, JOB_BACKGROUND_PROCESSING_IN_PROGRESS);
			
		}));

		async function setBackground(request, state) {
			console.log(state);
			const payload = {...request, metadataReference: state};
			const {publications} = client;
			await publications.update({path: `publications/isbn-ismn/${request.id}`, payload: payload});
			logger.log('info', `Background processing State changed to ${state} for${request.id}`);
		}
	}

	async function processRequest({client, processCallback, messageCallback, query, filter = () => true}) {
		try {
			const {publications} = client;
			const response = await publications.fetchList({path: 'publications/isbn-ismn', query: query});
			const res = await response.json();

			let requestsTotal = 0;
			const pendingProcessors = [];

			if (res.results) {
				const filteredRequests = res.results.filter(filter);
				requestsTotal += filteredRequests.length;
				pendingProcessors.push(processCallback(filteredRequests));
			}

			if (messageCallback) {
				logger.log('debug', messageCallback(requestsTotal));
			}

			return pendingProcessors;
		} catch (err) {
			return err;
		}
	}
}
