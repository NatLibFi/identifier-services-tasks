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
		publishers: {
			create,
			update,
			getTemplate
		},
		publications: {
			create,
			update
		},
		requests: {
			fetchList,
			create,
			update
		},
		templates: {
			getTemplate
		}

	};

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

	async function create({path, payload}) {
		const response = await doRequest(`${url}/${path}`, {
			method: 'POST',
			body: JSON.stringify(payload),
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

	async function fetchList({path, query}) {
		const response = await doRequest(`${url}/${path}/query`, {
			method: 'POST',
			body: JSON.stringify(query),
			headers: {
				'Content-type': 'application/json'
			}
		});

		if (response.status === HttpStatus.FORBIDDEN || response.status === HttpStatus.UNAUTHORIZED) {
			return fetchAuthenticateList({path, query});
		}

		return response;
	}

	async function fetchAuthenticateList({path, query}) {
		const response = await doRequest(`${url}/${path}/query`, {
			method: 'POST',
			body: JSON.stringify(query),
			headers: {
				Accept: 'application/json',
				'Content-type': 'application/json'
			}
		});
		return response;
	}

	async function update({path, payload}) {
		const response = await doRequest(`${url}/${path}`, {
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

