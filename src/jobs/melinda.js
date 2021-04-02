/* eslint-disable no-nested-ternary */
/* eslint-disable max-statements */
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
        query: {queries: [{query: {metadataReference: {state}}}], offset: null},
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
      if (result.results) {
        logger.log('debug', messageCallback(result.results.length));
        return processCallback(result.results, state, type);
      }
    }
  }

  function processCallback(requests, state, type) {
    if (state === JOB_BACKGROUND_PROCESSING_PENDING) {
      // eslint-disable-next-line array-callback-return
      requests.reduce(async (acc, request) => {
        if (request.publicationType === 'issn' && (request.identifier && request.identifier.length > 0)) {
          request.formatDetails.forEach(item => {
            const newRequest = {...request, formatDetails: item.format};
            acc.push(newRequest); // eslint-disable-line functional/immutable-data
            return acc;
          });
          return resolvePendingPromise(acc);
        }

        if (request.publicationType === 'isbn-ismn' && (request.identifier && request.identifier.length > 0)) {
          if (request.formatDetails.format === 'printed-and-electronic') { // eslint-disable-line functional/no-conditional-statement
            const publisherDetails = await fetchPublisherDetails(request.publisher);
            const withFileFormat = await resolvePendingPromise([{...request, publisher: publisherDetails, formatDetails: {fileFormat: request.formatDetails.fileFormat, multiFormat: true}}], 'fileFormat');
            const withPrintFormat = await resolvePendingPromise([{...request, publisher: publisherDetails, formatDetails: {printFormat: request.formatDetails.printFormat, edition: request.formatDetails.edition, multiFormat: true}}], 'printFormat');
            return setBackground({
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              newRequest: {
                ...request,
                formatDetails: {...request.formatDetails, fileFormat: withFileFormat[0].formatDetails.fileFormat, printFormat: withPrintFormat[0].formatDetails.printFormat}
              },
              metadataReference: withPrintFormat[0].metadataReference,
              type,
              status: 'PENDING_TRANSFORMATION'
            });
          }

          if (request.formatDetails.format === 'printed') { // eslint-disable-line functional/no-conditional-statement
            acc.push({...request, formatDetails: {printFormat: request.formatDetails.printFormat}}); // eslint-disable-line functional/immutable-data
            return resolvePendingPromise(acc);
          }

          if (request.formatDetails.format === 'electronic') { // eslint-disable-line functional/no-conditional-statement
            acc.push({...request, formatDetails: {fileFormat: request.formatDetails.fileFormat}}); // eslint-disable-line functional/immutable-data
            return resolvePendingPromise(acc);
          }

        }
      }, []);

      return;
    }

    function fetchPublisherDetails(id) {
      return client.publishers.read(`publishers/${id}`);
    }

    function resolvePendingPromise(newRequests, format) {
      return Promise.all(newRequests.map(async request => {
      // Create a new blob in Melinda's record import system
        const blobId = await melindaClient.createBlob({
          blob: JSON.stringify(newRequests),
          type: 'application/json',
          profile: MELINDA_RECORD_IMPORT_PROFILE
        });
        logger.log('info', `Created new blob ${blobId}`);
        return format
          ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS, format, blobId, status: 'PENDING_TRANSFORMATION'})
          : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS, format: request.publicationType === 'isbn-ismn' ? Object.keys(request.formatDetails)[0] : request.formatDetails.format, blobId, type, status: 'PENDING_TRANSFORMATION'});
      }));
    }

    function resolveFormatDetails({requests, requestId, state, format, blobId, status}) {
      const request = requests.find(item => item.id === requestId);
      return {...request, formatDetails: {[format]: {...request.formatDetails[format], metadata: {id: blobId}}}, metadataReference: {...request.metadataReference, state, status}};
    }

    if (state === JOB_BACKGROUND_PROCESSING_IN_PROGRESS) {
      return Promise.all(requests.map(async request => {
        if (request.publicationType === 'isbn-ismn' && request.formatDetails.format === 'printed-and-electronic') {
          const fileFormatBlodId = request.formatDetails.fileFormat.id;
          const fileFormatResponse = await retriveMetadataAndUpdate(fileFormatBlodId, 'fileFormat');
          const printFormatResponse = await retriveMetadataAndUpdate(fileFormatBlodId, 'printFormat');
          const newRequest = {
            ...request,
            formatDetails: {
              ...request.formatDetails,
              fileFormat: fileFormatResponse.formatDetails.fileFormat,
              printFormat: printFormatResponse.formatDetails.fileFormat
            },
            metadataReference: printFormatResponse.metadataReference.state
          };
          return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type, status: newRequest.metadataReference.state});
        }

        const blobId = request.metadataReference.id;
        return retriveMetadataAndUpdate(blobId);
      }));
    }

    async function retriveMetadataAndUpdate(blobId, format) {
      const response = await melindaClient.getBlobMetadata({id: blobId});
      if (response.state === 'PROCESSED') {
        return response.processingInfo.importResults[0].status === 'DUPLICATE'
          ? format
            ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format, blobId: response.processingInfo.importResults[0].metadata.matches[0], status: response.state})
            : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format: request.publicationType === 'isbn-ismn' ? format : request.formatDetails.format, blobId: response.processingInfo.importResults[0].metadata.matches[0], type, status: response.state})
          : format
            ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format, blobId: response.processingInfo.importResults[0].metadata.id})
            : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format: request.publicationType === 'isbn-ismn' ? format : request.formatDetails.format, blobId: response.processingInfo.importResults[0].metadata.id, type});
      } else if (response.state === 'TRANSFORMATION_FAILED') {
        return format
          ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format, blobId, status: response.state})
          : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format: request.publicationType === 'isbn-ismn' ? format : request.formatDetails.format, blobId, type, status: response.state});
      }
    }

    async function setBackground({requests, requestId, state, format, newRequest, blobId, type, status}) {
      const request = requests.find(item => item.id === requestId);
      if (request.publicationType === 'issn') { // eslint-disable-line functional/no-conditional-statement
        const newFormatDetails = request.formatDetails.map(f => f.format === format ? {...f, metadata: {id: blobId}} : f);
        const payload = {...request, formatDetails: newFormatDetails, metadataReference: {...request.metadataReference, state, status}};
        const {publications} = client;
        await publications.update({path: `publications/${type}/${request.id}`, payload});
        logger.log('info', `Background processing State changed to ${state} for${request.id}`);
      } else { // eslint-disable-line functional/no-conditional-statement
        const payload = format === 'printFormat'
          ? {...request, formatDetails: {...request.formatDetails, printFormat: {...request.formatDetails.printFormat, metadata: {id: blobId}}}, metadataReference: {...request.metadataReference, state, status}}
          : format === 'fileFormat'
            ? {...request, formatDetails: {...request.formatDetails, fileFormat: {...request.formatDetails.fileFormat, metadata: {id: blobId}}}, metadataReference: {...request.metadataReference, state, status}}
            : {...newRequest, metadataReference: {...newRequest.metadataReference, state, status}};
        const {publications} = client;
        await publications.update({path: `publications/${type}/${request.id}`, payload});
        logger.log('info', `Background processing State changed to ${state} for${request.id}`);
      }
    }
  }
}
