/**
 * VOXSHIELD Centralized Resilient AI Service Client
 *
 * Wraps all communication to the AI Python microservice with:
 * - Circuit Breaker pattern (CLOSED -> OPEN -> HALF_OPEN)
 * - Distributed Correlation ID propagation (frontend -> backend -> AI)
 * - Bounded request execution timeouts
 * - Safe degraded responses on outage or malformed responses
 * - Zero raw audio or credential leaks in logs
 */

import { env } from '../config/env';
import { logger, logContextStore } from '../utils/logger';
import { CircuitBreaker, CircuitBreakerOpenError } from '../utils/circuit_breaker';
import { aiInferenceLatencyMs } from '../health/metrics.controller';

export class AiClient {
  private static instance: AiClient;

  public readonly circuitBreaker: CircuitBreaker;

  private constructor() {
    this.circuitBreaker = new CircuitBreaker({
      name: 'ai_service',
      failureThreshold: 4,        // Open after 4 consecutive failures
      resetTimeoutMs: 5000,       // Try half-open probe after 5 seconds
      halfOpenSuccessThreshold: 2, // Close after 2 successful probes
      timeoutMs: 3000,            // 3s max timeout for AI inference
    });
  }

  public static getInstance(): AiClient {
    if (!AiClient.instance) {
      AiClient.instance = new AiClient();
    }
    return AiClient.instance;
  }

  public getCircuitState(): string {
    return this.circuitBreaker.getState();
  }

  public resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Executes a fetch request to the AI microservice wrapped in circuit-breaker protection.
   */
  public async request<T = any>(
    path: string,
    options: RequestInit = {},
    customTimeoutMs?: number
  ): Promise<{ ok: boolean; status: number; data?: T; error?: string; degraded?: boolean }> {
    const context = logContextStore.getStore();
    const correlationId = context?.correlationId || `req-${Date.now()}`;
    const url = `${env.AI_SERVICE_URL}${path.startsWith('/') ? path : `/${path}`}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
      ...(options.headers as Record<string, string> || {}),
    };

    const startTime = Date.now();
    const pathTag = path.split('/')[2] || 'general';

    try {
      const response = await this.circuitBreaker.execute(async (signal) => {
        // If a custom timeout is requested, use it; otherwise circuit breaker defaults apply
        return await fetch(url, {
          ...options,
          headers,
          signal,
        });
      });

      const latencyMs = Date.now() - startTime;
      aiInferenceLatencyMs.observe({ model_type: pathTag, status: response.ok ? 'success' : 'http_error' }, latencyMs);

      if (!response.ok) {
        let errBody: string = '';
        try {
          const jsonErr = await response.json();
          errBody = jsonErr.detail || jsonErr.message || JSON.stringify(jsonErr);
        } catch {
          errBody = `HTTP ${response.status} ${response.statusText}`;
        }
        return {
          ok: false,
          status: response.status,
          error: errBody,
        };
      }

      const data = await response.json();
      return {
        ok: true,
        status: response.status,
        data,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isCircuitOpen = err instanceof CircuitBreakerOpenError;
      aiInferenceLatencyMs.observe({ model_type: pathTag, status: isCircuitOpen ? 'circuit_open' : 'error' }, latencyMs);

      logger.warn(`[AiClient] Request to ${path} failed: ${err.message}`);

      return {
        ok: false,
        status: isCircuitOpen ? 503 : 500,
        error: err.message,
        degraded: true,
      };
    }
  }
}

export const aiClient = AiClient.getInstance();
