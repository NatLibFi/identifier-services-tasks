/**
 *
 * @licstart  The following is the entire license notice for the JavaScript code in this file.
 *
 * UI microservice of Identifier Services
 *
 * Copyright (C) 2019 University Of Helsinki (The National Library Of Finland)
 *
 * This file is part of identifier-services-ui
 *
 * identifier-services-ui program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * identifier-services-ui is distributed in the hope that it will be useful,
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
import HttpStatus from 'http-status';
import fetch from 'node-fetch';
import {ApiError} from '@natlibfi/identifier-services-commons';

const {generateAuthorizationHeader} = Utils;

export function createApiClient({url, username, password}) {
	let authHeader;

	return {
		create,
		get,
		reform,
		getTemplate
	};

	function create() {
		return {
			publisher,
			publisherRequest,
			publication
		};

		async function publisher({request}) {
			const PATH = `${url}/publishers`;
			await creation({PATH, request});
		}

		async function publisherRequest({request}) {
			const PATH = `${url}/requests/publishers`;
			await creationRequest({PATH, request});
		}

		function publication() {
			return {
				isbnIsmn,
				issn
			};

			async function isbnIsmn({request}) {
				const PATH = `${url}/publications/isbn-ismn`;
				await creationRequest({PATH, request});
			}

			async function issn({request}) {
				const PATH = `${url}/publications/issn`;
				await creationRequest({PATH, request});
			}
		}
	}

	function get() {
		return {
			publisherRequest,
			publishersRequestsList,
			publicationRequestList
		};

		async function publishersRequestsList(query) {
			const PATH = `${url}/requests/publishers/query`;
			const result = await fetchUnauthenticate({PATH, query});
			return result;
		}

		async function publisherRequest({id}) {
			const PATH = `${url}/requests/publishers/${id}`;
			const result = await fetchAuthenticate({PATH});
			return result;
		}

		function publicationRequestList() {
			return {
				isbnIsmn,
				issn
			};

			async function isbnIsmn(query) {
				const PATH = `${url}/requests/publications/isbn-ismn/query`;
				const result = await fetchAuthenticateList({PATH, query});
				return result;
			}

			async function issn(query) {
				const PATH = `${url}/requests/publications/issn/query`;
				const result = await fetchAuthenticateList({PATH, query});
				return result;
			}
		}
	}

	function reform() {
		return {
			publisherRequest,
			publicationRequest
		};

		async function publisherRequest({id, payload}) {
			const PATH = `${url}/requests/publishers/${id}`;
			const result = await update({PATH, payload});
			return result;
		}

		function publicationRequest() {
			return {
				isbnIsmn,
				issn
			};

			async function isbnIsmn({id, payload}) {
				const PATH = `${url}/requests/publications/isbn-ismn/${id}`;
				const result = await update({PATH, payload});
				return result;
			}

			async function issn({id, payload}) {
				const PATH = `${url}/requests/publications/issn/${id}`;
				const result = await update({PATH, payload});
				return result;
			}
		}
	}

	async function creation({PATH, request}) {
		const response = await doRequest(PATH, {
			method: 'POST',
			body: JSON.stringify(request),
			headers: {
				'Content-type': 'application/json'
			}

		});
		if (response.status === HttpStatus.CREATED) {
			const result = await response.json();
			return result;
		}

		throw new ApiError(response.status);
	}

	async function creationRequest({PATH, request}) {
		const response = await doRequest(PATH, {
			method: 'POST',
			body: request,
			headers: {
				'Content-type': 'application/json'
			}

		});

		if (response.statues === HttpStatus.CREATED) {
			return parseRequestId();
		}

		throw new ApiError(response.status);

		function parseRequestId() {
			return /\/(.[^/]*)$/.exec(response.headers.get('location'))[1];
		}
	}

	async function fetchUnauthenticate({PATH, query}) {
		const response = await doRequest(PATH, {
			method: 'POST',
			body: JSON.stringify(query),
			headers: {
				'Content-type': 'application/json'
			}
		});
		return response;
	}

	async function fetchAuthenticate({PATH}) {
		const response = await doRequest(PATH, {
			headers: {
				Accept: 'application/json'
			}
		});

		if (response.status === HttpStatus.OK) {
			return new ApiError(response.status);
		}
	}

	async function fetchAuthenticateList({PATH, query}) {
		const response = await doRequest(PATH, {
			method: 'POST',
			body: JSON.stringify(query),
			headers: {
				Accept: 'application/json',
				'Content-type': 'application/json'
			}
		});
		return response;
	}

	async function update({payload, PATH}) {
		const response = await doRequest(PATH, {
			method: 'PUT',
			body: JSON.stringify(payload),
			headers: {
				'Content-Type': 'application/json'
			}
		});
		if (response.status === HttpStatus.OK) {
			return response.status;
		}

		throw new ApiError(response.status);
	}

	async function getTemplate(query) {
		const response = await doRequest(`${url}/templates/query`, {
			method: 'POST',
			body: JSON.stringify(query),
			headers: {
				'Content-type': 'application/json'
			}
		});
		if (response.status === HttpStatus.OK) {
			const res = await response.json();
			const template = res.results.filter(item => item.id);
			const result = await getTemplateDetail(template[0].id);
			return result;
		}

		async function getTemplateDetail(id) {
			const response = await doRequest(`${url}/templates/${id}`, {
				headers: {
					Accept: 'application/json'
				}
			});
			if (response.status === HttpStatus.OK) {
				const result = await response.json();
				return result;
			}
		}
	}

	async function doRequest(reqUrl, reqOptions) {
		const options = {headers: {}, ...reqOptions};

		if (authHeader) {
			options.headers.Authorization = authHeader;
			const response = await fetch(reqUrl, options);
			if (response.status === HttpStatus.UNAUTHORIZED) {
				const token = await getAuthToken();
				authHeader = `Authorization: Bearer ${token}`;
				options.headers.Authorization = authHeader;

				return fetch(reqUrl, options);
			}

			return response;
		}

		const token = await getAuthToken();
		authHeader = `Bearer ${token}`;
		options.headers.Authorization = authHeader;

		const result = await fetch(reqUrl, options);
		return result;

		async function getAuthToken() {
			const encodedCreds = generateAuthorizationHeader(username, password);
			const response = await fetch(`${url}/auth`, {
				method: 'POST',
				headers: {
					Authorization: encodedCreds
				}
			});

			if (response.status === HttpStatus.NO_CONTENT) {
				return response.headers.get('Token');
			}

			throw new ApiError(response.status);
		}
	}
}

