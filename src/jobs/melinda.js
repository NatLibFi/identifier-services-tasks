/* eslint-disable max-lines */
/* eslint-disable functional/immutable-data */
/* eslint-disable no-unused-expressions */
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
    if (state === JOB_BACKGROUND_PROCESSING_PENDING) { // eslint-disable-line functional/no-conditional-statement
      requests.reduce(async (acc, request) => {
        if (request.publicationType === 'issn' && (request.identifier && request.identifier.length > 0)) {
          request.formatDetails.forEach(item => {
            const newRequest = {...request, formatDetails: item.format};
            acc.push({...newRequest, id: request.id}); // eslint-disable-line functional/immutable-data
            return acc;
          });
          const metadataArray = await resolveIssnMetadata(acc);

          return setBackground({
            requests,
            requestId: request.id,
            state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
            newRequest: {...request, metadataReference: metadataArray},
            type,
            status: 'PENDING_TRANSFORMATION'
          });
        }

        if (request.publicationType === 'isbn-ismn' && (request.identifier && request.identifier.length > 0)) {
          if (request.formatDetails.format === 'printed-and-electronic') {
            const withPrintFormat = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'printFormat'});
            const printFormatafterBlobRegister = await handlePrintedFormat(withPrintFormat[0]);
            const withFileFormat = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'fileFormat'});
            const fileFormatafterBlobRegister = await handleFileFormat(withFileFormat[0]);
            return setBackground({
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              newRequest: {
                ...request,
                metadataReference: [
                  ...printFormatafterBlobRegister.metadataReference,
                  ...fileFormatafterBlobRegister.metadataReference
                ]
              },
              type,
              status: 'PENDING_TRANSFORMATION'
            });
          }

          if (request.formatDetails.format === 'printed') {
            return setBackground({
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              newRequest: await handlePrintedFormat(request),
              type,
              status: 'PENDING_TRANSFORMATION'
            });
          }

          if (request.formatDetails.format === 'electronic') {
            return setBackground({
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              newRequest: await handleFileFormat(request),
              type,
              status: 'PENDING_TRANSFORMATION'
            });
          }

        }
      }, []);
    }

    async function handlePrintedFormat(request) {
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
      return combineAll;
    }

    async function handleFileFormat(request) {
      const pdf = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'fileFormat', subFormat: 'pdf'});
      const epub = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'fileFormat', subFormat: 'epub'});
      const mp3 = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'fileFormat', subFormat: 'mp3'});
      const cd = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'fileFormat', subFormat: 'cd'});
      const otherFile = await resolvePendingPromise({newRequests: [request], format: true, formatName: 'fileFormat', subFormat: 'otherFile'});
      const metadataArray = [];
      pdf[0] !== undefined && metadataArray.push(pdf[0].metadataReference[0]);
      epub[0] !== undefined && metadataArray.push(epub[0].metadataReference[0]);
      mp3[0] !== undefined && metadataArray.push(mp3[0].metadataReference[0]);
      cd[0] !== undefined && metadataArray.push(cd[0].metadataReference[0]);
      otherFile[0] !== undefined && metadataArray.push(otherFile[0].metadataReference[0]);
      const combineAll = {
        ...request,
        metadataReference: metadataArray
      };
      return combineAll;
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
          if (format && subFormat) {
            return resolveSubFormatDetails({request,
              formatName,
              subFormat,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              blobId,
              status: 'PENDING_TRANSFORMATION'});
          }
        }
        if (format && !subFormat) {
          return resolveFormatDetails({requests, requestId: request.id, formatName});
        }
      }));
    }

    function resolveIssnPendingPromise({newRequests, format, formatName, status = 'PENDING_TRANSFORMATION'}) {
      return Promise.all(newRequests.map(async request => {
        // Create a new blob in Melinda's record import system
        const blobId = await melindaClient.createBlob({
          blob: JSON.stringify(newRequests),
          type: 'application/json',
          profile: MELINDA_RECORD_IMPORT_PROFILE
        });
        logger.log('info', `Created new blob ${blobId}`);

        if (format && formatName) {
          return {
            ...request,
            metadataReference: request.metadataReference.filter(item => item.format === formatName).map(item => updateMetadataReference({item, formatName, state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS, status, blobId}))
          };
        }
      }));
    }

    function resolveFormatDetails({requests, requestId, formatName}) {
      const request = requests.find(item => item.id === requestId);
      return {...request, formatDetails: {[formatName]: {...request.formatDetails[formatName]}}};
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

    if (state === JOB_BACKGROUND_PROCESSING_IN_PROGRESS) {
      return Promise.all(requests.map(async request => {
        const {metadataReference} = request;
        if (request.publicationType === 'isbn-ismn') {
          if (request.formatDetails.format === 'printed-and-electronic') {
            const printedMetadataArray = await resolvePrintedInProgress(metadataReference);
            const electronicMetadataArray = await resolveElectronicInProgress(metadataReference);
            const metadataArray = [
              ...printedMetadataArray,
              ...electronicMetadataArray
            ];
            const newRequest = {
              ...request,
              metadataReference: metadataArray
            };

            return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
          }

          if (request.formatDetails.format === 'printed') {
            const newMetadata = await resolvePrintedInProgress(metadataReference);
            const newRequest = {...request, metadataReference: newMetadata};
            return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
          }

          if (request.formatDetails.format === 'electronic') {
            const newMetadata = await resolveElectronicInProgress(metadataReference);
            const newRequest = {...request, metadataReference: newMetadata};
            return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
          }
        }

        if (request.publicationType === 'issn') {
          const newMetadata = await retriveIssnMetadataUpdates(metadataReference);
          const newRequest = {...request, metadataReference: newMetadata};
          return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
        }
      }));
    }

    async function resolveIssnMetadata(acc) {
      const withPrintFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'printed'), format: true, formatName: 'printed'});
      const withOnlineFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'online'), format: true, formatName: 'online'});
      const withCdFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'cd'), format: true, formatName: 'cd'});
      const withOtherFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'other'), format: true, formatName: 'other'});
      const metadataArray = [];
      withPrintFormat[0] !== undefined && metadataArray.push(withPrintFormat[0].metadataReference[0]);
      withOnlineFormat[0] !== undefined && metadataArray.push(withOnlineFormat[0].metadataReference[0]);
      withCdFormat[0] !== undefined && metadataArray.push(withCdFormat[0].metadataReference[0]);
      withOtherFormat[0] !== undefined && metadataArray.push(withOtherFormat[0].metadataReference[0]);
      return metadataArray;
    }

    async function retriveIssnMetadataUpdates(metadataReference) {
      const responsePaperFormat = await retriveMetadataAndFormatMetadata('printed', metadataReference);
      const responseOnlineFormat = await retriveMetadataAndFormatMetadata('online', metadataReference);
      const responseCdFormat = await retriveMetadataAndFormatMetadata('cd', metadataReference);
      const responseOtherFormat = await retriveMetadataAndFormatMetadata('other', metadataReference);
      const metadataArray = [];
      responsePaperFormat !== undefined && metadataArray.push(responsePaperFormat);
      responseOnlineFormat !== undefined && metadataArray.push(responseOnlineFormat);
      responseCdFormat !== undefined && metadataArray.push(responseCdFormat);
      responseOtherFormat !== undefined && metadataArray.push(responseOtherFormat);

      return metadataArray;
    }

    async function resolvePrintedInProgress(metadataReference) {
      const responsePaperback = await retriveMetadataAndFormatMetadata('paperback', metadataReference);
      const responseHardback = await retriveMetadataAndFormatMetadata('hardback', metadataReference);
      const responseSpiralbinding = await retriveMetadataAndFormatMetadata('spiralbinding', metadataReference);
      const responseOtherPrints = await retriveMetadataAndFormatMetadata('otherPrints', metadataReference);

      const metadataArray = [];
      responsePaperback !== undefined && metadataArray.push(responsePaperback);
      responseHardback !== undefined && metadataArray.push(responseHardback);
      responseSpiralbinding !== undefined && metadataArray.push(responseSpiralbinding);
      responseOtherPrints !== undefined && metadataArray.push(responseOtherPrints);

      return metadataArray;
    }

    async function resolveElectronicInProgress(metadataReference) {
      const responsePdf = await retriveMetadataAndFormatMetadata('pdf', metadataReference);
      const responseEpub = await retriveMetadataAndFormatMetadata('epub', metadataReference);
      const responseMp3 = await retriveMetadataAndFormatMetadata('mp3', metadataReference);
      const responseCd = await retriveMetadataAndFormatMetadata('cd', metadataReference);
      const responseOtherFile = await retriveMetadataAndFormatMetadata('otherFile', metadataReference);

      const metadataArray = [];
      responsePdf !== undefined && metadataArray.push(responsePdf);
      responseEpub !== undefined && metadataArray.push(responseEpub);
      responseMp3 !== undefined && metadataArray.push(responseMp3);
      responseCd !== undefined && metadataArray.push(responseCd);
      responseOtherFile !== undefined && metadataArray.push(responseOtherFile);

      return metadataArray;
    }


    async function retriveMetadataAndFormatMetadata(subFormat, metadata) {
      const individualMetadata = metadata.find(item => item.format === subFormat);
      const blobId = individualMetadata && individualMetadata.id;
      const response = blobId && await melindaClient.getBlobMetadata({id: blobId});
      if (response === undefined) {
        return response;
      }

      if (response.state === 'PROCESSED') {
        return {
          ...individualMetadata,
          id: response.processingInfo.importResults[0].metadata.matches[0],
          state: JOB_BACKGROUND_PROCESSING_PROCESSED,
          status: response.state
        };
      }

      if (response.state === 'TRANSFORMATION_FAILED' || response.state === 'ABORTED') {
        return {
          ...individualMetadata,
          id: response.id,
          state: JOB_BACKGROUND_PROCESSING_PROCESSED,
          status: response.state
        };
      }
    }

    async function setBackground({requests, requestId, state, newRequest, type}) {
      const request = requests.find(item => item.id === requestId);
      if (request.publicationType === 'issn') {
        const {publications} = client;
        await publications.update({path: `publications/${type}/${request.id}`, payload: newRequest});
        return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
      }
      const {publications} = client;
      await publications.update({path: `publications/${type}/${request.id}`, payload: newRequest});
      return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
    }
  }


  function updateMetadataReference({item, state, status, blobId}) {
    return blobId ? {...item, status, state, id: blobId} : {...item, status, state};
  }
}
