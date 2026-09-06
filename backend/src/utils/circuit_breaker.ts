/**
 * VOXSHIELD Production Circuit Breaker & Resilient Execution Utility
 *
 * Implements standard Michael Nygard Circuit Breaker pattern:
 * - CLOSED: Operations execute normally. Failures are counted.
 * - OPEN: Fast-fail without attempting downstream call, executing degraded fallback.
 * - HALF_OPEN: Trial probe requests test if the downstream dependency has recovered.
 *
 * Includes:
 * - Exponential backoff with full jitter
 * - Configurable failure threshold, recovery probe threshold, and reset timeouts
 * - Prometheus metrics integration
 * - Zero secrets or sensitive data exposure in logs
 */

import { logger } from './logger';
import {
  circuitBreakerState,
  circuitBreakerTripsTotal,
  circuitBreakerFallbacksTotal,
} from '../health/metrics.controller';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions<T = any> {
  name: string;
  failureThreshold?: number;       // Consecutive failures before opening (default: 5)
  resetTimeoutMs?: number;         // Time to remain in OPEN before transitioning to HALF_OPEN (default: 10000ms)
  halfOpenSuccessThreshold?: number; // Consecutive successful probes in HALF_OPEN before closing (default: 2)
  timeoutMs?: number;              // Individual request execution timeout (default: 3000ms)
  fallback?: (error: Error) => Promise<T> | T; // Optional fallback generator
}

export interface RetryOptions {
  maxRetries?: number;             // Maximum retry attempts (default: 3)
  baseDelayMs?: number;            // Initial backoff delay in ms (default: 100)
  maxDelayMs?: number;             // Max backoff cap in ms (default: 2000)
  shouldRetry?: (error: any) => boolean; // Predicate deciding whether error is transient/retryable
}

export class CircuitBreakerOpenError extends Error {
  public readonly serviceName: string;
  constructor(serviceName: string) {
    super(`Circuit breaker for '${serviceName}' is OPEN. Fast-failing downstream request.`);
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
  }
}

export class CircuitBreakerTimeoutError extends Error {
  public readonly serviceName: string;
  public readonly timeoutMs: number;
  constructor(serviceName: string, timeoutMs: number) {
    super(`Operation for '${serviceName}' timed out after ${timeoutMs}ms.`);
    this.name = 'CircuitBreakerTimeoutError';
    this.serviceName = serviceName;
    this.timeoutMs = timeoutMs;
  }
}

export class CircuitBreaker<T = any> {
  public readonly name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextProbeAllowedTime: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly timeoutMs: number;
  private readonly fallback?: (error: Error) => Promise<T> | T;

  constructor(options: CircuitBreakerOptions<T>) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 10000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fallback = options.fallback;

    this.updateMetrics();
  }

  public getState(): CircuitState {
    // If OPEN and reset timeout expired, transition to HALF_OPEN for trial probe
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextProbeAllowedTime) {
      this.transitionTo(CircuitState.HALF_OPEN);
    }
    return this.state;
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public getSuccessCount(): number {
    return this.successCount;
  }

  public reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.transitionTo(CircuitState.CLOSED);
  }

  public forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  private transitionTo(newState: CircuitState, reason?: string): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    if (newState === CircuitState.OPEN) {
      this.lastFailureTime = Date.now();
      this.nextProbeAllowedTime = this.lastFailureTime + this.resetTimeoutMs;
      circuitBreakerTripsTotal.inc({ service: this.name, reason: reason || 'threshold_exceeded' });
      logger.warn(`[CircuitBreaker:${this.name}] Transitioned from ${oldState} -> OPEN. Next trial at +${this.resetTimeoutMs}ms. Reason: ${reason || 'failures'}`);
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
      logger.info(`[CircuitBreaker:${this.name}] Transitioned from ${oldState} -> HALF_OPEN. Allowing trial probes.`);
    } else if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      logger.info(`[CircuitBreaker:${this.name}] Transitioned from ${oldState} -> CLOSED. Upstream health verified.`);
    }

    this.updateMetrics();
  }

  private updateMetrics(): void {
    try {
      const stateVal = this.state === CircuitState.CLOSED ? 0 : this.state === CircuitState.HALF_OPEN ? 1 : 2;
      circuitBreakerState.set({ service: this.name }, stateVal);
    } catch {
      // Ignore in tests where Prometheus registry might not be registered
    }
  }

  /**
   * Executes the given action wrapped with timeout, circuit breaker protection, and optional fallback.
   */
  public async execute<R = T>(action: (signal: AbortSignal) => Promise<R>, customFallback?: (err: Error) => Promise<R> | R): Promise<R> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      const openErr = new CircuitBreakerOpenError(this.name);
      return this.handleFallback(openErr, customFallback);
    }

    const controller = new AbortController();
    let timeoutHandle: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new CircuitBreakerTimeoutError(this.name, this.timeoutMs));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([action(controller.signal), timeoutPromise]);
      this.onSuccess();
      return result;
    } catch (err: any) {
      this.onFailure(err);
      return this.handleFallback(err, customFallback);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // In CLOSED state, reset consecutive failure count on successful execution
      this.failureCount = 0;
    }
  }

  private onFailure(err: any): void {
    this.failureCount++;
    const errMsg = err?.message || 'Unknown error';

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure during trial probe immediately re-trips back to OPEN
      this.transitionTo(CircuitState.OPEN, `Probe failed: ${errMsg}`);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN, `Reached ${this.failureCount} consecutive failures. Last error: ${errMsg}`);
      }
    }
  }

  private async handleFallback<R = T>(err: Error, customFallback?: (err: Error) => Promise<R> | R): Promise<R> {
    const activeFallback = customFallback || (this.fallback as any);
    if (activeFallback) {
      circuitBreakerFallbacksTotal.inc({ service: this.name });
      return await activeFallback(err);
    }
    throw err;
  }
}

/**
 * Resilient Retry Helper with Jittered Exponential Backoff
 * Prevents retry storms by applying randomized full-jitter backoff.
 */
export async function executeWithRetry<R>(
  operation: (attempt: number) => Promise<R>,
  options: RetryOptions = {}
): Promise<R> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      lastError = err;

      if (attempt >= maxRetries || !shouldRetry(err)) {
        throw err;
      }

      // Exponential backoff with full jitter: delay = rand(0, min(maxDelay, baseDelay * 2^attempt))
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const jitteredDelay = Math.floor(Math.random() * expDelay);

      logger.warn(`[Retry:${attempt}/${maxRetries}] Operation failed (${err?.message || 'Error'}). Retrying in ${jitteredDelay}ms...`);
      await new Promise((res) => setTimeout(res, jitteredDelay));
    }
  }

  throw lastError;
}
