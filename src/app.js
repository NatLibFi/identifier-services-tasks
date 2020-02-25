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
	JOB_TYPE,
	JOB_SUB_TYPE,
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
	JOB_PUBLICATION_ISBN_ISMN_BIBLIOGRAPHIC_METADATA_PENDING,
	JOB_PUBLICATION_ISBN_ISMN_BIBLIOGRAPHIC_METADATA_INPROGRESS,
	JOB_PUBLICATION_ISSN_BIBLIOGRAPHIC_METADATA_PENDING,
	JOB_PUBLICATION_ISSN_BIBLIOGRAPHIC_METADATA_INPROGRESS,
	REQUEST_TTL,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_USERS,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN,
	JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN,
	MELINDA_STATE,
	MELINDA_JOB_TYPE
} from './config';

const {createLogger, handleInterrupt} = Utils;

export default function () {
	taskServer();

	async function taskServer() {
		const Logger = createLogger();
		const client = new MongoClient(MONGO_URI, {useNewUrlParser: true, useUnifiedTopology: true});
		const Mongo = await client.connect();

		Mongo.on('error', err => {
			Logger.log('error', 'Error stack' in err ? err.stact : err);
			process.exit(1);
		});

		await initDb();
		const taskServer = await initTask();

		taskServer.on('close', async () => {
			await Mongo.close(0);
		});

		return taskServer;

		async function initTask() {
			const agenda = new Agenda({mongo: Mongo.db(), maxConcurrency: MAX_CONCURRENCY});
			agenda.on('error', graceful);
			agenda.on('ready', () => {
				const opts = TZ ? {timezone: TZ} : {};

				createMelindaJobs(agenda);
				createCleanupJobs(agenda);
				createRequestUsers(agenda);
				createRequestPublishers(agenda);
				createRequestPublicationIssn(agenda);
				createRequestPublicationIsbnIsmn(agenda);

				createAgendaFromArray(JOB_STATE);
				createAgendaFromArray(MELINDA_STATE);

				function createAgendaFromArray(state) {
					if (Array.isArray(state)) {
						state.forEach(subState => {
							if (state === MELINDA_STATE) {
								createMelindaAgenda(subState);
							}

							if (state === JOB_STATE) {
								createAgenda(subState);
							}
						});
					} else {
						if (state === MELINDA_STATE) {
							createMelindaAgenda(state);
						}

						if (state === JOB_STATE) {
							createAgenda(state);
						}
					}
				}

				setTimeout(() =>
					agenda.every(
						REQUEST_TTL,
						createJobArray(JOB_TYPE, JOB_SUB_TYPE, undefined, selectCleanUpType),
						undefined,
						opts
					), Number(REQUEST_TTL.split(' ')[0]) * 1000
				);

				agenda.start();

				function createAgenda(state) {
					if (state === 'new') {
						agenda.every(
							JOB_FREQ_REQUEST_STATE_NEW,
							createJobArray(JOB_TYPE, JOB_SUB_TYPE, state, selectRequestAgendaType),
							undefined,
							opts
						);
					}

					if (state === 'accepted') {
						agenda.every(
							JOB_FREQ_REQUEST_STATE_ACCEPTED,
							createJobArray(JOB_TYPE, JOB_SUB_TYPE, state, selectRequestAgendaType),
							{},
							opts
						);
					}

					if (state === 'rejected') {
						agenda.every(
							JOB_FREQ_REQUEST_STATE_REJECTED,
							createJobArray(JOB_TYPE, JOB_SUB_TYPE, state, selectRequestAgendaType),
							undefined,
							opts
						);
					}
				}

				function createMelindaAgenda(state) {
					if (state === 'pending') {
						agenda.every(
							JOB_FREQ_PENDING,
							createJobArray(MELINDA_JOB_TYPE, undefined, state, selectMelindaJobType),
							undefined,
							opts);
					}

					if (state === 'inProgress') {
						agenda.every(
							JOB_FREQ_IN_PROGRESS,
							createJobArray(MELINDA_JOB_TYPE, undefined, state, selectMelindaJobType),
							undefined,
							opts);
					}
				}

				function createJobArray(type, subType, state, callback) {
					if (Array.isArray(type)) {
						return type.reduce((acc, t) => {
							if (t === 'publications' && Array.isArray(subType)) {
								subType.map(subitem => acc.push(callback(t, subitem, state))
								);
							}

							acc.push(callback(t, undefined, state));
							return acc;
						}, []);
					}

					return [callback(type, undefined, state)];
				}

				function selectRequestAgendaType(type, subType, state) {
					if (state === 'new') {
						if (type === 'users') {
							return JOB_USER_REQUEST_STATE_NEW;
						}

						if (type === 'publishers') {
							return JOB_PUBLISHER_REQUEST_STATE_NEW;
						}

						if (type === 'publications') {
							if (subType === 'isbn-ismn') {
								return JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_NEW;
							}

							return JOB_PUBLICATION_ISSN_REQUEST_STATE_NEW;
						}
					}

					if (state === 'accepted') {
						if (type === 'users') {
							return JOB_USER_REQUEST_STATE_ACCEPTED;
						}

						if (type === 'publishers') {
							return JOB_PUBLISHER_REQUEST_STATE_ACCEPTED;
						}

						if (type === 'publications') {
							if (subType === 'isbn-ismn') {
								return JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_ACCEPTED;
							}

							return JOB_PUBLICATION_ISSN_REQUEST_STATE_ACCEPTED;
						}
					}

					if (state === 'rejected') {
						if (type === 'users') {
							return JOB_USER_REQUEST_STATE_REJECTED;
						}

						if (type === 'publishers') {
							return JOB_PUBLISHER_REQUEST_STATE_REJECTED;
						}

						if (type === 'publications') {
							if (subType === 'isbn-ismn') {
								return JOB_PUBLICATION_ISBNISMN_REQUEST_STATE_REJECTED;
							}

							return JOB_PUBLICATION_ISSN_REQUEST_STATE_REJECTED;
						}
					}
				}

				function selectCleanUpType(type, subType) {
					if (type === 'users') {
						return JOB_REQUEST_BG_PROCESSING_CLEANUP_USERS;
					}

					if (type === 'publishers') {
						return JOB_REQUEST_BG_PROCESSING_CLEANUP_PUBLISHERS;
					}

					if (type === 'pubications') {
						if (subType === 'isbn-ismn') {
							return JOB_REQUEST_BG_PROCESSING_CLEANUP_ISBN_ISMN;
						}

						if (subType === 'issn') {
							return JOB_REQUEST_BG_PROCESSING_CLEANUP_ISSN;
						}
					}
				}

				function selectMelindaJobType(metadataState, type) {
					if (metadataState === 'pending') {
						if (type === 'isbn-ismn') {
							return JOB_PUBLICATION_ISBN_ISMN_BIBLIOGRAPHIC_METADATA_PENDING;
						}

						if (type === 'issn') {
							return JOB_PUBLICATION_ISSN_BIBLIOGRAPHIC_METADATA_PENDING;
						}
					}

					if (metadataState === 'inProgress') {
						if (type === 'isbn-ismn') {
							return JOB_PUBLICATION_ISBN_ISMN_BIBLIOGRAPHIC_METADATA_INPROGRESS;
						}

						if (type === 'issn') {
							return JOB_PUBLICATION_ISSN_BIBLIOGRAPHIC_METADATA_INPROGRESS;
						}
					}
				}
			});

			return agenda;

			async function graceful(arg) {
				await agenda.stop();
				handleInterrupt(arg);
				process.exit(0);
			}
		}

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
	}
}
