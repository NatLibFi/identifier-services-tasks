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

export const MAX_CONCURRENCY = readEnvironmentVariable('MAX_CONCURRENCY', {defaultValue: '1'});

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

const JOB_FREQ_REQUEST_STATE_NEW = readEnvironmentVariable('JOB_FREQ_REQUEST_STATE_NEW', {defaultValue: '10 seconds'});
const JOB_FREQ_REQUEST_STATE_REJECTED = readEnvironmentVariable('JOB_FREQ_REQUEST_STATE_REJECTED', {defaultValue: '10 seconds'});
const JOB_FREQ_REQUEST_STATE_ACCEPTED = readEnvironmentVariable('JOB_FREQ_REQUEST_STATE_ACCEPTED', {defaultValue: '10 seconds'});
const JOB_FREQ_PENDING = readEnvironmentVariable('JOB_FREQ_PENDING', {defaultValue: '10 seconds'});
const JOB_FREQ_IN_PROGRESS = readEnvironmentVariable('JOB_FREQ_IN_PROGRESS', {defaultValue: '10 seconds'});

export const JOB_BACKGROUND_PROCESSING_PENDING = 'pending';
export const JOB_BACKGROUND_PROCESSING_IN_PROGRESS = 'inProgress';
export const JOB_BACKGROUND_PROCESSING_PROCESSED = 'processed';

export const REQUEST_TTL = readEnvironmentVariable('REQUEST_TTL', {defaultValue: '30 seconds'});

export const REQUEST_JOBS = [
  {jobFreq: JOB_FREQ_REQUEST_STATE_NEW, jobName: 'JOB_USER_REQUEST_STATE_NEW', jobCategory: 'users', jobState: 'new'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_ACCEPTED, jobName: 'JOB_USER_REQUEST_STATE_ACCEPTED', jobCategory: 'users', jobState: 'accepted'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_REJECTED, jobName: 'JOB_USER_REQUEST_STATE_REJECTED', jobCategory: 'users', jobState: 'rejected'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_NEW, jobName: 'JOB_PUBLISHER_REQUEST_STATE_NEW', jobCategory: 'publishers', jobState: 'new'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_ACCEPTED, jobName: 'JOB_PUBLISHER_REQUEST_STATE_ACCEPTED', jobCategory: 'publishers', jobState: 'accepted'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_REJECTED, jobName: 'JOB_PUBLISHER_REQUEST_STATE_REJECTED', jobCategory: 'publishers', jobState: 'rejected'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_NEW, jobName: 'JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW', jobCategory: 'publications', jobSubCat: 'issn', jobState: 'new'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_ACCEPTED, jobName: 'JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED', jobCategory: 'publications', jobSubCat: 'issn', jobState: 'accepted'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_REJECTED, jobName: 'JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED', jobCategory: 'publications', jobSubCat: 'issn', jobState: 'rejected'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_NEW, jobName: 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW', jobCategory: 'publications', jobSubCat: 'isbn-ismn', jobState: 'new'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_ACCEPTED, jobName: 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED', jobCategory: 'publications', jobSubCat: 'isbn-ismn', jobState: 'accepted'},
  {jobFreq: JOB_FREQ_REQUEST_STATE_REJECTED, jobName: 'JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED', jobCategory: 'publications', jobSubCat: 'isbn-ismn', jobState: 'rejected'}
];

export const CLEAN_UP_JOBS = [
  {jobFreq: REQUEST_TTL, jobName: 'JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS', jobCategory: 'publishers'},
  {jobFreq: REQUEST_TTL, jobName: 'JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN', jobCategory: 'publications', jobSubCat: 'isbn-ismn'},
  {jobFreq: REQUEST_TTL, jobName: 'JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN', jobCategory: 'publications', jobSubCat: 'issn'}
];

export const MELINDA_JOBS = [
  {jobFreq: JOB_FREQ_PENDING, jobName: 'JOB_PUBLICATION_ISBN_ISMN_BIBLIOGRAPHIC_METADATA_PENDING', jobCategory: 'isbn-ismn', jobState: 'pending'},
  {jobFreq: JOB_FREQ_IN_PROGRESS, jobName: 'JOB_PUBLICATION_ISBN_ISMN_BIBLIOGRAPHIC_METADATA_INPROGRESS', jobCategory: 'isbn-ismn', jobState: 'inProgress'},
  {jobFreq: JOB_FREQ_PENDING, jobName: 'JOB_PUBLICATION_ISSN_BIBLIOGRAPHIC_METADATA_PENDING', jobCategory: 'issn', jobState: 'pending'},
  {jobFreq: JOB_FREQ_IN_PROGRESS, jobName: 'JOB_PUBLICATION_ISSN_BIBLIOGRAPHIC_METADATA_INPROGRESS', jobCategory: 'issn', jobState: 'inProgress'}
];
