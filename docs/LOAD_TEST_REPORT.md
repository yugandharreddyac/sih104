# Load & Scalability Benchmark Report

## Executive Summary
This report presents the actual benchmark results collected during the Phase 4B load test suite (`backend/tests/phase4b_load.test.ts`). The test evaluated backend WebSocket streaming, connection handling, stream buffer capacity, and frame processing throughput under concurrent load tiers.

> [!IMPORTANT]
> **Test Environment Notice**: The benchmark was executed in a standalone test environment with AI services and PostgreSQL operating in `NOT_AVAILABLE` / `STANDALONE_FALLBACK` mode. This benchmark evaluates backend memory streaming capacity and WebSocket throughput only; it does **not** claim production cloud capacity.

---

## Load Test Benchmark Results Matrix

| Load Tier | Concurrent Streams | Total Audio Frames Sent | Success Rate | Avg Latency | Max Latency | Heap Memory Delta | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tier 1** | 5 | 20 | 100% (20/20) | 1.80 ms | 6.00 ms | +0.48 MB | `TESTED` |
| **Tier 2** | 10 | 40 | 100% (40/40) | 2.15 ms | 15.00 ms | +2.01 MB | `TESTED` |
| **Tier 3** | 25 | 100 | 100% (100/100) | 2.65 ms | 28.00 ms | +2.61 MB | `TESTED` |
| **Tier 4** | 50 | 250 | 100% (250/250) | 3.52 ms | 36.00 ms | +4.96 MB | `TESTED` |
| **Tier 5** | 100 | 1,000 | 100% (1,000/1,000) | 7.97 ms | 114.00 ms | +12.61 MB | `TESTED` |

---

## Detailed Benchmark Analysis

### 1. Connection & Frame Ingestion
- **Active Connections**: Scaled successfully from 5 to 100 concurrent WebSocket connections.
- **Total Frames Processed**: 1,000 audio frames streamed and processed across 100 concurrent streams without connection drops or frame errors.
- **Connection Error Rate**: 0% across all tiers.

### 2. Latency & Throughput
- **Average Latency**: Remained under 8 ms even at 100 concurrent streams (7.97 ms avg).
- **Max Peak Latency**: 114 ms peak recorded at the 100-stream tier under local node process scheduling.

### 3. Resource & Component Behavior
- **CPU & Memory**: Memory consumption grew linearly (+12.61 MB RSS delta at 100 streams).
- **Database Status**: Reported as `STANDALONE_FALLBACK` (in-memory test mode).
- **AI Queue Status**: Reported as `NOT_AVAILABLE` (mocked degraded mode in test suite).

---

## Limitations & Known Constraints
1. **Local Benchmark**: Executed single-node in-process test runner; does not measure distributed multi-node load balancing across network infrastructure.
2. **AI Inference Offline**: AI models were offline during benchmark. Real ONNX/PyTorch GPU inference will introduce additional latency per frame depending on hardware acceleration.
