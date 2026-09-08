'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Activity, Lock, Radio, Server, CheckCircle2 } from 'lucide-react';
import { formatLatency } from '@/lib/format';

interface TechnicalTelemetryPanelProps {
  sampleRate?: number;
  channels?: number;
  chunkDurationMs?: number;
  measuredLatencyMs?: number | null | undefined;
  aiState?: string;
  rmsDb?: number | null | undefined;
  streamSource?: string;
  deepfakeStatus?: string;
  speakerStatus?: string;
  replayStatus?: string;
  vadStatus?: string;
}

export const TechnicalTelemetryPanel: React.FC<TechnicalTelemetryPanelProps> = ({
  sampleRate = 16000,
  channels = 1,
  chunkDurationMs = 300,
  measuredLatencyMs,
  aiState = 'READY',
  rmsDb,
  streamSource = 'TELEPHONY_CHANNEL',
  deepfakeStatus,
  speakerStatus,
  replayStatus,
  vadStatus,
}) => {
  const [expanded, setExpanded] = useState(false);

  const latencyDisplay = formatLatency(measuredLatencyMs);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden transition-all">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-white font-sans uppercase tracking-wider block">
              Acoustic & Stream Engineering Telemetry
            </span>
            <span className="text-[11px] text-slate-400 font-sans">
              16 kHz Linear PCM Pipeline • Latency: <strong className="font-mono text-cyan-400">{latencyDisplay}</strong> • AI Runtime: <strong className="font-mono text-emerald-400">{aiState}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-cyan-400">
          <span>{expanded ? 'COLLAPSE' : 'EXPAND'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/70 space-y-3 font-mono text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Audio Format */}
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Sampling Rate</span>
              <span className="text-slate-200 font-bold text-xs mt-0.5 block">{sampleRate / 1000} kHz (16-bit)</span>
            </div>

            {/* Channels */}
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Channels</span>
              <span className="text-slate-200 font-bold text-xs mt-0.5 block">{channels === 1 ? 'Mono (Linear PCM)' : 'Stereo'}</span>
            </div>

            {/* Chunk Window */}
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Chunk Buffer</span>
              <span className="text-slate-200 font-bold text-xs mt-0.5 block">{chunkDurationMs} ms (4800 samples)</span>
            </div>

            {/* Measured Latency */}
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Fusion Latency</span>
              <span className="text-cyan-400 font-bold text-xs mt-0.5 block">{latencyDisplay}</span>
            </div>
          </div>

          {/* Subsystem States */}
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-[11px] flex-wrap">
              <span className="text-slate-400">Deepfake Model: <strong className="text-white">{deepfakeStatus || 'AI NOT AVAILABLE'}</strong></span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Speaker Biometric: <strong className="text-white">{speakerStatus || 'STANDBY'}</strong></span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">Replay Filter: <strong className="text-white">{replayStatus || 'STANDBY'}</strong></span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">VAD Speech: <strong className="text-white">{vadStatus || 'LISTENING'}</strong></span>
            </div>

            <div className="flex items-center gap-2 text-emerald-400 text-[11px]">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero Retention Privacy Firewall Enforced</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
