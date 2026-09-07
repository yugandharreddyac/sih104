import WebSocket from 'ws';

async function testPipeline() {
  console.log('=== STARTING LIVE PIPELINE E2E VERIFICATION ===');
  
  // 1. Authenticate like frontend
  const authRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analyst@voxshield.security', password: 'VoxShield@2026!' })
  });
  const authData: any = await authRes.json();
  const token = authData.data?.token || authData.token;
  console.log('[AUTH] Token acquired:', Boolean(token));

  // 2. Fetch active calls
  const callsRes = await fetch('http://localhost:4000/api/calls', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const callsData: any = await callsRes.json();
  const calls = callsData.data || callsData;
  const callId = calls[0]?.id || 'call-001';
  console.log('[CALLS] Active call selected:', callId);

  // 3. Connect WebSocket
  const ws = new WebSocket('ws://localhost:4000/ws');
  
  await new Promise((resolve) => {
    ws.on('open', () => {
      console.log('[WS] Connected to ws://localhost:4000/ws');
      ws.send(JSON.stringify({ type: 'AUTHENTICATE', token, call_id: callId }));
      resolve(true);
    });
  });

  const messages: any[] = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    messages.push(msg);
    if (msg.type === 'AUDIO_TELEMETRY') {
      const p = msg.payload || msg.telemetry || {};
      console.log('[WS IN] AUDIO_TELEMETRY:', {
        call_id: msg.callId || msg.call_id,
        stream_id: msg.streamId || msg.stream_id,
        deepfake_status: p.deepfake?.status,
        spoof_score: p.deepfake?.spoof_score,
        biometric_status: p.speaker?.status,
        replay_status: p.replay?.status,
        vad_state: p.vad?.state,
        vad_confidence: p.vad?.confidence
      });
    } else if (msg.type === 'UNIFIED_RISK_ASSESSMENT') {
      const p = msg.payload || msg.assessment || {};
      console.log('[WS IN] UNIFIED_RISK_ASSESSMENT:', {
        call_id: msg.callId || msg.call_id,
        stream_id: msg.streamId || msg.stream_id,
        overall_risk_score: p.overall_risk_score,
        risk_level: p.risk_level
      });
    } else {
      console.log('[WS IN] Message:', msg.type);
    }
  });

  await new Promise(r => setTimeout(r, 600));

  // Generate 4800 samples (300ms @ 16kHz) of audio with 440Hz tone
  const sampleRate = 16000;
  const numSamples = 4800;
  const pcm16 = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    pcm16[i] = Math.floor(Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 16384);
  }
  const chunkBase64 = Buffer.from(pcm16.buffer).toString('base64');

  // TEST 1: Normal stream & inference
  console.log('\n--- TEST 1: STREAM START -> AUDIO CHUNK -> AI INFERENCE ---');
  ws.send(JSON.stringify({ type: 'START_STREAM', call_id: callId, stream_id: 'stream-test-1' }));
  await new Promise(r => setTimeout(r, 100));
  ws.send(JSON.stringify({
    type: 'AUDIO_CHUNK',
    call_id: callId,
    stream_id: 'stream-test-1',
    sequence_number: 1,
    audio_data: chunkBase64,
    sample_rate: 16000,
    channels: 1,
    format: 'pcm_s16le'
  }));
  await new Promise(r => setTimeout(r, 1200));
  ws.send(JSON.stringify({ type: 'END_STREAM', call_id: callId, stream_id: 'stream-test-1' }));

  // TEST 2: Stop, wait 5 seconds, and re-test
  console.log('\n--- TEST 2: WAIT 5 SECONDS -> RE-STREAM ---');
  await new Promise(r => setTimeout(r, 5000));
  ws.send(JSON.stringify({ type: 'START_STREAM', call_id: callId, stream_id: 'stream-test-2' }));
  await new Promise(r => setTimeout(r, 100));
  ws.send(JSON.stringify({
    type: 'AUDIO_CHUNK',
    call_id: callId,
    stream_id: 'stream-test-2',
    sequence_number: 1,
    audio_data: chunkBase64,
    sample_rate: 16000,
    channels: 1,
    format: 'pcm_s16le'
  }));
  await new Promise(r => setTimeout(r, 1200));
  ws.send(JSON.stringify({ type: 'END_STREAM', call_id: callId, stream_id: 'stream-test-2' }));

  // TEST 4: Multiple consecutive executions
  console.log('\n--- TEST 4: MULTIPLE CONSECUTIVE EXECUTIONS ---');
  for (let s = 3; s <= 5; s++) {
    ws.send(JSON.stringify({ type: 'START_STREAM', call_id: callId, stream_id: 'stream-test-' + s }));
    await new Promise(r => setTimeout(r, 100));
    ws.send(JSON.stringify({
      type: 'AUDIO_CHUNK',
      call_id: callId,
      stream_id: 'stream-test-' + s,
      sequence_number: 1,
      audio_data: chunkBase64,
      sample_rate: 16000,
      channels: 1,
      format: 'pcm_s16le'
    }));
    await new Promise(r => setTimeout(r, 600));
    ws.send(JSON.stringify({ type: 'END_STREAM', call_id: callId, stream_id: 'stream-test-' + s }));
  }

  await new Promise(r => setTimeout(r, 1000));
  ws.close();

  const telemetryMsgs = messages.filter(m => m.type === 'AUDIO_TELEMETRY');
  const riskMsgs = messages.filter(m => m.type === 'UNIFIED_RISK_ASSESSMENT');
  console.log('\n=== PIPELINE EXECUTION SUMMARY ===');
  console.log('Total Telemetry frames received:', telemetryMsgs.length);
  console.log('Total Unified Risk frames received:', riskMsgs.length);
  const lastTelem = (telemetryMsgs[telemetryMsgs.length - 1]?.payload) || {};
  console.log('Final Acoustic Status:', lastTelem?.deepfake?.status);
  console.log('Final Spoof Score:', lastTelem?.deepfake?.spoof_score);
  console.log('Final Biometric Status:', lastTelem?.speaker?.status);
  console.log('Final VAD State:', lastTelem?.vad?.state);
  console.log('Final VAD Confidence:', lastTelem?.vad?.confidence);
  console.log('=== END OF VERIFICATION ===');
}

testPipeline().catch(console.error);
