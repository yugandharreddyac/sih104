import { Pool, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env';

/**
 * Typed error class for database failures.
 * Controllers use `instanceof DatabaseError` to reliably return 503.
 */
export class DatabaseError extends Error {
  public readonly originalError: any;

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
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
          connectionTimeoutMillis: 2000,
        });

        this.pool.on('error', (err) => {
          this.connected = false;
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
        const result = await this.pool.query<T>(text, params);
        this.connected = true;
        return result;
      } catch (error: any) {
        this.connected = false;
        throw new DatabaseError(`Database query failed: ${error.message}`, error);
      }
    }
    throw new DatabaseError('Database pool not initialized');
  }

  public async checkHealth(): Promise<{ status: string; latencyMs?: number; error?: string }> {
    if (!this.pool) {
      return { status: 'STANDALONE_FALLBACK', latencyMs: 0 };
    }
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      this.connected = true;
      return { status: 'CONNECTED', latencyMs: Date.now() - start };
    } catch (err: any) {
      this.connected = false;
      return { status: 'DISCONNECTED', error: err.message };
    }
  }

  /**
   * Lightweight probe for readiness checks. Returns true if the pool
   * can successfully execute a trivial query.
   */
  public async probeConnection(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * Returns the last known connection state.
   * Does NOT perform a live probe — use probeConnection() for that.
   */
  public isAvailable(): boolean {
    return this.connected;
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = DatabaseService.getInstance();
