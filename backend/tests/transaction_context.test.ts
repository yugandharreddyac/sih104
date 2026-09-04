/**
 * VOXSHIELD Transaction Context API Unit & Integration Tests
 */

import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { CallsService } from '../src/calls/calls.service';
import { RiskService } from '../src/risk/risk.service';

describe('Transaction Context API (POST /api/risk/transaction-context)', () => {
  let operatorToken: string;
  let viewerToken: string;
  const testCallId = 'test-tx-call-101';
  const orgId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    operatorToken = TokenService.generateToken({
      userId: 'u-operator-01',
      email: 'operator@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: orgId,
    });

    viewerToken = TokenService.generateToken({
      userId: 'u-viewer-01',
      email: 'viewer@voxshield.local',
      role: RoleName.VIEWER,
      organizationId: orgId,
    });

    await CallsService.createCall({
      organizationId: orgId,
      callerIdentifier: '+1 (555) 987-6543',
      destinationIdentifier: 'EXT-1001',
      externalCallId: testCallId,
    });
  });

  it('should reject unauthenticated transaction context submission with 401', async () => {
    const res = await request(app)
      .post('/api/risk/transaction-context')
      .send({
        callId: testCallId,
        transactionId: 'TX-99881',
        amount: 50000,
        currency: 'INR',
        transactionType: 'FUND_TRANSFER',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject unauthorized role (VIEWER lacking CALLS_STREAM) with 403', async () => {
    const res = await request(app)
      .post('/api/risk/transaction-context')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        callId: testCallId,
        transactionId: 'TX-99882',
        amount: 50000,
        currency: 'INR',
        transactionType: 'FUND_TRANSFER',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should reject invalid payload (missing transactionId or negative amount) with 400', async () => {
    const res1 = await request(app)
      .post('/api/risk/transaction-context')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: testCallId,
        amount: 50000,
      });

    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post('/api/risk/transaction-context')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: testCallId,
        transactionId: 'TX-1',
        amount: -500,
      });

    expect(res2.status).toBe(400);
  });

  it('should accept valid transaction context, store context, and recalculate risk', async () => {
    const res = await request(app)
      .post('/api/risk/transaction-context')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        callId: testCallId,
        transactionId: 'TX-882910',
        amount: 250000,
        currency: 'INR',
        transactionType: 'FUND_TRANSFER',
        beneficiaryChange: true,
        otpRequested: true,
        metadata: {
          destinationAccount: 'ACC-***9921',
          urgencyFlag: true,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transaction.transactionId).toBe('TX-882910');
    expect(res.body.data.transaction.amount).toBe(250000);
    expect(res.body.data.transaction.beneficiaryChange).toBe(true);
    expect(res.body.data.transaction.otpRequested).toBe(true);

    // Verify retrieval from service cache
    const stored = RiskService.getTransactionContext(testCallId);
    expect(stored).not.toBeNull();
    expect(stored!.transactionId).toBe('TX-882910');
    expect(stored!.amount).toBe(250000);
  });
});
