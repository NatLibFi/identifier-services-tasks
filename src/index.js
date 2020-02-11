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
import Agenda from 'agenda';
import {createRequestUsers, createRequestPublishers, createRequestPublicationIssn, createRequestPublicationIsbnIsmn, createMelindaJobs, createCleanupJobs} from './jobs';
import {MongoClient, MongoError} from 'mongodb';
import {
	MONGO_URI,
	TZ,
	MAX_CONCURRENCY,
	JOB_STATE,
	JOB_FREQ_PENDING,
	JOB_FREQ_IN_PROGRESS,
	JOB_FREQ_REQUEST_STATE_NEW,
	JOB_FREQ_REQUEST_STATE_ACCEPTED,
	JOB_FREQ_REQUEST_STATE_REJECTED,
	JOB_USER_REQUEST_STATE_NEW,
	JOB_USER_REQUEST_STATE_ACCEPTED,
	JOB_USER_REQUEST_STATE_REJECTED,
	JOB_PUBLISHER_REQUEST_STATE_NEW,
	JOB_PUBLISHER_REQUEST_STATE_ACCEPTED,
	JOB_PUBLISHER_REQUEST_STATE_REJECTED,
	JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW,
	JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED,
	JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED,
	JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW,
	JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED,
	JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED,
	JOB_BIBLIOGRAPHIC_METADATA_PENDING,
	JOB_BIBLIOGRAPHIC_METADATA_INPROGRESS,
	REQUEST_TTL,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_USERS,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN
} from './config';

const {createLogger, handleInterrupt} = Utils;

run();

export default async function run() {
	const Logger = createLogger();
	const client = new MongoClient(MONGO_URI, {useNewUrlParser: true, useUnifiedTopology: true});
	const Mongo = await client.connect();
	Mongo.on('error', err => {
		Logger.log('error', 'Error stack' in err ? err.stact : err);
		process.exit(1);
	});

	process
		.on('SIGTERM', handleExit)
		.on('SIGINT', handleExit)
		.on('unhandledRejection', handleExit)
		.on('uncaughtException', handleExit);

	await initDb();
	const agenda = new Agenda({mongo: Mongo.db(), maxConcurrency: MAX_CONCURRENCY});
	agenda.on('error', handleExit);
	agenda.on('ready', () => {
		const opts = TZ ? {timezone: TZ} : {};

		createMelindaJobs(agenda);
		createCleanupJobs(agenda);
		createRequestUsers(agenda);
		createRequestPublishers(agenda);
		createRequestPublicationIssn(agenda);
		createRequestPublicationIsbnIsmn(agenda);

		if (Array.isArray(JOB_STATE)) {
			JOB_STATE.forEach(state => {
				createAgenda(state);
			});
		} else {
			createAgenda(JOB_STATE);
		}

		function createAgenda(state) {
			if (state === 'new') {
				agenda.every(
					JOB_FREQ_REQUEST_STATE_NEW,
					[JOB_USER_REQUEST_STATE_NEW, JOB_PUBLISHER_REQUEST_STATE_NEW, JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW, JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW],
					undefined,
					opts
				);
			}

			if (state === 'accepted') {
				agenda.every(
					JOB_FREQ_REQUEST_STATE_ACCEPTED,
					[JOB_USER_REQUEST_STATE_ACCEPTED, JOB_PUBLISHER_REQUEST_STATE_ACCEPTED, JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED, JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED],
					{},
					opts
				);
			}

			if (state === 'rejected') {
				agenda.every(
					JOB_FREQ_REQUEST_STATE_REJECTED,
					[JOB_USER_REQUEST_STATE_REJECTED, JOB_PUBLISHER_REQUEST_STATE_REJECTED, JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED, JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED],
					undefined,
					opts
				);
			}
		}

		agenda.every(JOB_FREQ_PENDING, JOB_BIBLIOGRAPHIC_METADATA_PENDING, undefined, opts);
		agenda.every(JOB_FREQ_IN_PROGRESS, JOB_BIBLIOGRAPHIC_METADATA_INPROGRESS, undefined, opts);
		agenda.every(
			REQUEST_TTL,
			[JOB_REQUEST_BG_PROCESSING_CLEANUP_USERS, JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS, JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN, JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN],
			undefined,
			opts
		);

		agenda.start();
	});

	async function initDb() {
		const db = Mongo.db();
		try {
			// Remove collection because it causes problems after restart
			await db.dropCollection('agendaJobs');
			await db.createCollection('agendaJobs');
		} catch (err) {
			// NamespaceNotFound === Collection doesn't exist
			if (err instanceof MongoError && err.code === 26) {
				return;
			}

			throw err;
		}
	}

	async function handleExit(arg) {
		await Mongo.close();
		await graceful();
		handleInterrupt(arg);
	}

	async function graceful() {
		await agenda.stop();
		process.exit(0);
	}
}
