import http from 'http';
import { WebSocket } from 'ws';
import { AudioNormalizer } from '../src/calls/audio_normalizer';
import { StreamBuffer, StreamBufferManager } from '../src/calls/stream_buffer';
import { WebSocketGateway } from '../src/websocket/ws_server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { CallsService } from '../src/calls/calls.service';

jest.setTimeout(25000);

describe('Phase 2: Audio Normalization & Format Validation Unit Tests', () => {
  it('should normalize 16-bit linear PCM buffer correctly (identity)', () => {
    // 16000 samples = 1 second of 16kHz mono audio = 32000 bytes
    const dummyPcm = Buffer.alloc(32000);
    for (let i = 0; i < 16000; i++) {
      dummyPcm.writeInt16LE(Math.round(Math.sin(i / 10) * 10000), i * 2);
    }

    const result = AudioNormalizer.normalize(dummyPcm, 16000, 1);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('pcm_s16le');
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(16000);
    expect(result.durationMs).toBe(1000);
    expect(result.base64Data.length).toBeGreaterThan(0);
    expect(result.pcmBuffer.length).toBe(32000);
  });

  it('should resample 8 kHz mono PCM to canonical 16 kHz mono PCM', () => {
    // 8000 samples = 1 second of 8kHz mono audio = 16000 bytes
    const pcm8k = Buffer.alloc(16000);
    for (let i = 0; i < 8000; i++) {
      pcm8k.writeInt16LE(i % 1000, i * 2);
    }

    const result = AudioNormalizer.normalize(pcm8k, 8000, 1);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('pcm_s16le');
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    // 8000 input samples resampled to 16 kHz = 16000 samples = 32000 bytes
    expect(result.sampleCount).toBe(16000);
    expect(result.durationMs).toBe(1000);
    expect(result.pcmBuffer.length).toBe(32000);

    // Verify linear interpolation at halfway points:
    // Sample 0 (srcPos 0) = 0, Sample 1 (srcPos 0.5) = (0 + 1) / 2 = 1 (or 0.5 rounded to 1)
    const s0 = result.pcmBuffer.readInt16LE(0);
    const s1 = result.pcmBuffer.readInt16LE(2);
    expect(s0).toBe(0);
    expect(s1).toBe(1);
  });

  it('should resample 48 kHz mono PCM to canonical 16 kHz mono PCM', () => {
    // 48000 samples = 1 second of 48kHz mono audio = 96000 bytes
    const pcm48k = Buffer.alloc(96000);
    for (let i = 0; i < 48000; i++) {
      pcm48k.writeInt16LE(2500, i * 2);
    }

    const result = AudioNormalizer.normalize(pcm48k, 48000, 1);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('pcm_s16le');
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    // 48000 input samples resampled to 16 kHz = 16000 samples = 32000 bytes
    expect(result.sampleCount).toBe(16000);
    expect(result.durationMs).toBe(1000);
    expect(result.pcmBuffer.length).toBe(32000);
    expect(result.pcmBuffer.readInt16LE(0)).toBe(2500);
  });

  it('should resample 44.1 kHz mono PCM to canonical 16 kHz mono PCM', () => {
    // 44100 samples = 1 second of 44.1kHz audio = 88200 bytes
    const pcm44k = Buffer.alloc(88200);
    for (let i = 0; i < 44100; i++) {
      pcm44k.writeInt16LE(1200, i * 2);
    }

    const result = AudioNormalizer.normalize(pcm44k, 44100, 1);
    expect(result.isValid).toBe(true);
    expect(result.format).toBe('pcm_s16le');
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(16000);
    expect(result.durationMs).toBe(1000);
  });

  it('should reject oversized audio payloads exceeding max chunk limit', () => {
    const oversized = Buffer.alloc(600 * 1024);
    const result = AudioNormalizer.normalize(oversized, 16000, 1);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds maximum chunk size');
  });

  it('should downmix 2-channel stereo PCM and enforce 4-byte frame alignment', () => {
    // 100 stereo samples = 400 bytes + 2 extra odd bytes (incomplete stereo frame)
    const stereoBuffer = Buffer.alloc(402);
    for (let i = 0; i < 100; i++) {
      stereoBuffer.writeInt16LE(2000, i * 4); // Left
      stereoBuffer.writeInt16LE(4000, i * 4 + 2); // Right
    }
    stereoBuffer.writeInt16LE(9999, 400); // Trailing incomplete frame sample

    const result = AudioNormalizer.normalize(stereoBuffer, 16000, 2);
    expect(result.isValid).toBe(true);
    expect(result.channels).toBe(1);
    expect(result.sampleRate).toBe(16000);
    expect(result.sampleCount).toBe(100);

    // Verify averaging: (2000 + 4000) / 2 = 3000
    const firstSample = result.pcmBuffer.readInt16LE(0);
    expect(firstSample).toBe(3000);
  });

  it('should parse WAV header fmt chunk, downmix stereo, and resample 48 kHz to 16 kHz', () => {
    // Construct 48 kHz stereo WAV buffer programmatically
    // 480 stereo samples at 48kHz = 10ms = 1920 bytes PCM data
    const numStereoSamples = 480;
    const pcmDataSize = numStereoSamples * 4;
    const wavBuffer = Buffer.alloc(44 + pcmDataSize);

    // RIFF Header
    wavBuffer.write('RIFF', 0, 'ascii');
    wavBuffer.writeUInt32LE(36 + pcmDataSize, 4);
    wavBuffer.write('WAVE', 8, 'ascii');

    // fmt subchunk
    wavBuffer.write('fmt ', 12, 'ascii');
    wavBuffer.writeUInt32LE(16, 16); // subchunk size
    wavBuffer.writeUInt16LE(1, 20); // audio format: 1 (PCM)
    wavBuffer.writeUInt16LE(2, 22); // channels: 2 (stereo)
    wavBuffer.writeUInt32LE(48000, 24); // sample rate: 48000
    wavBuffer.writeUInt32LE(48000 * 4, 28); // byte rate
    wavBuffer.writeUInt16LE(4, 32); // block align
    wavBuffer.writeUInt16LE(16, 34); // bits per sample: 16

    // data subchunk
    wavBuffer.write('data', 36, 'ascii');
    wavBuffer.writeUInt32LE(pcmDataSize, 40);

    for (let i = 0; i < numStereoSamples; i++) {
      wavBuffer.writeInt16LE(1000, 44 + i * 4); // Left
      wavBuffer.writeInt16LE(3000, 44 + i * 4 + 2); // Right
    }

    // Call normalize without passing explicit rate/channels (it must extract 48k stereo from WAV fmt chunk)
    const result = AudioNormalizer.normalize(wavBuffer);
    expect(result.isValid).toBe(true);
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    // 480 samples at 48kHz resampled to 16kHz = 160 samples (10ms)
    expect(result.sampleCount).toBe(160);
    expect(result.durationMs).toBe(10);
    expect(result.pcmBuffer.readInt16LE(0)).toBe(2000); // (1000 + 3000) / 2 = 2000
  });

  it('should parse WAV with extra chunks before data subchunk', () => {
    // RIFF + fmt + JUNK chunk (12 bytes) + data
    const pcmDataSize = 320; // 160 samples mono
    const extraChunkSize = 12;
    const totalSize = 44 + extraChunkSize + pcmDataSize;
    const wavBuffer = Buffer.alloc(totalSize);

    wavBuffer.write('RIFF', 0, 'ascii');
    wavBuffer.writeUInt32LE(totalSize - 8, 4);
    wavBuffer.write('WAVE', 8, 'ascii');

    // fmt subchunk
    wavBuffer.write('fmt ', 12, 'ascii');
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20); // mono
    wavBuffer.writeUInt16LE(1, 22);
    wavBuffer.writeUInt32LE(16000, 24);
    wavBuffer.writeUInt32LE(32000, 28);
    wavBuffer.writeUInt16LE(2, 32);
    wavBuffer.writeUInt16LE(16, 34);

    // JUNK chunk
    wavBuffer.write('JUNK', 36, 'ascii');
    wavBuffer.writeUInt32LE(4, 40);
    wavBuffer.write('TEST', 44, 'ascii');

    // data subchunk
    wavBuffer.write('data', 48, 'ascii');
    wavBuffer.writeUInt32LE(pcmDataSize, 52);
    for (let i = 0; i < 160; i++) {
      wavBuffer.writeInt16LE(777, 56 + i * 2);
    }

    const result = AudioNormalizer.normalize(wavBuffer);
    expect(result.isValid).toBe(true);
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(160);
    expect(result.pcmBuffer.readInt16LE(0)).toBe(777);
  });

  it('should sanitize Data URI Base64 and whitespace/newlines', () => {
    const rawPcm = Buffer.alloc(320);
    for (let i = 0; i < 160; i++) {
      rawPcm.writeInt16LE(500, i * 2);
    }
    const rawBase64 = rawPcm.toString('base64');
    const dataUri = `data:audio/wav;base64,  \n${rawBase64.slice(0, 10)}\n  ${rawBase64.slice(10)}  \n`;

    const result = AudioNormalizer.normalize(dataUri, 16000, 1);
    expect(result.isValid).toBe(true);
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(160);
    expect(result.pcmBuffer.readInt16LE(0)).toBe(500);
  });

  it('should reject malformed Base64 containing invalid characters', () => {
    const malformed = 'not-valid-base-64-content!@#$%^&*()';
    const result = AudioNormalizer.normalize(malformed, 16000, 1);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Malformed base64');
  });

  it('should handle empty buffer correctly and return canonical metadata', () => {
    const empty = Buffer.alloc(0);
    const result = AudioNormalizer.normalize(empty, 16000, 1);
    expect(result.isValid).toBe(true);
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(0);
    expect(result.durationMs).toBe(0);
    expect(result.pcmBuffer.length).toBe(0);
    expect(result.base64Data).toBe('');
  });

  it('should handle single-sample input buffer safely', () => {
    const single = Buffer.alloc(2);
    single.writeInt16LE(1234, 0);

    const result = AudioNormalizer.normalize(single, 8000, 1);
    expect(result.isValid).toBe(true);
    expect(result.sampleRate).toBe(16000);
    expect(result.channels).toBe(1);
    expect(result.sampleCount).toBe(2); // 1 sample at 8k resamples to 2 samples at 16k
  });

  it('should reject invalid sample rates and channel counts', () => {
    const buffer = Buffer.alloc(1000);
    expect(AudioNormalizer.normalize(buffer, 0, 1).isValid).toBe(false);
    expect(AudioNormalizer.normalize(buffer, -16000, 1).isValid).toBe(false);
    expect(AudioNormalizer.normalize(buffer, 4000, 1).isValid).toBe(false);
    expect(AudioNormalizer.normalize(buffer, 96000, 1).isValid).toBe(false);
    expect(AudioNormalizer.normalize(buffer, NaN as any, 1).isValid).toBe(false);
    expect(AudioNormalizer.normalize(buffer, 16000, 0).isValid).toBe(false);
    expect(AudioNormalizer.normalize(buffer, 16000, 3).isValid).toBe(false);
  });
});

