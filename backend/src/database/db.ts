import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool | null = null;
  private isConnected = false;

  private constructor() {
    if (env.NODE_ENV !== 'test') {
      try {
        this.pool = new Pool({
          connectionString: env.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
          console.warn('⚠️ PostgreSQL pool notice:', err.message);
        });
      } catch (err) {
        console.warn('⚠️ PostgreSQL initialization fallback to mock store:', err);
      }
    }
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (this.pool) {
      try {
        return await this.pool.query<T>(text, params);
      } catch (error) {
        throw error;
      }
    }
    throw new Error('Database pool not initialized');
  }

  public async checkHealth(): Promise<{ status: string; latencyMs?: number; error?: string }> {
    if (!this.pool) {
      return { status: 'STANDALONE_FALLBACK', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { status: 'CONNECTED', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'DISCONNECTED', error: err.message };
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = DatabaseService.getInstance();
