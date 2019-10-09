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
import {URL} from 'url';
import nodemailer from 'nodemailer';
import stringTemplate from 'string-template-js';
import {
	API_URL,
	JOB_USER_REQUEST_STATE_NEW,
	JOB_USER_REQUEST_STATE_ACCEPTED,
	JOB_USER_REQUEST_STATE_REJECTED,
	JOB_PUBLISHER_REQUEST_STATE_NEW,
	JOB_PUBLISHER_REQUEST_STATE_ACCEPTED,
	JOB_PUBLISHER_REQUEST_STATE_REJECTED,
	JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW,
	JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED,
	JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED,
	JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW,
	JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED,
	JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED,
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

	agenda.define(JOB_USER_REQUEST_STATE_NEW, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'new', 'users');
	});
	agenda.define(JOB_USER_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'accepted', 'users');
	});
	agenda.define(JOB_USER_REQUEST_STATE_REJECTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'rejected', 'users');
	});

	agenda.define(JOB_PUBLISHER_REQUEST_STATE_NEW, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'new', 'publishers');
	});
	agenda.define(JOB_PUBLISHER_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'accepted', 'publishers');
	});
	agenda.define(JOB_PUBLISHER_REQUEST_STATE_REJECTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'rejected', 'publishers');
	});

	agenda.define(JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'new', 'publications', 'isbn-ismn');
	});
	agenda.define(JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'accepted', 'publications', 'isbn-ismn');
	});
	agenda.define(JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'rejected', 'publications', 'isbn-ismn');
	});

	agenda.define(JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'new', 'publications', 'issn');
	});
	agenda.define(JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'accepted', 'publications', 'issn');
	});
	agenda.define(JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED, {concurrency: 1}, async (job, done) => {
		await request(job, done, 'rejected', 'publications', 'issn');
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
				client, processCallback,
				query: {queries: [{query: {state: state, backgroundProcessingState: 'pending'}}], offset: null},
				messageCallback: count => `${count} requests are pending`, type: type, subtype: subtype
			});
		}
	}

	async function processCallback(requests, type, subtype) {
		await Promise.all(requests.map(async request => {
			await setBackground(request, type, subtype, 'inProgress');
			switch (request.state) {
				case 'new':
					if (type !== 'users') {
						await sendEmail(`${type} request new`);
					}

					await setBackground(request, type, subtype, 'processed');
					break;

				case 'rejected':
					if (type !== 'users') {
						await sendEmail(`${type} request rejected`, request);
					}

					await setBackground(request, type, subtype, 'processed');
					break;

				case 'accepted':
					try {
						await createResource(request, type, subtype);
					} catch (error) {
						logger.log('error', `${error}`);
						break;
					}

					if (type !== 'users') {
						await sendEmail(`${type} request accepted`);
					}

					await setBackground(request, type, subtype, 'processed');
					break;

				default:
					break;
			}
		}));

		async function setBackground(request, type, subtype, state) {
			const payload = {...request, backgroundProcessingState: state};
			const {requests} = client;
			switch (type) {
				case 'users':
					await requests.update({path: `requests/${type}/${request.id}`, payload: {...payload, initialRequest: true}});
					break;
				case 'publishers':
					await requests.update({path: `requests/${type}/${request.id}`, payload: payload});
					break;
				case 'publications':
					await requests.update({path: `requests/${type}/${subtype}/${request.id}`, payload: payload});
					break;

				default:
					break;
			}

			logger.log('info', `Background processing State changed to ${state} for${request.id}`);
		}
	}

	async function processRequest({client, processCallback, messageCallback, query, type, subtype, filter = () => true}) {
		try {
			let response;
			let res;
			const {requests} = client;
			switch (type) {
				case 'users':
					response = await requests.fetchList({path: `requests/${type}`, query: query});
					res = await response.json();
					break;
				case 'publishers':
					response = await requests.fetchList({path: `requests/${type}`, query: query});
					res = await response.json();
					break;
				case 'publications':
					response = await requests.fetchList({path: `requests/${type}/${subtype}`, query: query});
					res = await response.json();
					break;

				default:
					break;
			}

			let requestsTotal = 0;
			const pendingProcessors = [];

			if (res.results) {
				const filteredRequests = res.results.filter(filter);
				requestsTotal += filteredRequests.length;
				pendingProcessors.push(processCallback(filteredRequests, type, subtype));
			}

			if (messageCallback) {
				logger.log('debug', messageCallback(requestsTotal));
			}

			return pendingProcessors;
		} catch (err) {
			return err;
		}
	}

	async function sendEmail(name, request) {
		const parseUrl = new URL(SMTP_URL);
		const templateCache = {};
		const query = {queries: [{query: {name: name}}], offset: null};
		const messageTemplate = await getTemplate(query, templateCache);
		let body = Buffer.from(messageTemplate.body, 'base64').toString('utf8');
		const newBody = request ?
			stringTemplate.replace(body, {rejectionReason: request.rejectionReason}) :
			stringTemplate.replace(body);

		let transporter = nodemailer.createTransport({
			host: parseUrl.hostname,
			port: parseUrl.port,
			secure: false
		});

		await transporter.sendMail({
			from: 'test@test.com',
			to: API_EMAIL,
			replyTo: 'test@test.com',
			subject: messageTemplate.subject,
			text: newBody
		}, (error, info) => {
			if (error) {
				logger.log('error', `${error}`);
			}

			logger.log('info', `${info.response}`);
		});
	}

	async function createResource(request, type, subtype) {
		const {update} = client.requests;
		switch (type) {
			case 'users':
				await update({path: `requests/${type}/${request.id}`, payload: await create(request, type, subtype)});
				logger.log('info', `${type} requests updated for ${request.id} `);
				break;
			case 'publishers':
				await update({path: `requests/${type}/${request.id}`, payload: await create(request, type, subtype)});
				logger.log('info', `${type} requests updated for ${request.id} `);
				break;
			case 'publications':
				await update({path: `requests/${type}/${subtype}/${request.id}`, payload: await create(request, type, subtype)});
				logger.log('info', `${type}${subtype} requests updated for ${request.id} `);
				break;

			default:
				break;
		}

		return null;
	}

	function formatPublisherRequest(request) {
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
		return formatRequest;
	}

	function formatPublication(request) {
		const {backgroundProcessingState, state, notes, publisher, lastUpdated, role, ...rest} = {...request};
		const formatRequest = {
			...rest
		};
		return formatRequest;
	}

	function formatUsersRequest(request) {
		const {backgroundProcessingState, state, lastUpdated, ...rest} = {...request};
		const formatRequest = {...rest};
		return formatRequest;
	}

	async function create(request, type, subtype) {
		let response;
		const {users, publishers, publications} = client;
		switch (type) {
			case 'users':
				response = await users.create({path: type, payload: formatUsersRequest(request)});
				logger.log('info', `Resource for ${type} has been created`);
				break;
			case 'publishers':
				response = await publishers.create({path: type, payload: formatPublisherRequest(request)});
				logger.log('info', `Resource for ${type} has been created`);
				break;

			case 'publications':
				response = await publications.create({path: `${type}/${subtype}`, payload: formatPublication(request)});
				logger.log('info', `Resource for ${type}${subtype} has been created`);
				break;

			default:
				break;
		}

		const newRequest = {...request, createdResource: response};
		return newRequest;
	}

	async function getTemplate(query, cache) {
		const key = JSON.stringify(query);
		if (key in cache) {
			return cache[key];
		}

		cache[key] = await client.templates.getTemplate(query);
		return cache[key];
	}
}
