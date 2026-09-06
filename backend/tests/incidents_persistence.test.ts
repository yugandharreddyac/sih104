import { db } from '../src/database/db';
import { IncidentsService } from '../src/incidents/incidents.service';
import { v4 as uuidv4 } from 'uuid';

describe('IncidentsService PostgreSQL Persistence', () => {
  const orgId = uuidv4();
  const callId = uuidv4();

  beforeAll(async () => {
    // We are running against the local test database (or in-memory mock if offline)
    // Create necessary foreign key dependencies to test persistence if db is online.
    if (db.isAvailable()) {
      try {
        await db.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Test Org', $2)`, [orgId, `test-org-${Date.now()}`]);
        await db.query(`INSERT INTO calls (id, organization_id, caller_identifier, destination_identifier) VALUES ($1, $2, '+15551234567', 'BANK')`, [callId, orgId]);
      } catch (err) {
        console.warn('Failed to setup test dependencies. DB might be offline or schema missing.', err);
      }
    }
  });

  afterAll(async () => {
    if (db.isAvailable()) {
      try {
        await db.query('DELETE FROM calls WHERE id = $1', [callId]);
        await db.query('DELETE FROM organizations WHERE id = $1', [orgId]);
      } catch {}
      await db.close();
    }
  });

  it('should persist incident to PostgreSQL and retrieve it', async () => {
    IncidentsService.clearIncidents();

    const incident = await IncidentsService.createIncident({
      organizationId: orgId,
      severity: 'HIGH',
      attackClassification: 'TEST_ATTACK',
      callId: callId,
      summary: 'Test incident creation for DB',
      triggeredPolicies: ['Policy 1'],
      actionsTaken: ['Action 1'],
    });

    expect(incident).toBeDefined();
    expect(incident.id).toBeDefined();
    expect(incident.status).toBe('OPEN');

    if (db.isAvailable()) {
      expect(incident.metadata._degraded_persistence).toBeUndefined(); // Should have successfully persisted

      // Retrieve via Service
      const retrieved = await IncidentsService.getIncidentById(incident.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(incident.id);
      expect(retrieved?.severity).toBe('HIGH');
      expect(retrieved?.triggeredPolicies).toContain('Policy 1');
      expect(retrieved?.events.length).toBeGreaterThan(0);

      // Verify it is actually in the DB by running direct query
      const dbRow = await db.query('SELECT * FROM incidents WHERE id = $1', [incident.id]);
      expect(dbRow.rows.length).toBe(1);
      expect(dbRow.rows[0].incident_number).toBe(incident.incidentNumber);
    } else {
      expect(incident.metadata._degraded_persistence).toBe(true);
    }
  });

  it('should persist incident updates to PostgreSQL', async () => {
    const incident = await IncidentsService.createIncident({
      organizationId: orgId,
      severity: 'LOW',
      attackClassification: 'TEST_ATTACK_2',
      summary: 'Another test incident',
    });

    const updated = await IncidentsService.updateStatus(incident.id, 'RESOLVED', undefined, 'Resolved it');
    expect(updated.status).toBe('RESOLVED');

    if (db.isAvailable()) {
      const retrieved = await IncidentsService.getIncidentById(incident.id);
      expect(retrieved?.status).toBe('RESOLVED');
      expect(retrieved?.resolvedAt).toBeDefined();

      const events = await db.query('SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at DESC', [incident.id]);
      expect(events.rows[0].event_type).toBe('STATUS_CHANGED_RESOLVED');
    }
  });

  it('should correlate and escalate incident with DB updates', async () => {
    const uniqueCallId = uuidv4();
    if (db.isAvailable()) {
      await db.query(`INSERT INTO calls (id, organization_id, caller_identifier, destination_identifier) VALUES ($1, $2, '+15551234568', 'BANK2')`, [uniqueCallId, orgId]);
    }

    // Create an open incident on the call
    const inc1 = await IncidentsService.createIncident({
      organizationId: orgId,
      severity: 'MEDIUM',
      attackClassification: 'TEST_ATTACK_3',
      callId: uniqueCallId,
      summary: 'Initial incident',
    });

    // Escalate
    const escalated = await IncidentsService.correlateOrEscalateIncident({
      organizationId: orgId,
      severity: 'CRITICAL',
      attackClassification: 'TEST_ATTACK_4',
      callId: uniqueCallId,
      summary: 'Escalation trigger',
    });

    expect(escalated.isNew).toBe(false);
    expect(escalated.incident.id).toBe(inc1.id);
    expect(escalated.incident.severity).toBe('CRITICAL');

    if (db.isAvailable()) {
      const retrieved = await IncidentsService.getIncidentById(inc1.id);
      expect(retrieved?.severity).toBe('CRITICAL');
    }
  });

  it('should fall back to in-memory store if DB is offline or insert fails', async () => {
    // Intentionally pass an invalid organizationId UUID to force a foreign key failure
    const badOrgId = uuidv4();
    const incident = await IncidentsService.createIncident({
      organizationId: badOrgId,
      severity: 'MEDIUM',
      attackClassification: 'FAIL_TEST',
      summary: 'Should fail DB insert and fallback',
    });

    expect(incident).toBeDefined();
    expect(incident.metadata._degraded_persistence).toBe(true);

    // Should still be retrievable via memory fallback
    const retrieved = await IncidentsService.getIncidentById(incident.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(incident.id);
  });
});
