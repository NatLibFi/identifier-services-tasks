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

const {readEnvironmentVariable} = Utils;

export const TZ = readEnvironmentVariable('TZ', {defaultValue: ''});

export const MONGO_URI = readEnvironmentVariable('MONGO_URI', {defaultValue: 'mongodb://127.0.0.1/db'});

export const API_URL = readEnvironmentVariable('API_URL', {defaultValue: 'http://localhost:8081'});
export const UI_URL = readEnvironmentVariable('UI_URL', {defaultValue: 'http://localhost:8080'});
export const MELINDA_RECORD_IMPORT_URL = readEnvironmentVariable('MELINDA_RECORD_IMPORT_URL');

export const SMTP_URL = readEnvironmentVariable('SMTP_URL');
export const PRIVATE_KEY_URL = readEnvironmentVariable('PRIVATE_KEY_URL');

export const API_CLIENT_USER_AGENT = readEnvironmentVariable('API_CLIENT_USER_AGENT', {defaultValue: '_RECORD-IMPORT-CONTROLLER'});
export const API_USERNAME = readEnvironmentVariable('API_USERNAME');
export const API_PASSWORD = readEnvironmentVariable('API_PASSWORD');
export const API_EMAIL = readEnvironmentVariable('API_EMAIL');

export const MELINDA_RECORD_IMPORT_USERNAME = readEnvironmentVariable('MELINDA_RECORD_IMPORT_USERNAME');
export const MELINDA_RECORD_IMPORT_PROFILE = readEnvironmentVariable('MELINDA_RECORD_IMPORT_PROFILE');
export const MELINDA_RECORD_IMPORT_PASSWORD = readEnvironmentVariable('MELINDA_RECORD_IMPORT_PASSWORD');

export const JOB_FREQ_REQUEST_STATE_NEW = readEnvironmentVariable('JOB_FREQ_REQUEST_STATE_NEW', {defaultValue: '10 seconds'});
export const JOB_FREQ_REQUEST_STATE_REJECTED = readEnvironmentVariable('JOB_FREQ_REQUEST_STATE_REJECTED', {defaultValue: '10 seconds'});
export const JOB_FREQ_REQUEST_STATE_ACCEPTED = readEnvironmentVariable('JOB_FREQ_REQUEST_STATE_ACCEPTED', {defaultValue: '10 seconds'});
export const JOB_FREQ_PENDING = readEnvironmentVariable('JOB_FREQ_PENDING', {defaultValue: '10 seconds'});
export const JOB_FREQ_IN_PROGRESS = readEnvironmentVariable('JOB_FREQ_IN_PROGRESS', {defaultValue: '10 seconds'});
export const JOB_FREQ_PROCESSED = readEnvironmentVariable('JOB_FREQ_PROCESSED', {defaultValue: '10 seconds'});

export const JOB_USER_REQUEST_STATE_NEW = 'JOB_USER_REQUEST_STATE_NEW';
export const JOB_USER_REQUEST_STATE_IN_PROGRESS = 'JOB_USER_REQUEST_STATE_IN_PROGRESS';
export const JOB_USER_REQUEST_STATE_REJECTED = 'JOB_USER_REQUEST_STATE_REJECTED';
export const JOB_USER_REQUEST_STATE_ACCEPTED = 'JOB_USER_REQUEST_STATE_ACCEPTED';

export const JOB_PUBLISHER_REQUEST_STATE_NEW = 'JOB_PUBLISHER_REQUEST_STATE_NEW';
export const JOB_PUBLISHER_REQUEST_STATE_IN_PROGRESS = 'JOB_PUBLISHER_REQUEST_STATE_IN_PROGRESS';
export const JOB_PUBLISHER_REQUEST_STATE_REJECTED = 'JOB_PUBLISHER_REQUEST_STATE_REJECTED';
export const JOB_PUBLISHER_REQUEST_STATE_ACCEPTED = 'JOB_PUBLISHER_REQUEST_STATE_ACCEPTED';

export const JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW = 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW';
export const JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_IN_PROGRESS = 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_IN_PROGRESS';
export const JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED = 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED';
export const JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED = 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED';

export const JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW = 'JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW';
export const JOB_PUBLICATION_ISSN_REQUEST_STATE_IN_PROGRESS = 'JOB_PUBLICATION_ISSN_REQUEST_STATE_IN_PROGRESS';
export const JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED = 'JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED';
export const JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED = 'JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED';

export const JOB_BACKGROUND_PROCESSING_PENDING = 'pending';
export const JOB_BACKGROUND_PROCESSING_IN_PROGRESS = 'inProgress';
export const JOB_BACKGROUND_PROCESSING_PROCESSED = 'processed';

export const JOB_BIBLIOGRAPHIC_METADATA_PENDING = 'JOB_BIBLIOGRAPHIC_METADATA_PENDING';
export const JOB_BIBLIOGRAPHIC_METADATA_INPROGRESS = 'JOB_BIBLIOGRAPHIC_METADATA_INPROGRESS';

export const JOB_PUBLISHER_REQUEST_STATE_NEW_CHECK = 'JOB_PUBLISHER_REQUEST_STATE_NEW_CHECK';
export const REQUEST_TTL = readEnvironmentVariable('REQUEST_TTL', {defaultValue: '10 seconds'});
