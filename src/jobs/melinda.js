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

import {Utils, createApiClient} from '@natlibfi/identifier-services-commons';
import {createApiClient as melindaCreateApiClient} from '@natlibfi/melinda-record-import-commons';
import {
	API_URL,
	MELINDA_RECORD_IMPORT_URL,
	JOB_BACKGROUND_PROCESSING_PENDING,
	JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
	JOB_BACKGROUND_PROCESSING_PROCESSED,
	MELINDA_JOBS,
	API_CLIENT_USER_AGENT,
	API_PASSWORD,
	API_USERNAME,
	MELINDA_RECORD_IMPORT_USERNAME,
	MELINDA_RECORD_IMPORT_PROFILE,
	MELINDA_RECORD_IMPORT_PASSWORD
} from '../config';

const {createLogger} = Utils;

export default function (agenda) {
	const logger = createLogger();

	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	const melindaClient = melindaCreateApiClient({
		url: MELINDA_RECORD_IMPORT_URL, username: MELINDA_RECORD_IMPORT_USERNAME, password: MELINDA_RECORD_IMPORT_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	MELINDA_JOBS.forEach(job => {
		agenda.define(job.jobName, {concurrency: 1}, async (_, done) => {
			request(done, job.jobState, job.jobCategory);
		});
	});

	async function request(done, state, type) {
		try {
			await getRequests();
		} finally {
			done();
		}

		async function getRequests() {
			await processRequest({
				client, processCallback,
				query: {queries: [{query: {metadataReference: {state: state}}}], offset: null},
				messageCallback: count => `${count} requests are ${state}`,
				state: state,
				type: type
			});
		}
	}

	async function processRequest({client, processCallback, messageCallback, query, state, type}) {
		const {publications} = client;
		return perform();
		async function perform() {
			const response = await publications.fetchList({path: `publications/${type}`, query: query});
			const result = await response.json();
			if (result.results) {
				logger.log('debug', messageCallback(result.results.length));
				return processCallback(result.results, state, type);
			}
		}
	}

	async function processCallback(requests, state, type) {
		if (state === JOB_BACKGROUND_PROCESSING_PENDING) {
			await Promise.all(requests.map(async request => {
			console.log('1111111111111111', requests)
				// Create a new blob in Melinda's record import system
				const blobId = await melindaClient.createBlob({
					blob: JSON.stringify(requests),
					type: 'application/json',
					profile: MELINDA_RECORD_IMPORT_PROFILE
				});
				logger.log('info', `Created new blob ${blobId}`);
				await setBackground(request, JOB_BACKGROUND_PROCESSING_IN_PROGRESS, blobId, type);
			}));
			return;
		}

		if (state === JOB_BACKGROUND_PROCESSING_IN_PROGRESS) {
			await Promise.all(requests.map(async request => {
				// ==> Retrieve the blob metadata from Melinda's record import system
				const blobId = request.metadataReference.id;
				const response = await melindaClient.getBlobMetadata({id: blobId});
				console.log('eddddddddddddd', response)
				if (response.state === 'PROCESSED') {
					if (response.processingInfo.importResults[0].status === 'DUPLICATE') {
						const newId = response.processingInfo.importResults[0].metadata.matches[0];
						await setBackground(request, JOB_BACKGROUND_PROCESSING_PROCESSED, newId, type);
					} else {
						const newId = response.processingInfo.importResults[0].metadata.id;
						await setBackground(request, JOB_BACKGROUND_PROCESSING_PROCESSED, newId, type);
					}
				}
			}));
		}

		async function setBackground(request, state, blobId, type) {
			const payload = {...request, metadataReference: {state: state, id: blobId && blobId}};
			const {publications} = client;
			await publications.update({path: `publications/${type}/${request.id}`, payload: payload});
			logger.log('info', `Background processing State changed to ${state} for${request.id}`);
		}
	}
}
