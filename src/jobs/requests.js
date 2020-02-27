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
import fs from 'fs';
import {JWE, JWK, JWT} from 'jose';
import {createApiClient} from '@natlibfi/identifier-services-commons';
import {
	UI_URL,
	API_URL,
	SMTP_URL,
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
	PRIVATE_KEY_URL,
	API_EMAIL
} from '../config';

const {createLogger, sendEmail} = Utils;

export default function (agenda) {
	const logger = createLogger();

	const client = createApiClient({
		url: API_URL, username: API_USERNAME, password: API_PASSWORD,
		userAgent: API_CLIENT_USER_AGENT
	});

	agenda.define(JOB_USER_REQUEST_STATE_NEW, {concurrency: 1}, async (_, done) => {
		request(done, 'new', 'users');
	});
	agenda.define(JOB_USER_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (_, done) => {
		request(done, 'accepted', 'users');
	});
	agenda.define(JOB_USER_REQUEST_STATE_REJECTED, {concurrency: 1}, async (_, done) => {
		request(done, 'rejected', 'users');
	});

	agenda.define(JOB_PUBLISHER_REQUEST_STATE_NEW, {concurrency: 1}, async (_, done) => {
		request(done, 'new', 'publishers');
	});
	agenda.define(JOB_PUBLISHER_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (_, done) => {
		request(done, 'accepted', 'publishers');
	});
	agenda.define(JOB_PUBLISHER_REQUEST_STATE_REJECTED, {concurrency: 1}, async (_, done) => {
		request(done, 'rejected', 'publishers');
	});

	agenda.define(JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW, {concurrency: 1}, async (_, done) => {
		request(done, 'new', 'publications', 'isbn-ismn');
	});
	agenda.define(JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (_, done) => {
		request(done, 'accepted', 'publications', 'isbn-ismn');
	});
	agenda.define(JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED, {concurrency: 1}, async (_, done) => {
		request(done, 'rejected', 'publications', 'isbn-ismn');
	});

	agenda.define(JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW, {concurrency: 1}, async (_, done) => {
		request(done, 'new', 'publications', 'issn');
	});
	agenda.define(JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED, {concurrency: 1}, async (_, done) => {
		request(done, 'accepted', 'publications', 'issn');
	});
	agenda.define(JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED, {concurrency: 1}, async (_, done) => {
		request(done, 'rejected', 'publications', 'issn');
	});

	async function request(done, state, type, subtype) {
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
						await sendEmail({
							name: `${type} request new`,
							getTemplate: getTemplate,
							SMTP_URL: SMTP_URL,
							API_EMAIL: await getUserEmail(request.creator)
						});
					}

					await sendEmail({
						name: `${type} request new`,
						getTemplate: getTemplate,
						SMTP_URL: SMTP_URL,
						API_EMAIL: API_EMAIL
					});
					await setBackground(request, type, subtype, 'processed');
					break;

				case 'rejected':
					await sendEmail({
						name: `${type} request rejected`,
						args: request.rejectionReason,
						getTemplate: getTemplate,
						SMTP_URL: SMTP_URL,
						API_EMAIL: await getUserEmail(request.creator)
					});
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
						await sendEmail({
							name: `${type} request accepted`,
							getTemplate: getTemplate,
							SMTP_URL: SMTP_URL,
							API_EMAIL: await getUserEmail(request.creator)
						});
					}

					await setBackground(request, type, subtype, 'processed');
					break;

				default:
					break;
			}
		}));

		async function setBackground(request, type, subtype, state) {
			const payload = {...request, backgroundProcessingState: state};
			delete payload.id;
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

	async function processRequest({client, processCallback, messageCallback, query, type, subtype}) {
		const {requests} = client;
		return perform();
		async function perform() {
			if (type === 'users' || type === 'publishers') {
				const response = await requests.fetchList({path: `requests/${type}`, query: query});
				const result = await response.json();
				if (result.results) {
					logger.log('debug', messageCallback(result.results.length));
					return processCallback(result.results, type, subtype);
				}
			}

			if (type === 'publications') {
				const response = await requests.fetchList({path: `requests/${type}/${subtype}`, query: query});
				const result = await response.json();
				if (result.results) {
					logger.log('debug', messageCallback(result.results.length));
					return processCallback(result.results, type, subtype);
				}
			}
		}
	}

	async function createResource(request, type, subtype) {
		const {update} = client.requests;
		const payload = await create(request, type, subtype);

		delete payload.id;
		switch (type) {
			case 'users':
				await update({path: `requests/${type}/${request.id}`, payload: payload});
				logger.log('info', `${type} requests updated for ${request.id} `);
				break;
			case 'publishers':
				await update({path: `requests/${type}/${request.id}`, payload: payload});
				logger.log('info', `${type} requests updated for ${request.id} `);
				break;
			case 'publications':
				await update({path: `requests/${type}/${subtype}/${request.id}`, payload: payload});
				logger.log('info', `${type}${subtype} requests updated for ${request.id} `);
				break;

			default:
				break;
		}

		return null;
	}

	function formatPublisher(request) {
		const {backgroundProcessingState, state, rejectionReason, creator, notes, createdResource, id, ...rest} = {...request};
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
		const {backgroundProcessingState, state, rejectionReason, creator, notes, lastUpdated, id, role, ...rest} = {...request};
		const formatRequest = {
			...rest
		};

		return formatRequest;
	}

	function formatUsers(request) {
		const {mongoId, backgroundProcessingState, state, rejectionReason, creator, lastUpdated, ...rest} = {...request};
		const formatRequest = {...rest};
		return formatRequest;
	}

	async function create(request, type, subtype) {
		const rangeQueries = {queries: [{query: {active: true}}], offset: null};
		const {users, publishers, publications, ranges} = client;
		const {update} = client.requests;
		switch (type) {
			case 'users': {
				await users.create({path: type, payload: formatUsers(request)});
				const response = await users.read(`${type}/${request.email}`);
				await sendEmailToCreator(type, request, response);
				await createLinkAndSendEmail(type, request, response);
				logger.log('info', `Resource for ${type} has been created`);
				delete response._id;
				const newRequest = {...request, ...response};
				return newRequest;
			}

			case 'publishers': {
				const response = await publishers.create({path: type, payload: formatPublisher(request)});
				logger.log('info', `Resource for ${type} has been created`);
				delete response._id;
				const newRequest = {...request, ...response};
				return newRequest;
			}

			case 'publications': {
				// Fetch ranges
				const identifierLists = await determineIdentifierList();
				if (identifierLists.results.length === 0) {
					logger.log('info', 'No Active Ranges Found');
				} else {
					const activeRange = identifierLists.results[0];
					// Fetch Publication Issn
					const resPublication = await publications.fetchList({path: `publications/${subtype}`, query: {queries: [{query: {associatedRange: activeRange.id}}], offset: null}});
					const publicationList = await resPublication.json();

					const newPublication = await calculateNewIdentifier({identifierList: publicationList.results.map(item => item.identifier), subtype: subtype});
					const response = await publications.create({path: `${type}/${subtype}`, payload: formatPublication({...request, associatedRange: activeRange.id, identifier: newPublication})});
					delete response._id;
					const newRequest = {...request, ...response};
					logger.log('info', `Resource for ${type}${subtype} has been created`);
					if (subtype === 'issn') {
						isLastInRange(newPublication, activeRange, update, subtype);
					}

					return newRequest;
				}

				break;
			}

			default: {
				return null;
			}
		}

		async function determineIdentifierList() {
			if (subtype === 'isbn-ismn') {
				if (request.type === 'music') {
					const resultIsmn = await identifierLists('ismn');
					return resultIsmn;
				}

				const resultIsbn = await identifierLists('isbn');
				return resultIsbn;
			}

			const resultIssn = await identifierLists('issn');
			return resultIssn;

			async function identifierLists(v) {
				const response = await ranges.fetchList({path: `ranges/${v}`, query: rangeQueries});
				return response.json();
			}
		}
	}

	async function isLastInRange(newPublication, activeRange, update, subtype) {
		if (newPublication.slice(5, 8) === activeRange.rangeEnd) {
			const payload = {...activeRange, active: false};
			delete payload.id;
			const res = await update({path: `ranges/${subtype}/${activeRange.id}`, payload: payload});
			if (res === 200) {
				await sendEmailToAdministrator();
			}
		}
	}

	async function sendEmailToAdministrator() {
		const result = await sendEmail({
			name: 'reply to a creator', // Need to create its own template later *****************
			getTemplate: getTemplate,
			SMTP_URL: SMTP_URL,
			API_EMAIL: API_EMAIL
		});
		return result;
	}

	async function sendEmailToCreator(type, request, response) {
		const result = await sendEmail({
			name: 'reply to a creator',
			args: response,
			getTemplate: getTemplate,
			SMTP_URL: SMTP_URL,
			API_EMAIL: await getUserEmail(request.creator)
		});
		return result;
	}

	async function calculateNewIdentifier({identifierList, subtype}) {
		switch (subtype) {
			case 'issn':
				return calculateNewISSN(identifierList);
			case 'isbnIsmn':
				return 'newIdentifier';
			default:
				return null;
		}
	}

	function calculateNewISSN(array) {
		// Get prefix from array of publication ISSN identifiers assuming same prefix at the moment
		const prefix = array[0].slice(0, 4);
		const slicedRange = array.map(item => item.slice(5, 8));
		// Get 3 digit of 2nd half from the highest identifier and adding 1 to it
		const range = Math.max(...slicedRange) + 1;
		return calculate(prefix, range);

		function calculate(prefix, range) {
			// Calculation(multiplication and addition of digits)
			const combine = prefix.concat(range).split('');
			const sum = combine.reduce((acc, item, index) => {
				const m = ((combine.length + 1) - index) * item;
				acc = Number(acc) + Number(m);
				return acc;
			}, 0);

			// Get the remainder and calculate it to return the actual check digit
			const remainder = sum % 11;
			if (remainder === 0) {
				const checkDigit = '0';
				const result = `${prefix}-${range}${checkDigit}`;
				return result;
			}

			const diff = 11 - remainder;
			const checkDigit = diff === 10 ? 'X' : diff.toString();
			const result = `${prefix}-${range}${checkDigit}`;
			return result;
		}
	}

	async function createLinkAndSendEmail(type, request, response) {
		const key = JWK.asKey(fs.readFileSync(PRIVATE_KEY_URL, 'utf-8'));

		const privateData = {
			userId: request.userId,
			id: request.id
		};

		const payload = JWT.sign(privateData, key, {
			expiresIn: '24 hours',
			iat: true
		});

		const token = await JWE.encrypt(payload, key, {kid: key.kid});

		const link = `${UI_URL}/${type}/passwordReset/${token}`;
		const result = await sendEmail({
			name: 'change password',
			args: {link: link, ...response},
			getTemplate: getTemplate,
			SMTP_URL: SMTP_URL,
			API_EMAIL: response.emails[0].value
		});
		return result;
	}

	async function getTemplate(query, cache) {
		const key = JSON.stringify(query);
		if (key in cache) {
			return cache[key];
		}

		cache[key] = await client.templates.getTemplate(query);
		return cache[key];
	}

	async function getUserEmail(userId) {
		const {users} = client;
		const readResponse = await users.read(`users/${userId}`);
		return readResponse.emails[0].value;
	}
}
