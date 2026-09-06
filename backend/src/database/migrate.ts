import fs from 'fs';
import path from 'path';
import { db } from './db';
import { logger } from '../utils/logger';

export async function runMigrations(): Promise<void> {
  if (!db.isAvailable()) {
    logger.warn('Skipping migrations: Database is not available. Using in-memory fallback.');
    return;
  }

  try {
    const initSqlPath = path.join(__dirname, '../../../infrastructure/docker/init-db.sql');
    if (!fs.existsSync(initSqlPath)) {
      logger.warn(`Migration script not found at ${initSqlPath}`);
      return;
    }

    logger.info('Starting PostgreSQL schema initialization...');
    const sql = fs.readFileSync(initSqlPath, 'utf8');

    // Split by semicolons for basic execution if needed, or run as a single script
    // pg supports running multiple statements in one query if it's a simple script
    await db.queryWithRetry(sql, [], 3);

    logger.info('PostgreSQL schema initialization completed successfully.');
  } catch (err: any) {
    logger.error('Failed to run database migrations', { error: err.message });
    throw err;
  }
}
