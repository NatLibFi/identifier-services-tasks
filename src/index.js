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

import startApp from './app';

run();

async function run() {
	let task;

	registerInteruptionHandlers();

	task = await startApp();

	function registerInteruptionHandlers() {
		process.on('SIGTERM', handleSignal);
		process.on('SIGINT', handleSignal);

		process.on('uncaughtException', ({stack}) => {
			handleTermination({code: 1, message: stack});
		});

		process.on('unhandledRejection', ({stack}) => {
			handleTermination({code: 1, message: stack});
		});

		function handleTermination({code = 0, message}) {
			if (task) {
				task.stop();
			}

			if (message) {
				console.error(message);
			}

			process.exit(code);
		}

		function handleSignal(signal) {
			handleTermination({code: 1, message: `Received ${signal}`});
		}
	}
}
