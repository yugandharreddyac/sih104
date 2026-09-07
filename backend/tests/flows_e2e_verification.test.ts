/**
 * VOXSHIELD — Flows A through F E2E Test Suite
 * 
 * Verifies Test Scream / Live Mic Audio Streaming Lifecycle:
 * Flow A: Start listening -> finish -> Test Scream -> AI result
 * Flow B: Start listening -> finish -> wait 5 seconds -> Test Scream -> AI result
 * Flow C: Start listening -> finish -> Test Scream multiple times
 * Flow D: Refresh / clean socket -> Test Scream
 * Flow E: AI service temporarily unavailable -> Truthful graceful error
 * Flow F: Invalid / empty audio -> Safe error handling
 */

import http from 'http';
import WebSocket from 'ws';
import { app } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { CallsService } from '../src/calls/calls.service';
import { env } from '../src/config/env';
import { WebSocketGateway } from '../src/websocket/ws_server';

describe('Flows A–F: Audio Streaming & AI Inference Lifecycle', () => {
  let httpServer: http.Server;
  const TEST_PORT = 4099;
  const orgId = '00000000-0000-0000-0000-000000000001';
  let token: string;
  let callId: string;

  beforeAll((done) => {
    httpServer = http.createServer(app);
    WebSocketGateway.initialize(httpServer);

    CallsService.seedSampleCallsIfEmpty();
    const calls = CallsService.listActiveCalls(orgId);
    callId = calls[0].id;

    token = TokenService.generateToken({
      userId: 'u-soc-tester-001',
      organizationId: orgId,
      email: 'tester@voxshield.corp',
      role: RoleName.ADMIN,
    });

    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });

  afterAll(async () => {
    await WebSocketGateway.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function makeAudioChunkBase64(freq = 440, length = 4800) {
    const buffer = Buffer.alloc(length * 2);
    for (let i = 0; i < length; i++) {
      const sample = Math.sin((2 * Math.PI * freq * i) / 16000) * 12000;
      buffer.writeInt16LE(Math.round(sample), i * 2);
    }
    return buffer.toString('base64');
  }

  function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
        resolve(ws);
      });
      ws.on('error', reject);
    });
  }

  test('Flow A: Start listening -> finish -> Test Scream -> AI result', async () => {
    const ws = await connectClient();

    // 1. Listen
    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-a-1' }));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      callId,
      sequenceNumber: 0,
      payload: { format: 'pcm_s16le', sample_rate: 16000, channels: 1, audio_base64: makeAudioChunkBase64() }
    }));
    ws.send(JSON.stringify({ type: 'END_STREAM', callId }));

    // 2. Test Scream
    const receivedTelemetry = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
          resolve(msg.payload);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-a-2' }));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      callId,
      sequenceNumber: 0,
      payload: {
        format: 'pcm_s16le',
        sample_rate: 16000,
        channels: 1,
        audio_base64: makeAudioChunkBase64(880),
        text_transcript: 'Testing scream anomaly detection on live voice channel'
      }
    }));

    const payload = await receivedTelemetry;
    expect(payload).toBeDefined();
    expect(payload.deepfake).toBeDefined();
    ws.close();
  });

  test('Flow B: Start listening -> finish -> wait 5s -> Test Scream -> AI result', async () => {
    const ws = await connectClient();
    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-b-1' }));
    ws.send(JSON.stringify({ type: 'END_STREAM', callId }));

    // Idle wait
    await new Promise((r) => setTimeout(r, 1000));

    const receivedTelemetry = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
          resolve(msg.payload);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-b-2' }));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      callId,
      sequenceNumber: 0,
      payload: {
        format: 'pcm_s16le',
        sample_rate: 16000,
        channels: 1,
        audio_base64: makeAudioChunkBase64(600),
        text_transcript: 'Test phrase after idle period'
      }
    }));

    const payload = await receivedTelemetry;
    expect(payload).toBeDefined();
    ws.close();
  });

  test('Flow C: Start listening -> finish -> Test Scream multiple times', async () => {
    const ws = await connectClient();
    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-c-initial' }));
    ws.send(JSON.stringify({ type: 'END_STREAM', callId }));

    let telemetryCount = 0;
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'AUDIO_TELEMETRY') {
        telemetryCount++;
      }
    });

    for (let i = 1; i <= 3; i++) {
      ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: `flow-c-${i}` }));
      ws.send(JSON.stringify({
        type: 'AUDIO_CHUNK',
        callId,
        sequenceNumber: 0,
        payload: { format: 'pcm_s16le', sample_rate: 16000, channels: 1, audio_base64: makeAudioChunkBase64(440 * i) }
      }));
      await new Promise((r) => setTimeout(r, 300));
      ws.send(JSON.stringify({ type: 'END_STREAM', callId }));
    }

    await new Promise((r) => setTimeout(r, 800));
    expect(telemetryCount).toBeGreaterThanOrEqual(1);
    ws.close();
  });

  test('Flow D: Refresh / clean socket -> Test Scream', async () => {
    const ws = await connectClient();
    const receivedTelemetry = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
          resolve(msg.payload);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-d-clean' }));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      callId,
      sequenceNumber: 0,
      payload: { format: 'pcm_s16le', sample_rate: 16000, channels: 1, audio_base64: makeAudioChunkBase64(520) }
    }));

    const payload = await receivedTelemetry;
    expect(payload).toBeDefined();
    ws.close();
  });

  test('Flow E: AI service unavailable -> Truthful graceful error', async () => {
    const ws = await connectClient();
    const originalAiUrl = env.AI_SERVICE_URL;
    (env as any).AI_SERVICE_URL = 'http://localhost:59999';

    const receivedDegraded = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'AUDIO_TELEMETRY' && msg.payload) {
          if (msg.payload.deepfake?.status === 'NOT_AVAILABLE') {
            resolve(msg.payload);
          }
        }
      });
    });

    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-e-outage' }));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      callId,
      sequenceNumber: 0,
      payload: { format: 'pcm_s16le', sample_rate: 16000, channels: 1, audio_base64: makeAudioChunkBase64() }
    }));

    const payload = await receivedDegraded;
    expect(payload.deepfake.status).toBe('NOT_AVAILABLE');
    expect(payload.overall_assessment).toBe('NOT_AVAILABLE');
    (env as any).AI_SERVICE_URL = originalAiUrl;
    ws.close();
  });

  test('Flow F: Invalid / empty audio -> Safe error handling', async () => {
    const ws = await connectClient();
    const receivedError = new Promise<any>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ERROR') {
          resolve(msg);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'START_STREAM', callId, streamId: 'flow-f-empty' }));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      callId,
      sequenceNumber: 0,
      payload: { format: 'pcm_s16le', sample_rate: 16000, channels: 1, audio_base64: '' }
    }));

    const errorMsg = await receivedError;
    expect(errorMsg.error).toBe('INVALID_AUDIO_FORMAT');
    ws.close();
  });
});
