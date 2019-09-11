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
import url from 'url';
import nodemailer from 'nodemailer';
import {
	API_URL,
	JOB_REQUEST_STATE_NEW,
	JOB_REQUEST_STATE_ACCEPTED,
	JOB_REQUEST_STATE_REJECTED,
	API_CLIENT_USER_AGENT,
	API_PASSWORD,
	API_USERNAME,
	SMTP_URL,
	API_EMAIL
} from '../config';

const {createLogger} = Utils;

export default function (agenda) {
	const logger = createLogger();

	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	agenda.define(JOB_REQUEST_STATE_NEW, {concurrency: 1}, request);
	agenda.define(JOB_REQUEST_STATE_ACCEPTED, {concurrency: 1}, request);
	agenda.define(JOB_REQUEST_STATE_REJECTED, {concurrency: 1}, request);

	async function request(job, done) {
		try {
			await getRequests();
		} finally {
			done();
		}

		async function getRequests() {
			await processRequest({
				client, processCallback,
				query: {queries: [{query: {state: job.attrs.name, backgroundProcessingState: 'pending'}}], offset: null},
				messageCallback: count => `${count} requests are pending`
			});
		}
	}

	async function processCallback(requests) {
		await Promise.all(requests.map(async request => {
			setBackground(request, 'inProgress');
			switch (request.state) {
				case 'new':
					return (
						await sendEmail('Request Status Notification', 'Current status of your request:  "in Progress"'),
						setBackground(request, 'processed')
					);

				case 'rejected':
					return (
						// Await sendEmail(`Request Status Notification', 'Current status:  "Rejected", Rejected reason: ${request.rejectionReason}`),
						setBackground(request, 'processed')
					);

				case 'accepted':
					return (
						await createResource(request),
						// Await sendEmail('Request Status Notification', 'Current status of your request:  "Accepted"'),
						setBackground(request, 'processed')
					);

				default:
					return null;
			}
		}));

		function setBackground(request, state) {
			const payload = {...request, backgroundProcessingState: state};
			client.updatePublisherRequest({id: request.id, payload: payload});
			logger.log('info', `Background processing State changed to ${state} for${request.id}`);
		}
	}

	async function processRequest({client, processCallback, messageCallback, query, filter = () => true}) {
		try {
			const response = await client.fetchPublishersRequestsList(query);
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

	async function sendEmail(subject, message) {
		const parseUrl = url.parse(SMTP_URL);
		let transporter = nodemailer.createTransport({
			host: parseUrl.hostname,
			port: parseUrl.port,
			secure: false
		});

		await transporter.sendMail({
			from: 'test@test.com',
			to: API_EMAIL,
			replyTo: 'test@test.com',
			subject: subject,
			text: message
		}, (error, info) => {
			if (error) {
				console.log(error);
			}

			console.log(info.response);
		});
	}

	async function createResource(request) {
		const {backgroundProcessingState, state, rejectionReason, notes, createdResource, ...rest} = {...request};
		const formatRequest = {
			...rest,
			primaryContact: request.primaryContact.map(item => item.email),
			activity: {
				active: true,
				yearInactivated: 0
			},
			metadataDelivery: 'manual'
		};
		const response = await client.publisherCreation({request: formatRequest});
		const newRequest = {...request, createdResource: response};
		client.updatePublisherRequest({id: request.id, payload: newRequest});
	}
}
