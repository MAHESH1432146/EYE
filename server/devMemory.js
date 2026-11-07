// Local trial mode: embedded MongoDB stored in server/.localdb so data survives restarts. Not for real studies.
import fs from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';

fs.mkdirSync('.localdb', { recursive: true });
const mongod = await MongoMemoryServer.create({ instance: { dbPath: '.localdb', storageEngine: 'wiredTiger', port: 27018 } });
process.env.MONGODB_URI = mongod.getUri('force_of_habit');
process.env.JWT_SECRET ||= 'local-trial-secret-change-me';
process.env.RESEARCHER_INVITE_CODE ||= 'dev-invite';
console.log('Trial mode: local database in server/.localdb. Researcher invite code:', process.env.RESEARCHER_INVITE_CODE);

await import('./server.js');