describe('Phase 2: Stream Buffer & Memory Bounds Unit Tests', () => {
  it('should buffer chunks and track sequence numbers accurately', () => {
    const buffer = new StreamBuffer('call-buff-001', 'stream-001');

    const res0 = buffer.push({ sequenceNumber: 0, data: Buffer.alloc(1000) });
    expect(res0.accepted).toBe(true);
    expect(res0.sequenceError).toBe(false);

    const res1 = buffer.push({ sequenceNumber: 1, data: Buffer.alloc(1000) });
    expect(res1.accepted).toBe(true);
    expect(res1.sequenceError).toBe(false);

    // Sequence jump (gap)
    const res3 = buffer.push({ sequenceNumber: 3, data: Buffer.alloc(1000) });
    expect(res3.accepted).toBe(true);
    expect(res3.sequenceError).toBe(true);

    const metrics = buffer.getMetrics();
    expect(metrics.totalChunksReceived).toBe(3);
    expect(metrics.sequenceErrors).toBe(1);
    expect(metrics.currentBufferChunkCount).toBe(3);
  });

  it('should enforce buffer bounds and drop oldest chunks under backpressure', () => {
    const buffer = new StreamBuffer('call-backpressure-002', 'stream-002');
    const chunkSize = 100 * 1024; // 100 KB

    // Push 120 chunks to exceed max 100 chunk limit
    for (let i = 0; i < 120; i++) {
      buffer.push({ sequenceNumber: i, data: Buffer.alloc(chunkSize) });
    }

    const metrics = buffer.getMetrics();
    expect(metrics.currentBufferChunkCount).toBeLessThanOrEqual(100);
    expect(metrics.totalChunksDropped).toBeGreaterThanOrEqual(20);
  });

  it('should clean up session buffers on termination', () => {
    const callId = 'call-cleanup-test-003';
    StreamBufferManager.getOrCreate(callId);
    expect(StreamBufferManager.get(callId)).toBeDefined();

    StreamBufferManager.remove(callId);
    expect(StreamBufferManager.get(callId)).toBeUndefined();
  });
});

