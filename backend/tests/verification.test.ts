import request from 'supertest';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';

describe('Step-Up Out-of-Band Verification Tests', () => {
  const supervisorToken = TokenService.generateToken({
    userId: 'u-sup',
    email: 'supervisor@voxshield.security',
    role: RoleName.SUPERVISOR,
    organizationId: '00000000-0000-0000-0000-000000000001',
  });

  let createdVerificationId: string;

  it('should trigger independent step-up verification without relying on caller voice', async () => {
    const res = await request(app)
      .post('/api/verification')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        callId: '00000000-0000-0000-0000-000000000001',
        mechanism: 'AUTHENTICATOR_PUSH',
        targetIdentity: 'executive-cfo@corp.com',
        payload: { action: 'HIGH_VALUE_TRANSFER_APPROVAL', amount: 500000 },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.targetIdentityMasked).toBe('exe***om');
    expect(res.body.data.notes).toContain('Independent step-up verification');

    createdVerificationId = res.body.data.id;
  });

  it('should resolve verification status to APPROVED upon external IdP confirmation', async () => {
    const res = await request(app)
      .patch(`/api/verification/${createdVerificationId}/resolve`)
      .set('Authorization', `Bearer ${supervisorToken}`)
      .send({
        status: 'APPROVED',
        notes: 'Confirmed via Okta Push Notification with biometric face ID.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
  });
});
