/**
 * VOXSHIELD Signed Outbound Intervention Webhook Dispatcher
 * Dispatches high-priority security policy & intervention events to external banking/telecom fraud systems.
 * Uses HMAC-SHA256 payload signing, idempotency keys, and exponential backoff retries.
 */

import crypto from 'crypto';
import { env } from '../config/env';
import { AuditService } from '../security/audit.service';
import { PrivacyFirewall } from '../security/privacy_firewall';

export interface WebhookEventPayload {
  eventId: string;
  event: string;
  callId: string;
  riskScore: number | null;
  riskLevel: string;
  action: string;
  reasons: string[];
  timestamp: string;
  correlationId: string;
  metadata?: Record<string, any>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  eventId: string;
  error?: string;
  deliveredAt?: string;
}

export class WebhookDispatcher {
  public static readonly DEFAULT_TIMEOUT_MS = 3000;
  public static readonly MAX_RETRIES = 3;
  private static webhookDeliveries: Map<string, WebhookDeliveryResult> = new Map();

  /**
   * Generates canonical HMAC-SHA256 signature over stringified JSON payload and timestamp.
   */
  public static calculateSignature(payloadString: string, timestamp: string, secret: string): string {
    const canonical = `${timestamp}.${payloadString}`;
    return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  }

  /**
   * Verifies an incoming HMAC-SHA256 signature header (e.g. for mock receiver or unit tests).
   */
  public static verifySignature(
    payloadString: string,
    signatureHeader: string,
    timestamp: string,
    secret: string
  ): boolean {
    if (!signatureHeader || !timestamp || !secret) return false;

    // Expected format: sha256=<hex> or raw hex
    const expectedHex = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;

    const calculatedHex = this.calculateSignature(payloadString, timestamp, secret);

    try {
      const a = Buffer.from(calculatedHex, 'hex');
      const b = Buffer.from(expectedHex, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Dispatches signed intervention webhook to target URL with exponential backoff retries.
   */
  public static async dispatch(
    event: Omit<WebhookEventPayload, 'eventId' | 'timestamp'> & { eventId?: string; timestamp?: string },
    targetUrl?: string,
    customSecret?: string
  ): Promise<WebhookDeliveryResult> {
    const webhookUrl = targetUrl || env.INTERVENTION_WEBHOOK_URL;
    const webhookSecret = customSecret || env.WEBHOOK_SECRET || 'voxshield_default_dev_webhook_secret_2026';

    const eventId = event.eventId || `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = event.timestamp || new Date().toISOString();

    const sanitizedReasons = (event.reasons || []).map((r) => PrivacyFirewall.sanitize(r).sanitizedText);
    const sanitizedMetadata = PrivacyFirewall.sanitizeObject(event.metadata || {});

    const payload: WebhookEventPayload = {
      eventId,
      event: event.event,
      callId: event.callId,
      riskScore: event.riskScore,
      riskLevel: event.riskLevel,
      action: event.action,
      reasons: sanitizedReasons,
      timestamp,
      correlationId: event.correlationId,
      metadata: sanitizedMetadata,
    };

    const payloadString = JSON.stringify(payload);
    const signature = this.calculateSignature(payloadString, timestamp, webhookSecret);
    const idempotencyKey = `idemp-${eventId}`;

    if (!webhookUrl) {
      // In standalone/local mode without webhook configured, record simulated success
      const simulatedResult: WebhookDeliveryResult = {
        success: true,
        statusCode: 200,
        attempts: 1,
        eventId,
        deliveredAt: new Date().toISOString(),
      };
      this.webhookDeliveries.set(eventId, simulatedResult);
      return simulatedResult;
    }

    let lastError: string | undefined = undefined;
    let statusCode: number | undefined = undefined;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-VOXSHIELD-Signature': `sha256=${signature}`,
            'X-VOXSHIELD-Timestamp': timestamp,
            'X-VOXSHIELD-Event-ID': eventId,
            'X-VOXSHIELD-Idempotency-Key': idempotencyKey,
            'X-Correlation-ID': event.correlationId,
          },
          body: payloadString,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        statusCode = response.status;

        if (response.ok) {
          const result: WebhookDeliveryResult = {
            success: true,
            statusCode,
            attempts: attempt,
            eventId,
            deliveredAt: new Date().toISOString(),
          };
          this.webhookDeliveries.set(eventId, result);

          await AuditService.record({
            organizationId: '00000000-0000-0000-0000-000000000001',
            action: 'INTERVENTION_WEBHOOK_DELIVERED',
            resourceType: 'WEBHOOK',
            resourceId: eventId,
            result: 'SUCCESS',
            metadata: { callId: event.callId, action: event.action, statusCode, attempts: attempt },
          }).catch(() => {});

          return result;
        } else {
          lastError = `HTTP ${response.status} ${response.statusText}`;
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError' || controller.signal.aborted) {
          lastError = 'Request timed out';
        } else {
          lastError = err.message || 'Network dispatch error';
        }
      }

      // Exponential backoff wait before retry
      if (attempt < this.MAX_RETRIES) {
        const backoffMs = 250 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    const failureResult: WebhookDeliveryResult = {
      success: false,
      statusCode,
      attempts: this.MAX_RETRIES,
      eventId,
      error: lastError || 'Delivery failed after maximum retries',
    };
    this.webhookDeliveries.set(eventId, failureResult);

    await AuditService.record({
      organizationId: '00000000-0000-0000-0000-000000000001',
      action: 'INTERVENTION_WEBHOOK_FAILED',
      resourceType: 'WEBHOOK',
      resourceId: eventId,
      result: 'ERROR',
      metadata: { callId: event.callId, action: event.action, error: failureResult.error, attempts: this.MAX_RETRIES },
    }).catch(() => {});

    return failureResult;
  }

  public static getDeliveryStatus(eventId: string): WebhookDeliveryResult | null {
    return this.webhookDeliveries.get(eventId) || null;
  }

  public static clearHistory(): void {
    this.webhookDeliveries.clear();
  }
}
