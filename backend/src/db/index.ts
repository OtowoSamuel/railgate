import Database from 'better-sqlite3';
import path from 'path';
import { schema } from './schema';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/db.sqlite');

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
import fs from 'fs';
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(schema);

export default db;
