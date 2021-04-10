/* eslint-disable functional/immutable-data */
/* eslint-disable no-unused-expressions */
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
        query: {queries: [{query: {metadataReference: {$elemMatch: {status: 'new', state}}}}], offset: null},
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
    if (state === JOB_BACKGROUND_PROCESSING_PENDING) { // eslint-disable-line functional/no-conditional-statement
      // eslint-disable-next-line array-callback-return
      requests.reduce(async (acc, req) => {
        const {_id, ...rest} = req;
        const request = {...rest, id: _id};
        if (request.publicationType === 'issn' && (request.identifier && request.identifier.length > 0)) {
          request.formatDetails.forEach(item => {
            const {_id, newRequest} = {...request, formatDetails: item.format};
            acc.push({...newRequest, id: _id}); // eslint-disable-line functional/immutable-data
            return acc;
          });
          return resolvePendingPromise(acc);
        }

        if (request.publicationType === 'isbn-ismn' && (request.identifier && request.identifier.length > 0)) {
          if (request.formatDetails.format === 'printed-and-electronic') { // eslint-disable-line functional/no-conditional-statement
            const publisherDetails = await fetchPublisherDetails(request.publisher);
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
            // eslint-disable-next-line no-unused-vars
            const newRequest = {...request, formatDetails: {printFormat: request.formatDetails.printFormat}};
            const paperback = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'printFormat', subFormat: 'paperback'});
            const hardback = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'printFormat', subFormat: 'hardback'});
            const spiralbinding = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'printFormat', subFormat: 'spiralbinding'});
            const otherPrints = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'printFormat', subFormat: 'otherPrints'});
            const metadataArray = [];
            paperback[0] !== undefined && metadataArray.push(paperback[0].metadataReference[0]);
            hardback[0] !== undefined && metadataArray.push(hardback[0].metadataReference[0]);
            spiralbinding[0] !== undefined && metadataArray.push(spiralbinding[0].metadataReference[0]);
            otherPrints[0] !== undefined && metadataArray.push(otherPrints[0].metadataReference[0]);
            const combineAll = {
              ...request,
              metadataReference: metadataArray
            };
            return setBackground({
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              newRequest: combineAll,
              type,
              status: 'PENDING_TRANSFORMATION'
            });
          }

          if (request.formatDetails.format === 'electronic') { // eslint-disable-line functional/no-conditional-statement
            acc.push({...request, formatDetails: {fileFormat: request.formatDetails.fileFormat}}); // eslint-disable-line functional/immutable-data
            return resolvePendingPromise({newRequests: acc, formatName: 'fileFormat'});
          }

        }
      }, []);
    }

    function getExpandedFormat(req, format) {
      return req.formatDetails[format].format.map(item => ({...req, formatDetails: {...req.formatDetails, [format]: {...req.formatDetails[format], format: item}}}));
    }

    function fetchPublisherDetails(id) {
      return client.publishers.read(`publishers/${id}`);
    }

    function resolvePendingPromise({newRequests, format, formatName, subFormat}) {
      return Promise.all(newRequests.map(async request => {
        // Create a new blob in Melinda's record import system
        if (request.formatDetails[formatName].format.includes(subFormat)) {
          const blobId = await melindaClient.createBlob({
            blob: JSON.stringify(newRequests),
            type: 'application/json',
            profile: MELINDA_RECORD_IMPORT_PROFILE
          });
          logger.log('info', `Created new blob ${blobId}`);
          if (format) {
            if (subFormat) {
              return resolveSubFormatDetails({request,
                formatName,
                subFormat,
                state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
                blobId,
                status: 'PENDING_TRANSFORMATION'});
            }

            return resolveFormatDetails({requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              format,
              subFormat: request.publicationType === 'isbn-ismn' ? request.formatDetails[formatName].format : '',
              blobId,
              status: 'PENDING_TRANSFORMATION'});
          }
          return setBackground({
            requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
            format: request.publicationType === 'isbn-ismn' ? Object.keys(request.formatDetails)[0] : request.formatDetails.format,
            subFormat: request.publicationType === 'isbn-ismn' ? request.formatDetails[formatName].format : '',
            blobId,
            type,
            status: 'PENDING_TRANSFORMATION'
          });
        }
      }));
    }

    function resolveFormatDetails({requests, requestId, format}) {
      const request = requests.find(item => item._id === requestId);
      return {...request, formatDetails: {[format]: {...request.formatDetails[format]}}};
    }

    function resolveSubFormatDetails({request, formatName, subFormat, state, blobId, status}) {
      return {
        ...request,
        formatDetails: {
          ...request.formatDetails,
          [formatName]: {
            ...request.formatDetails[formatName],
            format: [subFormat]
          }
        },
        metadataReference: request.metadataReference.filter(item => item.format === subFormat).map(item => updateMetadataReference({item, subFormat, state, status, blobId}))
      };
    }

    // if (state === JOB_BACKGROUND_PROCESSING_IN_PROGRESS) {
    //   return Promise.all(requests.map(async request => {
    //     if (request.publicationType === 'isbn-ismn' && request.formatDetails.format === 'printed-and-electronic') {
    //       const fileFormatBlodId = request.formatDetails.fileFormat.id;
    //       const fileFormatResponse = await retriveMetadataAndUpdate(fileFormatBlodId, 'fileFormat');
    //       const printFormatResponse = await retriveMetadataAndUpdate(fileFormatBlodId, 'printFormat');
    //       const newRequest = {
    //         ...request,
    //         formatDetails: {
    //           ...request.formatDetails,
    //           fileFormat: fileFormatResponse.formatDetails.fileFormat,
    //           printFormat: printFormatResponse.formatDetails.fileFormat
    //         },
    //         metadataReference: printFormatResponse.metadataReference.state
    //       };
    //       return setBackground({requests, requestId: request._id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type, status: newRequest.metadataReference.state});
    //     }

    //     const blobId = request.metadataReference.id;
    //     return retriveMetadataAndUpdate(blobId);
    //   }));
    // }

    async function retriveMetadataAndUpdate(blobId, format) {
      const response = await melindaClient.getBlobMetadata({id: blobId});
      if (response.state === 'PROCESSED') {
        return response.processingInfo.importResults[0].status === 'DUPLICATE'
          ? format
            ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format, blobId: response.processingInfo.importResults[0].metadata.matches[0], status: response.state})
            : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED,
              format: request.publicationType === 'isbn-ismn' ? format : request.formatDetails.format,
              subFormat: '',
              blobId: response.processingInfo.importResults[0].metadata.matches[0],
              type,
              status: response.state})
          : format
            ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format, blobId: response.processingInfo.importResults[0].metadata.id})
            : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format: request.publicationType === 'isbn-ismn' ? format : request.formatDetails.format, blobId: response.processingInfo.importResults[0].metadata.id, type});
      } else if (response.state === 'TRANSFORMATION_FAILED') {
        return format
          ? resolveFormatDetails({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format, blobId, status: response.state})
          : setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, format: request.publicationType === 'isbn-ismn' ? format : request.formatDetails.format, blobId, type, status: response.state});
      }
    }

    async function setBackground({requests, requestId, state, format, newRequest, type}) {
      const req = requests.find(item => item._id === requestId);
      const {_id, ...request} = req; // eslint-disable-line no-unused-vars
      if (request.publicationType === 'issn') { // eslint-disable-line functional/no-conditional-statement
        const payload = {...request};
        const {publications} = client;
        await publications.update({path: `publications/${type}/${_id}`, payload});
        logger.log('info', `Background processing State changed to ${state} for${_id}`);
      } else { // eslint-disable-line functional/no-conditional-statement
        const payload = format === 'printFormat' && format === 'fileFormat'
          ? {...request}
          : {...newRequest};
        const {publications} = client;
        await publications.update({path: `publications/${type}/${_id}`, payload});
        logger.log('info', `Background processing State changed to ${state} for${_id}`);
      }
    }
  }


  function updateMetadataReference({item, state, status, blobId}) {
    return blobId ? {...item, status, state, id: blobId} : {...item, status, state};
  }
}
