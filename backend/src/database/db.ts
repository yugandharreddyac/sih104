import { logger } from '../utils/logger';

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';
import { dbQueryDurationSeconds } from '../health/metrics.controller';

/**
 * Typed error class for database failures.
 * Controllers use `instanceof DatabaseError` to reliably return 503.
 */
export class DatabaseError extends Error {
  public readonly originalError: any;
  public readonly isRecoverable: boolean;

  constructor(message: string, originalError?: any, isRecoverable = false) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
    this.isRecoverable = isRecoverable;
  }
}

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool | null = null;
  private connected = false;

  private constructor() {
    if (env.NODE_ENV !== 'test') {
      try {
        this.pool = new Pool({
          connectionString: env.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          statement_timeout: 10000, // Appropriate query timeout
          query_timeout: 10000
        });

        this.pool.on('error', (err) => {
          this.connected = false;
          logger.warn('PostgreSQL pool error', { error: err.message });
        });

        this.pool.on('connect', (client) => {
          this.connected = true;
          // Set statement timeout for every new connection if pool config statement_timeout isn't fully supported by all pg versions
          client.query('SET statement_timeout = 10000').catch(() => {});
        });
      } catch (err) {
        logger.warn('PostgreSQL initialization notice (running with in-memory store)', { error: (err as any).message });
      }
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private isRecoverableError(err: any): boolean {
    const code = String(err?.code);
    // Common connection / timeout errors in postgres
    return ['08000', '08003', '08006', '08001', '08004', '08P01', '57P01', 'ECONNRESET', 'ETIMEDOUT'].includes(code) || 
           err.message?.includes('timeout') || err.message?.includes('socket');
  }

  public async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const firstWord = (text || '').trim().split(/\s+/)[0]?.toLowerCase() || 'other';
    const operation = ['select', 'insert', 'update', 'delete'].includes(firstWord) ? firstWord : 'other';

    if (this.pool) {
      try {
        const result = await this.pool.query<T>(text, params);
        this.connected = true;
        const durationSeconds = (Date.now() - startTime) / 1000;
        dbQueryDurationSeconds.observe({ operation }, durationSeconds);
        return result;
      } catch (error: any) {
        this.connected = false;
        const durationSeconds = (Date.now() - startTime) / 1000;
        dbQueryDurationSeconds.observe({ operation }, durationSeconds);
        throw new DatabaseError(`Database query failed: ${error.message}`, error, this.isRecoverableError(error));
      }
    }
    throw new DatabaseError('Database pool not initialized', null, false);
  }

  public async queryWithRetry<T extends QueryResultRow = any>(text: string, params?: any[], maxRetries = 3): Promise<QueryResult<T>> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await this.query<T>(text, params);
      } catch (error: any) {
        attempt++;
        if (attempt >= maxRetries || !(error instanceof DatabaseError && error.isRecoverable)) {
          throw error;
        }
        logger.warn(`Database query failed, retrying (${attempt}/${maxRetries})...`, { error: error.message });
        await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 100)); // Exponential backoff
      }
    }
    throw new Error('Unreachable');
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new DatabaseError('Database pool not initialized', null, false);
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw new DatabaseError(`Transaction failed: ${e.message}`, e, this.isRecoverableError(e));
    } finally {
      client.release();
    }
  }

  public async checkHealth(): Promise<{ status: string; latencyMs?: number; error?: string }> {
    if (!this.pool) {
      return { status: 'DISCONNECTED', error: 'In-Memory Testing Mode Active' };
    }
    const start = Date.now();
    try {
      // Use query timeout to prevent hanging health checks
      await Promise.race([
        this.pool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Healthcheck timeout')), 3000))
      ]);
      this.connected = true;
      return { status: 'CONNECTED', latencyMs: Date.now() - start };
    } catch (err: any) {
      this.connected = false;
      return { status: 'DISCONNECTED', error: err.message };
    }
  }

  public async probeConnection(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await Promise.race([
        this.pool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Probe timeout')), 3000))
      ]);
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  public isAvailable(): boolean {
    return this.connected;
  }

  public async close(): Promise<void> {
    if (this.pool) {
      logger.info('Closing PostgreSQL connection pool...');
      await this.pool.end();
      this.pool = null;
      this.connected = false;
      logger.info('PostgreSQL connection pool closed.');
    }
  }
}

export const db = DatabaseService.getInstance();