describe('Phase 2: Step 2.1 WebSocket Input Validation & RBAC Integration Tests', () => {
  let server: http.Server;
  let port: number;
  let validCallId: string;
  const validOrgId = '00000000-0000-0000-0000-000000000001';
  const otherOrgId = '00000000-0000-0000-0000-000000000002';
  const openSockets: WebSocket[] = [];

  interface TestClient {
    ws: WebSocket;
    receiveNext: () => Promise<any>;
    close: () => Promise<void>;
  }

  beforeAll(async () => {
    CallsService.seedSampleCallsIfEmpty();

    // Create a call in org1
    const call1 = await CallsService.createCall({
      organizationId: validOrgId,
      callerIdentifier: '+1 (555) 019-9999',
      destinationIdentifier: '1-800-VOX-BANK',
    });
    validCallId = call1.id;

    // Create a call in org2 for cross-tenant testing
    await CallsService.createCall({
      organizationId: otherOrgId,
      callerIdentifier: '+1 (555) 019-8888',
      destinationIdentifier: '1-800-OTHER-BANK',
    });

    server = http.createServer();
    WebSocketGateway.initialize(server);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {}
    }
    await WebSocketGateway.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const createWsClient = async (): Promise<TestClient> => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    openSockets.push(ws);
    const messages: any[] = [];
    const waiters: ((msg: any) => void)[] = [];

    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString('utf-8'));
      if (waiters.length > 0) {
        const nextWaiter = waiters.shift()!;
        nextWaiter(parsed);
      } else {
        messages.push(parsed);
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });

    const receiveNext = (): Promise<any> => {
      if (messages.length > 0) {
        return Promise.resolve(messages.shift());
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    };

    const close = async (): Promise<void> => {
      try {
        ws.terminate();
      } catch {}
    };

    return { ws, receiveNext, close };
  };

  it('should receive CONNECTED handshake on connection', async () => {
    const client = await createWsClient();
    const handshake = await client.receiveNext();
    expect(handshake.type).toBe('CONNECTED');
    expect(handshake.requiresAuth).toBe(true);
    await client.close();
  });

  it('should block unauthenticated streaming requests', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    const response = await client.receiveNext();

    expect(response.type).toBe('ERROR');
    expect(response.error).toBe('UNAUTHENTICATED');
    await client.close();
  });

  it('should reject malformed JSON without crashing server', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    client.ws.send('{ invalid json payload');
    const response = await client.receiveNext();

    expect(response.type).toBe('ERROR');
    expect(response.error).toBe('INVALID_PAYLOAD');
    await client.close();
  });

  it('should reject unknown message types for authenticated client', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const token = TokenService.generateToken({
      userId: 'u-op-01',
      email: 'operator@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
    const authRes = await client.receiveNext();
    expect(authRes.type).toBe('AUTHENTICATED');

    client.ws.send(JSON.stringify({ type: 'UNSUPPORTED_OPERATION_XYZ' }));
    const res = await client.receiveNext();
    expect(res.type).toBe('ERROR');
    expect(res.error).toBe('UNKNOWN_MESSAGE_TYPE');
    await client.close();
  });

  it('should reject VIEWER role from streaming operations (RBAC)', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const viewerToken = TokenService.generateToken({
      userId: 'u-viewer-01',
      email: 'viewer@voxshield.local',
      role: RoleName.VIEWER,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: viewerToken } }));
    const authRes = await client.receiveNext();
    expect(authRes.type).toBe('AUTHENTICATED');

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    const res = await client.receiveNext();
    expect(res.type).toBe('ERROR');
    expect(res.error).toBe('FORBIDDEN');
    expect(res.message).toContain('calls:stream');
    await client.close();
  });

  it('should allow authorized OPERATOR role to start stream on existing call', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const operatorToken = TokenService.generateToken({
      userId: 'u-op-02',
      email: 'operator2@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorToken } }));
    await client.receiveNext(); // AUTHENTICATED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    const res = await client.receiveNext();
    expect(res.type).toBe('STREAM_STARTED');
    expect(res.callId).toBe(validCallId);
    await client.close();
  });

  it('should reject nonexistent callId on START_STREAM', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const operatorToken = TokenService.generateToken({
      userId: 'u-op-03',
      email: 'operator3@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorToken } }));
    await client.receiveNext(); // AUTHENTICATED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: 'non-existent-call-uuid-999' }));
    const res = await client.receiveNext();
    expect(res.type).toBe('ERROR');
    expect(res.error).toBe('CALL_NOT_FOUND');
    await client.close();
  });

  it('should reject cross-organization call access for non-admin user', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    // User in Org-2 attempting to access Call in Org-1
    const token = TokenService.generateToken({
      userId: 'u-op-org2',
      email: 'operator@org2.local',
      role: RoleName.OPERATOR,
      organizationId: otherOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
    await client.receiveNext(); // AUTHENTICATED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    const res = await client.receiveNext();
    expect(res.type).toBe('ERROR');
    expect(res.error).toBe('FORBIDDEN');
    expect(res.message).toContain('another organization');
    await client.close();
  });

  it('should reject AUDIO_CHUNK with negative sequence number', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const token = TokenService.generateToken({
      userId: 'u-op-04',
      email: 'operator4@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
    await client.receiveNext(); // AUTHENTICATED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    await client.receiveNext(); // STREAM_STARTED

    client.ws.send(
      JSON.stringify({
        type: 'AUDIO_CHUNK',
        callId: validCallId,
        sequenceNumber: -1,
        payload: { audio_base64: Buffer.alloc(320).toString('base64') },
      })
    );
    const res = await client.receiveNext();
    expect(res.type).toBe('ERROR');
    expect(res.error).toBe('INVALID_SEQUENCE_NUMBER');
    await client.close();
  });

  it('should reject AUDIO_CHUNK with fractional sequence number', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const token = TokenService.generateToken({
      userId: 'u-op-05',
      email: 'operator5@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
    await client.receiveNext(); // AUTHENTICATED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    await client.receiveNext(); // STREAM_STARTED

    client.ws.send(
      JSON.stringify({
        type: 'AUDIO_CHUNK',
        callId: validCallId,
        sequenceNumber: 2.718,
        payload: { audio_base64: Buffer.alloc(320).toString('base64') },
      })
    );
    const res = await client.receiveNext();
    expect(res.type).toBe('ERROR');
    expect(res.error).toBe('INVALID_SEQUENCE_NUMBER');
    await client.close();
  });

  it('should reject AUDIO_CHUNK with invalid sample rate or channels', async () => {
    const client = await createWsClient();
    await client.receiveNext(); // consume CONNECTED

    const token = TokenService.generateToken({
      userId: 'u-op-06',
      email: 'operator6@voxshield.local',
      role: RoleName.OPERATOR,
      organizationId: validOrgId,
    });

    client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
    await client.receiveNext(); // AUTHENTICATED

    client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
    await client.receiveNext(); // STREAM_STARTED

    // Invalid sample rate: 0
    client.ws.send(
      JSON.stringify({
        type: 'AUDIO_CHUNK',
        callId: validCallId,
        sequenceNumber: 0,
        payload: { audio_base64: Buffer.alloc(320).toString('base64'), sample_rate: 0 },
      })
    );
    const res1 = await client.receiveNext();
    expect(res1.type).toBe('ERROR');
    expect(res1.error).toBe('INVALID_SAMPLE_RATE');

    // Invalid channels: 5
    client.ws.send(
      JSON.stringify({
        type: 'AUDIO_CHUNK',
        callId: validCallId,
        sequenceNumber: 0,
        payload: { audio_base64: Buffer.alloc(320).toString('base64'), channels: 5 },
      })
    );
    const res2 = await client.receiveNext();
    expect(res2.type).toBe('ERROR');
    expect(res2.error).toBe('INVALID_CHANNELS');

    await client.close();
  });

  describe('Phase 2: Step 2.6 Telemetry Resilience & Failure Propagation Tests', () => {
    it('should broadcast models.asr and models.social_engineering as NOT_AVAILABLE on AI degradation', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const client = await createWsClient();
      await client.receiveNext(); // consume CONNECTED

      const token = TokenService.generateToken({
        userId: 'u-op-07',
        email: 'operator7@voxshield.local',
        role: RoleName.OPERATOR,
        organizationId: validOrgId,
      });

      client.ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token } }));
      await client.receiveNext(); // AUTHENTICATED

      client.ws.send(JSON.stringify({ type: 'START_STREAM', callId: validCallId }));
      await client.receiveNext(); // STREAM_STARTED

      // Stream a valid chunk during offline AI state
      client.ws.send(
        JSON.stringify({
          type: 'AUDIO_CHUNK',
          callId: validCallId,
          sequenceNumber: 0,
          payload: { audio_base64: Buffer.alloc(3200).toString('base64'), sample_rate: 16000, channels: 1 },
        })
      );

      // Next message should be AUDIO_TELEMETRY
      const telemetryMsg = await client.receiveNext();
      expect(telemetryMsg.type).toBe('AUDIO_TELEMETRY');
      expect(telemetryMsg.payload.models.asr).toBe('NOT_AVAILABLE');
      expect(telemetryMsg.payload.models.social_engineering).toBe('NOT_AVAILABLE');
      expect(telemetryMsg.payload.models.deepfake).toBe('NOT_AVAILABLE');
      expect(telemetryMsg.payload.models.speaker).toBe('NOT_AVAILABLE');
      expect(telemetryMsg.payload.models.replay).toBe('NOT_AVAILABLE');

      // Next message should be UNIFIED_RISK_ASSESSMENT (NOT ASR_FINAL or SOCIAL_ENGINEERING_ALERT because transcript and score are null)
      const riskMsg = await client.receiveNext();
      expect(riskMsg.type).toBe('UNIFIED_RISK_ASSESSMENT');
      expect(riskMsg.payload.status).toBe('NOT_AVAILABLE');
      expect(riskMsg.payload.risk_level).toBe('INCONCLUSIVE');

      await client.close();
    });
  });
});
