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
import {createRequestJobs, createMelindaJobs, createCleanupJobs} from './jobs';
import {MongoClient, MongoError} from 'mongodb';
import {
	MONGO_URI,
	TZ,
	MAX_CONCURRENCY,
	JOBS
} from './config';

const {createLogger, handleInterrupt} = Utils;

export default async function () {
	const Logger = createLogger();
	const client = new MongoClient(MONGO_URI, {useNewUrlParser: true, useUnifiedTopology: true});
	const Mongo = await client.connect();
	Mongo.on('error', err => {
		Logger.log('error', 'Error stack' in err ? err.stact : err);
		return err;
	});

	await initDb();
	const agenda = new Agenda({mongo: Mongo.db(), maxConcurrency: MAX_CONCURRENCY});
	agenda.on('error', graceful);
	agenda.on('ready', () => {
		const opts = TZ ? {timezone: TZ} : {};

		createRequestJobs(agenda);
		createMelindaJobs(agenda);
		createCleanupJobs(agenda);

		JOBS.forEach(job => {
			agenda.every(job.jobFreq, job.jobName, undefined, opts);
		});

		agenda.start();
	});
	return agenda;

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

	async function graceful(arg) {
		handleInterrupt(arg);
		await agenda.stop();
	}
}
