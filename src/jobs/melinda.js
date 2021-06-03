/* eslint-disable no-unused-expressions */
/* eslint-disable no-extra-parens */
/* eslint-disable no-nested-ternary */
/* eslint-disable max-statements */
/* eslint-disable functional/immutable-data */
/* eslint-disable no-useless-return */
/*
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
      await request(done, job.jobState, job.jobCategory);
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
        query: {queries: [{query: {metadataReference: {$elemMatch: {state}}}}], offset: null},
        messageCallback: count => `${count} requests for melinda are ${state}`,
        state,
        type
      });
    }
  }

  async function processRequest({client, processCallback, messageCallback, query, state, type}) {
    const {publications} = client;
    await perform();
    async function perform() {
      const response = await publications.fetchList({path: `publications/${type}`, query});
      const result = await response.json();
      if (result) {
        logger.log('debug', messageCallback(result.length));
        return processCallback(result, state, type);
      }
    }
  }

  function processCallback(requests, state, type) {
    requests.reduce(async (acc, req) => {
      const {publishers} = client;
      const {_id, ...publisher} = await publishers.read(`publishers/${req.publisher}`);
      const request = {...req, publisher: {...publisher, id: _id, email: publisher.emails[0].value}};
      const allFormats = manageFormatDetails(request.formatDetails);
      const requestForAllFormats = allFormats.map(item => ({...request, formatDetails: {format: Array.isArray(request.formatDetails) ? item : request.formatDetails.format, subFormat: item}}));
      if (state === JOB_BACKGROUND_PROCESSING_PENDING) { // eslint-disable-line functional/no-conditional-statement
        const result = await Promise.all(requestForAllFormats.map(async item => {
          if (item.publicationType === 'isbn-ismn' && item.identifier && item.identifier.length > 0) {
            const blobId = await melindaClient.createBlob({
              blob: JSON.stringify([item]),
              type: 'application/json',
              profile: MELINDA_RECORD_IMPORT_PROFILE
            });
            logger.log('info', `Created new blob ${blobId}`);
            const formatName = item.formatDetails.subFormat;
            const metadataReference = request.metadataReference.filter(i => i.format === formatName).map(i => updateMetadataReference({item: i, formatName, state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS, status: 'PENDING_TRANSFORMATION', blobId}));
            return {metadataReference};
          }

          if (request.publicationType === 'issn' && (request.identifier && request.identifier.length > 0)) {
            const blobId = await melindaClient.createBlob({
              blob: JSON.stringify([item]),
              type: 'application/json',
              profile: MELINDA_RECORD_IMPORT_PROFILE
            });
            logger.log('info', `Created new blob ${blobId}`);
            const formatName = item.formatDetails.subFormat;
            const metadataReference = request.metadataReference.filter(i => i.format === formatName).map(i => updateMetadataReference({item: i, formatName, state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS, status: 'PENDING_TRANSFORMATION', blobId}));
            return {metadataReference};
          }
        }));
        const combineAll = result.filter(i => i !== undefined && i.metadataReference).map(i => i.metadataReference[0]);
        return setBackground({
          requests,
          requestId: request.id,
          state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
          metadataReference: combineAll,
          type
        });
      }
      if (state === JOB_BACKGROUND_PROCESSING_IN_PROGRESS) {
        const result = await Promise.all(requestForAllFormats.map(async item => {
          const formatName = item.formatDetails.subFormat;
          const blobId = item.metadataReference.filter(i => i.format === formatName)[0].id;
          const response = await melindaClient.getBlobMetadata({id: blobId});
          if (response !== undefined) {
            if (response.state === 'PROCESSED') {
              if (response.processingInfo.importResults[0].status === 'INVALID') {
                return {
                  format: formatName,
                  id: response.id,
                  state: JOB_BACKGROUND_PROCESSING_PROCESSED,
                  status: response.processingInfo.importResults[0].status
                };
              }
            }
            if (response.state === 'TRANSFORMED') {
              return {
                format: formatName,
                id: response.processingInfo.importResults[0].metadata.matches[0],
                state: JOB_BACKGROUND_PROCESSING_PROCESSED,
                status: response.state
              };
            }

            if (response.state === 'TRANSFORMATION_FAILED') {
              return {
                format: formatName,
                id: response.id,
                state: JOB_BACKGROUND_PROCESSING_PROCESSED,
                status: response.state
              };
            }

            if (response.state === 'PENDING_TRANSFORMATION' || response.state === 'ABORTED') {
              return {
                format: formatName,
                id: response.id,
                state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
                status: response.state
              };
            }
          }
        }));
        return setBackground({
          requests,
          requestId: request.id,
          state: JOB_BACKGROUND_PROCESSING_PROCESSED,
          metadataReference: result,
          type
        });
      }
    }, []);
  }

  async function setBackground({requests, requestId, state, metadataReference, type}) {
    const request = requests.find(item => item.id === requestId);
    const updatedRequest = {...request, metadataReference};
    if (request.publicationType === 'issn') {
      const {publications} = client;
      await publications.update({path: `publications/${type}/${updatedRequest.id}`, payload: updatedRequest});
      return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
    }
    const {publications} = client;
    await publications.update({path: `publications/${type}/${updatedRequest.id}`, payload: updatedRequest});
    return logger.log('info', `Background processing State changed to ${state} for${updatedRequest.id}`);
  }

  function manageFormatDetails(formatDetails) {
    if (Array.isArray(formatDetails)) {
      const allFormats = formatDetails.map(i => i.format);
      return allFormats;
    }
    const {fileFormat, printFormat, otherFileFormat, otherPrintFormat} = formatDetails;
    const allFormats = fileFormat && printFormat
      ? [
        ...fileFormat.format,
        ...printFormat.format
      ]
      : fileFormat
        ? [...fileFormat.format]
        : printFormat
          ? [...printFormat.format]
          : [];
    otherFileFormat && otherPrintFormat // eslint-disable-line no-unused-expressions
      ? [
        ...Object.values(otherFileFormat),
        ...Object.values(otherPrintFormat)
      ].forEach(v => allFormats.push(v)) // eslint-disable-line functional/immutable-data
      : otherFileFormat
        ? Object.values(otherFileFormat).forEach(v => allFormats.push(v)) // eslint-disable-line functional/immutable-data
        : otherPrintFormat && Object.values(otherPrintFormat).forEach(v => allFormats.push(v)); // eslint-disable-line functional/immutable-data
    return allFormats;
  }

  function updateMetadataReference({item, state, status, blobId}) {
    return blobId ? {...item, status, state, id: blobId} : {...item, status, state};
  }
}
