import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  callId?: string;
}

export const logContextStore = new AsyncLocalStorage<LogContext>();

/**
 * A lightweight structured logger for Node.js.
 * Automatically injects trace context (correlationId, tenantId, callId) if available.
 * Output is JSON for machine readability in production, enforcing privacy rules.
 */
class Logger {
  private format(level: string, message: string, meta: Record<string, any> = {}) {
    const context = logContextStore.getStore() || {};
    
    // Explicitly strip sensitive keys if they accidentally made it into meta
    const safeMeta = { ...meta };
    const sensitiveKeys = ['otp', 'pin', 'password', 'cvv', 'card', 'rawAudio', 'transcript', 'webhook_secret', 'signature'];
    
    for (const key of Object.keys(safeMeta)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        safeMeta[key] = '[REDACTED]';
      }
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context.correlationId || safeMeta.correlationId,
      tenantId: context.tenantId || safeMeta.tenantId,
      callId: context.callId || safeMeta.callId,
      ...safeMeta,
    };

    // Remove undefined fields for cleaner output
    for (const key of Object.keys(logEntry)) {
      if ((logEntry as any)[key] === undefined) {
        delete (logEntry as any)[key];
      }
    }

    return JSON.stringify(logEntry);
  }

  info(message: string, meta?: Record<string, any>) {
    console.info(this.format('INFO', message, meta));
  }

  warn(message: string, meta?: Record<string, any>) {
    console.warn(this.format('WARN', message, meta));
  }

  error(message: string, error?: any, meta?: Record<string, any>) {
    const errMeta = error instanceof Error ? { error: error.message, stack: error.stack } : { error };
    console.error(this.format('ERROR', message, { ...meta, ...errMeta }));
  }

  debug(message: string, meta?: Record<string, any>) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.format('DEBUG', message, meta));
    }
  }
}

export const logger = new Logger();
