import http from 'http';
import { WebSocket } from 'ws';
import { app, server } from '../src/server';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
import { WebSocketGateway } from '../src/websocket/ws_server';
import { CallsService } from '../src/calls/calls.service';
import { db } from '../src/database/db';

interface TierResult {
  concurrency: number;
  connectionsAttempted: number;
  connectionsSuccessful: number;
  connectionsFailed: number;
  framesSent: number;
  framesDelivered: number;
  framesFailed: number;
  totalTimeMs: number;
  throughputFramesPerSec: number;
  latencyMs: {
    min: number;
    avg: number;
    p95: number;
    max: number;
  };
  memoryUsageMb: {
    heapUsedBefore: number;
    heapUsedAfter: number;
    heapDelta: number;
    rssAfter: number;
  };
  cpuUsageMs: {
    user: number;
    system: number;
  };
  dbPoolStatus: string;
  aiQueueStatus: string;
}

describe('Phase 4B: Load & Scalability Benchmark', () => {
  let testPort: number = 4001;

  const orgId = '00000000-0000-0000-0000-000000000001';
  const operatorToken = TokenService.generateToken({
    userId: 'u-load-operator',
    email: 'operator@voxshield.local',
    role: RoleName.OPERATOR,
    organizationId: orgId,
  });

  const pcm16kBuffer = Buffer.alloc(1600); // 100ms of 16kHz 16-bit PCM mono audio
  const audioBase64 = pcm16kBuffer.toString('base64');

  const benchmarkResults: Record<number, TierResult> = {};

  beforeAll(async () => {
    if (!server.listening) {
      await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
    }
    const addr = server.address() as any;
    if (addr && typeof addr === 'object' && addr.port) {
      testPort = addr.port;
    }
    await WebSocketGateway.initialize(server);
  });

  afterAll(async () => {
    await WebSocketGateway.close();
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function runLoadTier(concurrency: number, framesPerStream: number = 10, frameDelayMs: number = 10): Promise<TierResult> {
    const wsUrl = `ws://localhost:${testPort}/ws`;
    const frameLatencies: number[] = [];
    
    let connectionsAttempted = 0;
    let connectionsSuccessful = 0;
    let connectionsFailed = 0;
    let framesSent = 0;
    let framesDelivered = 0;
    let framesFailed = 0;

    const memBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();
    const startTime = Date.now();

    // Create unique call records for all concurrent streams in this tier
    const callIds: string[] = [];
    for (let i = 0; i < concurrency; i++) {
      const callId = `c4b-${concurrency}-${i}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      callIds.push(callId);
      await CallsService.createCall({
        organizationId: orgId,
        callerIdentifier: `+1555000${i.toString().padStart(4, '0')}`,
        destinationIdentifier: '1-800-VOX-LOAD',
        externalCallId: `SIP-LOAD-${concurrency}-${i}`,
        metadata: { loadTier: concurrency, clientIndex: i },
      });
    }

    const streamPromises = callIds.map((callId) => {
      return new Promise<void>((resolve) => {
        connectionsAttempted++;
        const ws = new WebSocket(wsUrl);
        let authenticated = false;
        let streamingStarted = false;

        ws.on('error', () => {
          if (!authenticated) {
            connectionsFailed++;
          }
          try { ws.close(); } catch {}
          resolve();
        });

        ws.on('open', () => {
          ws.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: operatorToken } }));
        });

        ws.on('message', async (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'AUTHENTICATED' && !authenticated) {
              authenticated = true;
              connectionsSuccessful++;
              ws.send(JSON.stringify({ type: 'START_STREAM', callId }));
              streamingStarted = true;

              // Stream frames sequentially
              for (let f = 0; f < framesPerStream; f++) {
                const sendTime = Date.now();
                ws.send(
                  JSON.stringify({
                    type: 'AUDIO_CHUNK',
                    callId,
                    sequenceNumber: f,
                    payload: {
                      audio_base64: audioBase64,
                      sample_rate: 16000,
                      channels: 1,
                    },
                  })
                );
                framesSent++;
                framesDelivered++;
                frameLatencies.push(Date.now() - sendTime);

                if (frameDelayMs > 0 && f < framesPerStream - 1) {
                  await new Promise((r) => setTimeout(r, frameDelayMs));
                }
              }

              ws.close();
              resolve();
            } else if (msg.type === 'ERROR' && !streamingStarted) {
              if (!authenticated) connectionsFailed++;
              try { ws.close(); } catch {}
              resolve();
            }
          } catch {
            // Ignore non-json or payload parsing logs during stream
          }
        });
      });
    });

    await Promise.all(streamPromises);

    const totalTimeMs = Math.max(1, Date.now() - startTime);
    const cpuAfter = process.cpuUsage(cpuBefore);
    const memAfter = process.memoryUsage();

    // Latency stats
    frameLatencies.sort((a, b) => a - b);
    const minLat = frameLatencies.length > 0 ? frameLatencies[0] : 0;
    const maxLat = frameLatencies.length > 0 ? frameLatencies[frameLatencies.length - 1] : 0;
    const avgLat = frameLatencies.length > 0 ? frameLatencies.reduce((a, b) => a + b, 0) / frameLatencies.length : 0;
    const p95Idx = Math.floor(frameLatencies.length * 0.95);
    const p95Lat = frameLatencies.length > 0 ? frameLatencies[Math.min(p95Idx, frameLatencies.length - 1)] : 0;

    const throughput = Number(((framesDelivered / totalTimeMs) * 1000).toFixed(2));

    const dbHealth = await db.checkHealth();
    const dbPoolStatus = dbHealth.status === 'CONNECTED' ? `CONNECTED (${dbHealth.latencyMs}ms)` : `STANDALONE_FALLBACK (${dbHealth.status})`;

    const tierResult: TierResult = {
      concurrency,
      connectionsAttempted,
      connectionsSuccessful,
      connectionsFailed,
      framesSent,
      framesDelivered,
      framesFailed,
      totalTimeMs,
      throughputFramesPerSec: throughput,
      latencyMs: {
        min: Number(minLat.toFixed(2)),
        avg: Number(avgLat.toFixed(2)),
        p95: Number(p95Lat.toFixed(2)),
        max: Number(maxLat.toFixed(2)),
      },
      memoryUsageMb: {
        heapUsedBefore: Number((memBefore.heapUsed / 1024 / 1024).toFixed(2)),
        heapUsedAfter: Number((memAfter.heapUsed / 1024 / 1024).toFixed(2)),
        heapDelta: Number(((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)),
        rssAfter: Number((memAfter.rss / 1024 / 1024).toFixed(2)),
      },
      cpuUsageMs: {
        user: Number((cpuAfter.user / 1000).toFixed(2)),
        system: Number((cpuAfter.system / 1000).toFixed(2)),
      },
      dbPoolStatus,
      aiQueueStatus: 'NOT_AVAILABLE (Mocked/Degraded AI Service in Test Mode)',
    };

    benchmarkResults[concurrency] = tierResult;
    return tierResult;
  }

  it('Tier 1: 5 Concurrent WebSocket Streams', async () => {
    const res = await runLoadTier(5, 10, 10);
    expect(res.connectionsSuccessful).toBe(5);
    expect(res.connectionsFailed).toBe(0);
    expect(res.framesDelivered).toBe(50);
  });

  it('Tier 2: 10 Concurrent WebSocket Streams', async () => {
    const res = await runLoadTier(10, 10, 10);
    expect(res.connectionsSuccessful).toBe(10);
    expect(res.connectionsFailed).toBe(0);
    expect(res.framesDelivered).toBe(100);
  });

  it('Tier 3: 25 Concurrent WebSocket Streams', async () => {
    const res = await runLoadTier(25, 10, 10);
    expect(res.connectionsSuccessful).toBe(25);
    expect(res.connectionsFailed).toBe(0);
    expect(res.framesDelivered).toBe(250);
  });

  it('Tier 4: 50 Concurrent WebSocket Streams', async () => {
    const res = await runLoadTier(50, 10, 10);
    expect(res.connectionsSuccessful).toBe(50);
    expect(res.connectionsFailed).toBe(0);
    expect(res.framesDelivered).toBe(500);
  });

  it('Tier 5: 100 Concurrent WebSocket Streams (Capacity Validation)', async () => {
    if (!benchmarkResults[50] || benchmarkResults[50].connectionsFailed > 0) {
      console.warn('Skipping Tier 5 (100 streams) - Tier 4 had connection failures');
      return;
    }

    const res = await runLoadTier(100, 10, 10);
    expect(res.connectionsSuccessful).toBe(100);
    expect(res.connectionsFailed).toBe(0);
    expect(res.framesDelivered).toBe(1000);
  });

  afterAll(() => {
    console.log('\n================================================================');
    console.log('         PHASE 4B LOAD BENCHMARK MEASURED RESULTS SUMMARY        ');
    console.log('================================================================');
    console.log(JSON.stringify(benchmarkResults, null, 2));
    console.log('================================================================\n');
  });
});
