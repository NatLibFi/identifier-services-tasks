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
import startTask from './app';
const {handleInterrupt} = Utils;

run();

async function run() {
  interuptionHandlers();
  const task = await startTask();

  function interuptionHandlers() {
    process
      .on('SIGTERM', handleSignal)
      .on('SIGINT', handleSignal)
      .on('unhandledRejection', handleInterrupt)
      .on('uncaughtException', handleInterrupt);
  }

  function handleSignal(signal) {
    if (task) {
      task.stop();
      return handleInterrupt(signal);
    }
    handleInterrupt(signal);
  }
}
