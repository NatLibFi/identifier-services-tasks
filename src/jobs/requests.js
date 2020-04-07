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
import fs from 'fs';
import {JWE, JWK, JWT} from 'jose';
import {
  UI_URL,
  API_URL,
  SMTP_URL,
  REQUEST_JOBS,
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

  REQUEST_JOBS.forEach(job => {
    agenda.define(job.jobName, {concurrency: 1}, async (_, done) => {
      await request(done, job.jobState, job.jobCategory, job.jobSubCat);
    });
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
        query: {queries: [{query: {state, backgroundProcessingState: 'pending'}}], offset: null},
        messageCallback: count => `${count} requests for ${type} ${subtype} are pending`, type, subtype
      });
    }
  }

  async function processCallback(requests, type, subtype) {
    await Promise.all(requests.map(async request => {
      await setBackground(request, type, subtype, 'inProgress');
      if (request.state === 'new') {
        if (type !== 'users') {
          await sendEmail({
            Name: `${type} request new`,
            getTemplate,
            SMTP_URL,
            API_EMAIL: isEmail(request.creator) ? request.creator : await getUserEmail(request.creator)
          });
          await sendEmail({
            Name: `${type} request new`,
            getTemplate,
            SMTP_URL,
            API_EMAIL
          });

          return setBackground(request, type, subtype, 'processed');
        }

        await sendEmail({
          name: `${type} request new`,
          getTemplate,
          SMTP_URL,
          API_EMAIL
        });
        return setBackground(request, type, subtype, 'processed');

      }

      if (request.state === 'rejected') {
        await sendEmail({
          name: `${type} request rejected`,
          args: request.rejectionReason,
          getTemplate,
          SMTP_URL,
          API_EMAIL: isEmail(request.creator) ? request.creator : await getUserEmail(request.creator)
        });
        return setBackground(request, type, subtype, 'processed');
      }

      if (request.state === 'accepted') {
        try {
          await createResource(request, type, subtype);
        } catch (error) {
          logger.log('error', `${error}`);
        }

        if (type !== 'users') {
          return sendEmail({
            name: `${type} request accepted`,
            getTemplate,
            SMTP_URL,
            API_EMAIL: isEmail(request.creator) ? request.creator : await getUserEmail(request.creator)
          });
        }
      }
    }));

    async function setBackground(request, type, subtype, state) {
      const newPayload = {...request, backgroundProcessingState: state};
      const filteredDoc = filterDoc(newPayload);
      const {requests} = client;
      if (type === 'users') {
        await requests.update({path: `requests/${type}/${request.id}`, payload: {...filteredDoc, initialRequest: true}});
        return logger.log('info', `Background processing State changed to ${state} for${request.id}`);

      }

      if (type === 'publishers') {
        await requests.update({path: `requests/${type}/${request.id}`, payload: filteredDoc});
        return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
      }

      if (type === 'publications') {
        await requests.update({path: `requests/${type}/${subtype}/${request.id}`, payload: filteredDoc});
        return logger.log('info', `Background processing State changed to ${state} for${request.id}`);
      }

      function filterDoc(doc) {
        return Object.entries(doc)
          .filter(([key]) => key === 'id' === false)
          .reduce((acc, [
            key,
            value
          ]) => ({...acc, [key]: value}), {});
      }
    }
  }

  async function processRequest({client, processCallback, messageCallback, query, type, subtype}) {
    const {requests} = client;
    await perform();
    async function perform() {
      if (type === 'users' || type === 'publishers') {
        const response = await requests.fetchList({path: `requests/${type}`, query});
        const result = await response.json();
        if (result.results) {
          logger.log('debug', messageCallback(result.results.length));
          return processCallback(result.results, type, subtype);
        }
      }

      if (type === 'publications') {
        const response = await requests.fetchList({path: `requests/${type}/${subtype}`, query});
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
    const result = await create(request, type, subtype);
    const filteredDoc = filterDoc(result);
    const payload = {...filteredDoc, backgroundProcessingState: 'processed'};

    if (type === 'users') {
      await update({path: `requests/${type}/${request.id}`, payload});
      return logger.log('info', `${type} requests updated for ${request.id} `);
    }

    if (type === 'publishers') {
      await update({path: `requests/${type}/${request.id}`, payload});
      return logger.log('info', `${type} requests updated for ${request.id} `);
    }

    if (type === 'publications') {
      await update({path: `requests/${type}/${subtype}/${request.id}`, payload});
      return logger.log('info', `${type}${subtype} requests updated for ${request.id} `);
    }
    function filterDoc(doc) {
      return Object.entries(doc)
        .filter(([key]) => filter(key))
        .reduce((acc, [
          key,
          value
        ]) => ({...acc, [key]: value}), {});
    }
    function filter(key) {
      const allowedKeys = [
        'isbnRange',
        'ismnRange',
        'rejectionReason',
        'id'
      ];
      return allowedKeys.includes(key) === false;
    }
  }

  function formatPublisher(request) {
    const filteredDoc = filterDoc(request);
    const formatRequest = {
      ...filteredDoc,
      email: request.publisherEmail,
      primaryContact: request.primaryContact.map(item => item.email),
      activity: {
        active: true,
        yearInactivated: 0
      },
      metadataDelivery: 'manual'
    };
    return formatRequest;
    function filterDoc(doc) {
      return Object.entries(doc)
        .filter(([key]) => filter(key))
        .reduce((acc, [
          key,
          value
        ]) => ({...acc, [key]: value}), {});
    }
    function filter(key) {
      const allowedKeys = [
        'backgroundProcessingState',
        'state',
        'rejectionReason',
        'creator',
        'notes',
        'createdResource',
        'publisherEmail',
        'id'
      ];
      return allowedKeys.includes(key) === false;
    }
  }

  function formatPublication(request) {
    const filteredDoc = filterDoc(request);
    return {...filteredDoc};

    function filterDoc(doc) {
      return Object.entries(doc)
        .filter(([key]) => filter(key))
        .reduce((acc, [
          key,
          value
        ]) => ({...acc, [key]: value}), {});
    }
    function filter(key) {
      const allowedKeys = [
        'backgroundProcessingState',
        'state',
        'rejectionReason',
        'creator',
        'notes',
        'lastUpdated',
        'role',
        'id'
      ];
      return allowedKeys.includes(key) === false;
    }
  }

  function formatUsers(request) {
    const filteredDoc = filterDoc(request);
    return {...filteredDoc};
    function filterDoc(doc) {
      return Object.entries(doc)
        .filter(([key]) => filter(key))
        .reduce((acc, [
          key,
          value
        ]) => ({...acc, [key]: value}), {});
    }
    function filter(key) {
      const allowedKeys = [
        'backgroundProcessingState',
        'state',
        'rejectionReason',
        'creator',
        'mongoId',
        'lastUpdated'
      ];
      return allowedKeys.includes(key) === false;
    }
  }

  function removePublisher(doc) {
    return Object.entries(doc)
      .filter(([key]) => key === 'publisher' === false)
      .reduce((acc, [
        key,
        value
      ]) => ({...acc, [key]: value}), {});
  }

  async function create(request, type, subtype) {
    const rangeQueries = {queries: [{query: {active: true}}], offset: null};
    const {users, publishers, publications, ranges} = client;
    const {update} = client.requests;

    if (type === 'users') {
      await users.create({path: type, payload: formatUsers(request)});
      const response = await users.read(`${type}/${request.email}`);
      await sendEmailToCreator(type, request, response);
      await createLinkAndSendEmail(type, request, response);
      logger.log('info', `Resource for ${type} has been created`);
      return request;
    }

    if (type === 'publishers') {
      const result = await publishers.create({path: type, payload: formatPublisher(request)});
      logger.log('info', `Resource for ${type} has been created`);
      return {...request, createdResource: result};
    }

    if (type === 'publications') {
      if (subtype === 'isbn-ismn') {
        // Get publisher from publication creation request
        const newPublisher = request.publisher;
        // Remove Publisher from Publication creation request
        const publication = removePublisher(request);
        // Create Publisher
        const range = publication.type === 'music' ? await ranges.read(`ranges/ismn/${newPublisher.range}`) : await ranges.read(`ranges/isbn/${newPublisher.range}`);
        const result = await publishers.create({path: 'publishers', payload: formatPublisher(newPublisher)});

        const resPublication = await publications.fetchList({path: 'publications/isbn-ismn', query: {queries: [{query: {associatedRange: newPublisher.range}}], offset: null}});
        const publicationList = await resPublication.json();

        const newIdentifierTitle = calculateIdentifierTitle(publicationList, range);
        const newPublication = {
          ...publication,
          publisher: result,
          associatedRange: newPublisher.range,
          metadataReference: {state: 'pending'},
          identifier: calculateIdentifier({newIdentifierTitle, range, publication})
        };
        const createdId = await publications.create({path: `${type}/isbn-ismn`, payload: formatPublication(newPublication)});
        logger.log('info', `Resource for ${type} isbn-ismn has been created`);
        return {...request, createdResource: createdId};

      }

      if (subtype === 'issn') {
        // Fetch ranges
        const identifierLists = await determineIdentifierList();
        if (identifierLists.results.length === 0) {
          return logger.log('info', 'No Active Ranges Found');
        }
        const {results} = identifierLists;
        const [activeRange] = results;
        // Fetch Publication Issn
        const resPublication = await publications.fetchList({path: `publications/${subtype}`, query: {queries: [{query: {associatedRange: activeRange.id}}], offset: null}});
        const publicationList = await resPublication.json();
        // Create Publisher if user is anonymous or publisher details is provided
        const payload = Object.keys(request.publisher).length === 0 ? request : await createPublisher(request);
        const newPublication = calculateNewIdentifier({identifierList: publicationList.results.map(item => item.identifier), subtype});
        await publications.create({path: `${type}/${subtype}`, payload: formatPublication({...payload, associatedRange: activeRange.id, identifier: newPublication, publicationType: subtype})});
        logger.log('info', `Resource for ${type}${subtype} has been created`);
        isLastInRange(newPublication, activeRange, update, subtype);

        return request;

      }
    }

    function calculateIdentifierTitle(publicationList, range) {
      if (publicationList.results.length === 0) {
        return range.rangeStart;
      }

      const publicationIdentifier = publicationList.results.map(item => item.identifier);
      const identiferTitle = publicationIdentifier.reduce((acc, cVal) => acc.concat(cVal), []);
      // Get list of title if identifiers
      const slicedTitle = identiferTitle.map(item => item.id.slice(11, 15)); // ['0001', '0002', '0003']
      const intIdentifierTitle = slicedTitle.map(item => Number(item));
      const newIdentifierTitle = Math.max(...intIdentifierTitle) + 1;
      return newIdentifierTitle;
    }

    function calculateIdentifier({newIdentifierTitle, range, publication}) {
      if (publication.formatDetails.format === 'electronic' || publication.formatDetails.format === 'printed') {
        return {
          id: calculateIsbnIsmnIdentifier(range, newIdentifierTitle),
          type: publication.formatDetails.format
        };
      }

      if (publication.formatDetails.format === 'printed-and-electronic') {
        const identifier = [
          newIdentifierTitle,
          newIdentifierTitle + 1
        ];
        const res = identifier.map((item, i) => ({
          id: calculateIsbnIsmnIdentifier(range, item),
          type: i === 0 ? 'printed' : 'electronic'
        }));
        return res;
      }
    }

    async function createPublisher(request) {
      if (subtype === 'issn') {
        const publisher = await publishers.create({path: 'publishers', payload: formatPublisher(request.publisher)});
        logger.log('info', `Resource for publishers has been created`);
        return {...request, publisher};
      }
    }

    function determineIdentifierList() {
      if (subtype === 'isbn-ismn') {
        if (request.type === 'music') {
          return identifierLists('ismn');
        }
        return identifierLists('isbn');
      }
      return identifierLists('issn');

      async function identifierLists(v) {
        const response = await ranges.fetchList({path: `ranges/${v}`, query: rangeQueries});
        return response.json();
      }
    }
  }

  async function isLastInRange(newPublication, activeRange, update, subtype) {
    if (newPublication.slice(5, 8) === activeRange.rangeEnd) {
      const newPayload = {...activeRange, active: false};
      const filteredDoc = filterDoc(newPayload);
      const res = await update({path: `ranges/${subtype}/${activeRange.id}`, filteredDoc});
      if (res === 200) {
        return sendEmailToAdministrator();
      }
    }
    function filterDoc(doc) {
      return Object.entries(doc)
        .filter(([key]) => key === 'id' === false)
        .reduce((acc, [
          key,
          value
        ]) => ({...acc, [key]: value}), {});
    }
  }

  async function sendEmailToAdministrator() {
    const result = await sendEmail({
      name: 'reply to a creator', // Need to create its own template later *****************
      getTemplate,
      SMTP_URL,
      API_EMAIL
    });
    return result;
  }

  async function sendEmailToCreator(type, request, response) {
    const result = await sendEmail({
      name: 'reply to a creator',
      args: response,
      getTemplate,
      SMTP_URL,
      API_EMAIL: await getUserEmail(request.creator)
    });
    return result;
  }

  function calculateNewIdentifier({identifierList, subtype}) {
    if (subtype === 'issn') {
      return calculateNewISSN(identifierList);
    }

    if (subtype === 'isbnIsmn') {
      return 'newIdentifier';
    }
  }

  function calculateIsbnIsmnIdentifier(range, title) {
    const beforeCheckDigit = `${range.prefix}${title}`;
    const split = beforeCheckDigit.split('');
    const calculateMultiply = split.map((item, i) => {
      if (i === 0 || i % 2 === 0) {
        return Number(item);
      }

      return Number(item * 3);
    });
    const addTotal = calculateMultiply.reduce((acc, val) => acc + val, 0);
    const remainder = addTotal % 10;
    const checkDigit = 10 - remainder;
    const formatIdentifier = `${beforeCheckDigit.slice(0, 3)}-${
      beforeCheckDigit.slice(3, 6)}-${
      beforeCheckDigit.slice(6, 8)}-${
      beforeCheckDigit.slice(8, 12)}-${
      checkDigit}`;
    return formatIdentifier;
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
        const m = (combine.length + 1 - index) * item;
        return Number(acc) + Number(m);
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
      args: {link, ...response},
      getTemplate,
      SMTP_URL,
      API_EMAIL: response.emails[0].value
    });
    return result;
  }

  async function getTemplate(query, cache) {
    const key = JSON.stringify(query);
    if (key in cache) {
      return cache[key];
    }

    const templateResult = {...cache, [key]: await client.templates.getTemplate(query)};
    return templateResult[key];
  }

  async function getUserEmail(userId) {
    const {users} = client;
    const readResponse = await users.read(`users/${userId}`);
    return readResponse.emails[0].value;
  }

  function isEmail(text) {
    const regex = /(?<id>[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/giu;
    return regex.test(text);
  }
}
