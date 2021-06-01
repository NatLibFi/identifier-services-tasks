/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines */
/* eslint-disable no-console */
/* eslint-disable no-extra-parens */
/* eslint-disable max-lines */
/* eslint-disable no-nested-ternary */
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
      requests.reduce(async (acc, req) => {
        const {publishers} = client;
        const {_id, ...publisher} = await publishers.read(`publishers/${req.publisher}`);
        const request = {...req, publisher: {...publisher, id: _id, email: publisher.email}};
        if (request.publicationType === 'issn' && (request.identifier && request.identifier.length > 0)) {
          const accumulateRequest = [];
          request.formatDetails.forEach(item => {
            const newRequest = {...request, formatDetails: item.format};
            accumulateRequest.push({...newRequest, id: request.id}); // eslint-disable-line functional/immutable-data
          });
          const metadataArray = await resolveIssnMetadata(accumulateRequest, request);
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
            const withPrintFormat = await resolvePendingPromise({newRequest: request, format: true, formatName: 'printFormat'});
            const printFormatafterBlobRegister = await handlePrintedFormat(withPrintFormat);
            const withOtherPrintFormatOne = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherPrintFormat', other: 'one'});
            const otherPrintFormatOne = request.formatDetails.otherPrintFormat && request.formatDetails.otherPrintFormat.one && request.formatDetails.otherPrintFormat.one;
            const otherPrintFormatOneafterBlobRegister = await handlePrintedFormat(withOtherPrintFormatOne, otherPrintFormatOne, 'one');
            const withOtherPrintFormatTwo = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherPrintFormat', other: 'two'});
            const otherPrintFormatTwo = request.formatDetails.otherPrintFormat && request.formatDetails.otherPrintFormat.two && request.formatDetails.otherPrintFormat.two;
            const otherPrintFormatTwoafterBlobRegister = await handlePrintedFormat(withOtherPrintFormatTwo, otherPrintFormatTwo, 'two');
            const withFileFormat = await resolvePendingPromise({newRequest: request, format: true, formatName: 'fileFormat'});
            const withOtherFileFormatOne = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherFileFormat', other: 'one'});
            const otherFileFormatOne = request.formatDetails.otherFileFormat && request.formatDetails.otherFileFormat.one && request.formatDetails.otherFileFormat.one;
            const otherFileFormatOneafterBlobRegister = await handleFileFormat(withOtherFileFormatOne, otherFileFormatOne, 'one');
            const withOtherFileFormatTwo = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherFileFormat', other: 'two'});
            const otherFileFormatTwo = request.formatDetails.otherFileFormat && request.formatDetails.otherFileFormat.two && request.formatDetails.otherFileFormat.two;
            const otherFileFormatTwoafterBlobRegister = await handleFileFormat(withOtherFileFormatTwo, otherFileFormatTwo, 'two');
            const fileFormatafterBlobRegister = await handleFileFormat(withFileFormat);
            return setBackground({
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              newRequest: {
                ...request,
                metadataReference: [
                  ...printFormatafterBlobRegister.metadataReference,
                  ...otherPrintFormatOneafterBlobRegister.metadataReference,
                  ...otherPrintFormatTwoafterBlobRegister.metadataReference,
                  ...otherFileFormatOneafterBlobRegister.metadataReference,
                  ...otherFileFormatTwoafterBlobRegister.metadataReference,
                  ...fileFormatafterBlobRegister.metadataReference
                ]
              },
              type,
              status: 'PENDING_TRANSFORMATION'
            });
          }

          if (request.formatDetails.format === 'printed') {
            const payload = {
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              type,
              status: 'PENDING_TRANSFORMATION'
            };
            if (request.formatDetails.otherPrintFormat) {
              payload.newRequest = request.formatDetails.otherPrintFormat.one
                ? await handlePrintedFormat(request, request.formatDetails.otherPrintFormat.one, 'one')
                : await handlePrintedFormat(request, request.formatDetails.otherPrintFormat.two, 'two');
              return setBackground(payload);
            }
            payload.newRequest = await handlePrintedFormat(request);
            return setBackground(payload);
          }

          if (request.formatDetails.format === 'electronic') {
            const payload = {
              requests,
              requestId: request.id,
              state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
              type,
              status: 'PENDING_TRANSFORMATION'
            };
            if (request.formatDetails.otherFileFormat) {
              payload.newRequest = request.formatDetails.otherFileFormat.one
                ? await handlePrintedFormat(request, request.formatDetails.otherFileFormat.one, 'one')
                : await handlePrintedFormat(request, request.formatDetails.otherFileFormat.two, 'two');
              return setBackground(payload);
            }
            payload.newRequest = await handlePrintedFormat(request);
            return setBackground(payload);
          }

        }
      }, []);
    }

    if (state === JOB_BACKGROUND_PROCESSING_IN_PROGRESS) {
      return Promise.all(requests.map(async req => {
        const {publishers} = client;
        const {_id, ...publisher} = await publishers.read(`publishers/${req.publisher}`);
        const request = {...req, publisher: {...publisher, id: _id, email: publisher.email}};
        const {metadataReference} = request;
        if (request.publicationType === 'isbn-ismn') {
          if (request.formatDetails.format === 'printed-and-electronic') {
            const printedMetadataArray = await resolvePrintedInProgress(metadataReference, request);
            const otherPrintedOne = await resolvePrintedInProgress(metadataReference, request, request.formatDetails.otherPrintFormat.one);
            const otherPrintedTwo = await resolvePrintedInProgress(metadataReference, request, request.formatDetails.otherPrintFormat.two);
            const electronicMetadataArray = await resolveElectronicInProgress(metadataReference, request);
            const otherElectronicOne = await resolveElectronicInProgress(metadataReference, request, request.formatDetails.otherFileFormat.one);
            const otherElectroniTwo = await resolveElectronicInProgress(metadataReference, request, request.formatDetails.otherFileFormat.two);
            const metadataArray = [
              ...printedMetadataArray,
              ...otherPrintedOne,
              ...otherPrintedTwo,
              ...electronicMetadataArray,
              ...otherElectronicOne,
              ...otherElectroniTwo
            ];
            const newRequest = {
              ...request,
              metadataReference: metadataArray
            };

            return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
          }

          if (request.formatDetails.format === 'printed') {
            const newMetadata = await resolvePrintedInProgress(metadataReference, request);
            const newRequest = {...request, metadataReference: newMetadata};
            return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
          }

          if (request.formatDetails.format === 'electronic') {
            const newMetadata = await resolveElectronicInProgress(metadataReference, request);
            const newRequest = {...request, metadataReference: newMetadata};
            return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
          }
        }

        if (request.publicationType === 'issn') {
          const newMetadata = await retriveIssnMetadataUpdates(metadataReference, request);
          const newRequest = {...request, metadataReference: newMetadata};
          return setBackground({requests, requestId: request.id, state: JOB_BACKGROUND_PROCESSING_PROCESSED, newRequest, type});
        }
      }));
    }

    async function handlePrintedFormat(request, format, other) {
      const paperback = await resolvePendingPromise({newRequest: request, format: true, formatName: 'printFormat', subFormat: 'paperback'});
      const hardback = await resolvePendingPromise({newRequest: request, format: true, formatName: 'printFormat', subFormat: 'hardback'});
      const spiralbinding = await resolvePendingPromise({newRequest: request, format: true, formatName: 'printFormat', subFormat: 'spiralbinding'});
      const otherOne = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherPrintFormat', subFormat: format, other});
      const otherTwo = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherPrintFormat', subFormat: format, other});
      const metadataArray = addMetadataReference(request);
      paperback !== undefined && replaceMetadataSubData(metadataArray, paperback.metadataReference[0], 'paperback');
      hardback !== undefined && replaceMetadataSubData(metadataArray, hardback.metadataReference[0], 'hardback');
      spiralbinding !== undefined && replaceMetadataSubData(metadataArray, spiralbinding.metadataReference[0], 'spiralbinding');
      otherOne !== undefined && replaceMetadataSubData(metadataArray, otherOne.metadataReference[0], format, other);
      otherTwo !== undefined && replaceMetadataSubData(metadataArray, otherTwo.metadataReference[0], format, other);
      const combineAll = {
        ...request,
        metadataReference: metadataArray
      };
      return combineAll;
    }

    function replaceMetadataSubData(metadataArray, newMetadata, subType) {
      metadataArray.forEach((item, index) => {
        if (item.format === subType) { // eslint-disable-line functional/no-conditional-statement
          metadataArray[index] = newMetadata;
        }
      });
    }

    async function handleFileFormat(request, format, other) {
      const pdf = await resolvePendingPromise({newRequest: request, format: true, formatName: 'fileFormat', subFormat: 'pdf'});
      const epub = await resolvePendingPromise({newRequest: request, format: true, formatName: 'fileFormat', subFormat: 'epub'});
      const mp3 = await resolvePendingPromise({newRequest: request, format: true, formatName: 'fileFormat', subFormat: 'mp3'});
      const cd = await resolvePendingPromise({newRequest: request, format: true, formatName: 'fileFormat', subFormat: 'cd'});
      const otherOne = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherFileFormat', subFormat: format, other});
      const otherTwo = await resolvePendingPromise({newRequest: request, format: true, formatName: 'otherFileFormat', subFormat: format, other});
      const metadataArray = addMetadataReference(request);
      pdf !== undefined && replaceMetadataSubData(metadataArray, pdf.metadataReference[0], 'pdf');
      epub !== undefined && replaceMetadataSubData(metadataArray, epub.metadataReference[0], 'epub');
      mp3 !== undefined && replaceMetadataSubData(metadataArray, mp3.metadataReference[0], 'mp3');
      cd !== undefined && replaceMetadataSubData(metadataArray, cd.metadataReference[0], 'cd');
      otherOne !== undefined && replaceMetadataSubData(metadataArray, otherOne.metadataReference[0], format);
      otherTwo !== undefined && replaceMetadataSubData(metadataArray, otherTwo.metadataReference[0], format);
      const combineAll = {
        ...request,
        metadataReference: metadataArray
      };
      return combineAll;
    }

    function addMetadataReference(request) {
      const {formatDetails} = request;
      if (formatDetails !== undefined) {
        if (request.publicationType === 'issn') {
          const allFormats = formatDetails.map(i => i.format);
          return allFormats.map(item => ({
            format: item,
            state: 'pending',
            update: false
          }));
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
            ...otherFileFormat,
            ...otherPrintFormat
          ].forEach(v => allFormats.push(v)) // eslint-disable-line functional/immutable-data
          : otherFileFormat
            ? otherFileFormat.forEach(v => allFormats.push(v)) // eslint-disable-line functional/immutable-data
            : otherPrintFormat && Object.values(otherPrintFormat).forEach(v => allFormats.push(v)); // eslint-disable-line functional/immutable-data
        return allFormats.map(item => { // eslint-disable-line array-callback-return
          // eslint-disable-next-line no-extra-parens
          if (condition(formatDetails, item)) { // eslint-disable-line functional/no-conditional-statement
            return {
              format: item,
              state: 'pending',
              update: false
            };
          }
        });

      }
    }

    function condition(formatDetails, item) {
      const {fileFormat, printFormat, otherFileFormat, otherPrintFormat} = formatDetails;
      return (
        (fileFormat && fileFormat.format.includes(item)) ||
        (printFormat && printFormat.format.includes(item)) ||
        (otherFileFormat && (Object.values(otherFileFormat).some(i => i === item))) ||
        (otherPrintFormat && (Object.values(otherPrintFormat).some(i => i === item)))
      );
    }


    async function resolvePendingPromise({newRequest, format, formatName, subFormat, other}) {
      if (format && !subFormat) {
        return resolveFormatDetailsAndMetadata({requests, requestId: newRequest.id, formatName, other});
      }
      if (newRequest.formatDetails[formatName] === undefined) {
        return undefined;
      }
      if (newRequest.formatDetails[formatName].format === undefined && format && subFormat) {
        const blobId = await melindaClient.createBlob({
          blob: JSON.stringify([{...newRequest, metadataReference: newRequest.metadataReference.filter(i => i.format === newRequest.formatDetails[formatName][other])}]),
          type: 'application/json',
          profile: MELINDA_RECORD_IMPORT_PROFILE
        });
        logger.log('info', `Created new blob ${blobId}`);

        return resolveSubFormatDetails({request: {...newRequest, metadataReference: newRequest.metadataReference.filter(i => newRequest.formatDetails[formatName][other] === i.format)},
          formatName,
          subFormat,
          state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
          blobId,
          other,
          status: 'PENDING_TRANSFORMATION'});
      }
      if (newRequest.formatDetails[formatName].format.includes(subFormat) && format && subFormat) {
        const blobId = await melindaClient.createBlob({
          blob: JSON.stringify([{...newRequest, metadataReference: newRequest.metadataReference.filter(i => i.format === subFormat)}]),
          type: 'application/json',
          profile: MELINDA_RECORD_IMPORT_PROFILE
        });
        logger.log('info', `Created new blob ${blobId}`);
        return resolveSubFormatDetails({request: {...newRequest, metadataReference: newRequest.metadataReference.filter(i => i.format === subFormat)},
          formatName,
          subFormat,
          state: JOB_BACKGROUND_PROCESSING_IN_PROGRESS,
          blobId,
          status: 'PENDING_TRANSFORMATION'});
      }
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

    function resolveFormatDetailsAndMetadata({requests, requestId, formatName, other}) {
      const request = requests.find(item => item.id === requestId);
      if (formatName === 'otherPrintFormat' || formatName === 'otherFileFormat') {
        return request.formatDetails[formatName][other] &&
        {...request, formatDetails: {[formatName]: [request.formatDetails[formatName][other]]}, metadataReference: request.metadataReference.filter(i => request.formatDetails[formatName][other] === i.format)};
      }
      return {...request, formatDetails: {[formatName]: {...request.formatDetails[formatName]}}, metadataReference: request.metadataReference.filter(i => request.formatDetails[formatName].format.includes(i.format))};
    }

    function resolveSubFormatDetails({request, formatName, subFormat, other, state, blobId, status}) {
      if (other) {
        return {
          ...request,
          formatDetails: {
            ...request.formatDetails,
            [formatName]: {
              ...request.formatDetails[formatName],
              [other]: subFormat
            }
          },
          metadataReference: request.metadataReference.filter(item => item.format === subFormat).map(item => updateMetadataReference({item, subFormat, state, status, blobId}))
        };
      }
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

    async function resolveIssnMetadata(acc, request) {
      const withPrintFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'printed'), format: true, formatName: 'printed'});
      const withOnlineFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'online'), format: true, formatName: 'online'});
      const withCdFormat = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === 'cd'), format: true, formatName: 'cd'});
      const withOtherFormatOne = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === getFormat(request, 'otherFormatOne')), format: true, formatName: getFormat(request, 'otherFormatOne')});
      const withOtherFormatTwo = await resolveIssnPendingPromise({newRequests: acc.filter(item => item.formatDetails === getFormat(request, 'otherFormatTwo')), format: true, formatName: getFormat(request, 'otherFormatTwo')});
      const metadataArray = addMetadataReference(request);
      withPrintFormat[0] !== undefined && replaceMetadataSubData(metadataArray, withPrintFormat[0].metadataReference[0], 'printed');
      withOnlineFormat[0] !== undefined && replaceMetadataSubData(metadataArray, withOnlineFormat[0].metadataReference[0], 'online');
      withCdFormat[0] !== undefined && replaceMetadataSubData(metadataArray, withCdFormat[0].metadataReference[0], 'cd');
      withOtherFormatOne[0] !== undefined && replaceMetadataSubData(metadataArray, withOtherFormatOne[0].metadataReference[0], getFormat(request, 'otherFormatOne'));
      withOtherFormatTwo[0] !== undefined && replaceMetadataSubData(metadataArray, withOtherFormatTwo[0].metadataReference[0], getFormat(request, 'otherFormatTwo'));
      return metadataArray;
    }

    function getFormat(req, formatName) {
      return req.formatDetails.filter(i => i.formatName === formatName)[0] === undefined
        ? undefined
        : req.formatDetails.filter(i => i.formatName === formatName)[0].format;
    }

    async function retriveIssnMetadataUpdates(metadataReference, request) {
      const responsePaperFormat = await retriveMetadataAndFormatMetadata('printed', metadataReference);
      const responseOnlineFormat = await retriveMetadataAndFormatMetadata('online', metadataReference);
      const responseCdFormat = await retriveMetadataAndFormatMetadata('cd', metadataReference);
      const responseOtherFormatOne = await retriveMetadataAndFormatMetadata(getFormat(request, 'otherFormatOne'), metadataReference);
      const responseOtherFormatTwo = await retriveMetadataAndFormatMetadata(getFormat(request, 'otherFormatTwo'), metadataReference);
      const metadataArray = addMetadataReference(request);
      responsePaperFormat !== undefined && replaceMetadataSubData(metadataArray, responsePaperFormat, 'printed');
      responseOnlineFormat !== undefined && replaceMetadataSubData(metadataArray, responseOnlineFormat, 'online');
      responseCdFormat !== undefined && replaceMetadataSubData(metadataArray, responseCdFormat, 'cd');
      responseOtherFormatOne !== undefined && replaceMetadataSubData(metadataArray, responseCdFormat, getFormat(request, 'otherFormatOne'));
      responseOtherFormatTwo !== undefined && replaceMetadataSubData(metadataArray, responseCdFormat, getFormat(request, 'otherFormatTwo'));
      return metadataArray;
    }

    async function resolvePrintedInProgress(metadataReference, request, format) {
      const responsePaperback = await retriveMetadataAndFormatMetadata('paperback', metadataReference);
      const responseHardback = await retriveMetadataAndFormatMetadata('hardback', metadataReference);
      const responseSpiralbinding = await retriveMetadataAndFormatMetadata('spiralbinding', metadataReference);
      const responseOtherPrintOne = await retriveMetadataAndFormatMetadata(format, metadataReference);
      const responseOtherPrintTwo = await retriveMetadataAndFormatMetadata(format, metadataReference);
      const metadataArray = addMetadataReference(request);
      responsePaperback !== undefined && replaceMetadataSubData(metadataArray, responsePaperback, 'paperback');
      responseHardback !== undefined && replaceMetadataSubData(metadataArray, responseHardback, 'hardback');
      responseSpiralbinding !== undefined && replaceMetadataSubData(metadataArray, responseSpiralbinding, 'spiralbinding');
      responseOtherPrintOne !== undefined && replaceMetadataSubData(metadataArray, responseOtherPrintOne, format);
      responseOtherPrintTwo !== undefined && replaceMetadataSubData(metadataArray, responseOtherPrintTwo, format);
      return metadataArray;
    }

    async function resolveElectronicInProgress(metadataReference, request, format) {
      const responsePdf = await retriveMetadataAndFormatMetadata('pdf', metadataReference);
      const responseEpub = await retriveMetadataAndFormatMetadata('epub', metadataReference);
      const responseMp3 = await retriveMetadataAndFormatMetadata('mp3', metadataReference);
      const responseCd = await retriveMetadataAndFormatMetadata('cd', metadataReference);
      const responseOtherFileOne = await retriveMetadataAndFormatMetadata(format, metadataReference);
      const responseOtherFileTwo = await retriveMetadataAndFormatMetadata(format, metadataReference);
      const metadataArray = addMetadataReference(request);
      responsePdf !== undefined && replaceMetadataSubData(metadataArray, responsePdf, 'pdf');
      responseEpub !== undefined && replaceMetadataSubData(metadataArray, responseEpub, 'epub');
      responseMp3 !== undefined && replaceMetadataSubData(metadataArray, responseMp3, 'mp3');
      responseCd !== undefined && replaceMetadataSubData(metadataArray, responseCd, 'cd');
      responseOtherFileOne !== undefined && replaceMetadataSubData(metadataArray, responseOtherFileOne, format);
      responseOtherFileTwo !== undefined && replaceMetadataSubData(metadataArray, responseOtherFileTwo, format);
      return metadataArray;
    }


    async function retriveMetadataAndFormatMetadata(subFormat, metadata) {
      const individualMetadata = metadata.find(item => item.format === subFormat);
      const blobId = individualMetadata && individualMetadata.id;
      if (blobId !== undefined) {
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
    }

    async function setBackground({requests, requestId, state, newRequest, type}) {
      const request = requests.find(item => item.id === requestId);
      if (request.publicationType === 'issn') {
        const {publications} = client;
        await publications.update({path: `publications/${type}/${request.id}`, payload: {...newRequest, publisher: newRequest.publisher.id}});
        return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
      }
      const {publications} = client;
      await publications.update({path: `publications/${type}/${request.id}`, payload: {...newRequest, publisher: newRequest.publisher.id}});
      return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
    }
  }


  function updateMetadataReference({item, state, status, blobId}) {
    return blobId ? {...item, status, state, id: blobId} : {...item, status, state};
  }
}
