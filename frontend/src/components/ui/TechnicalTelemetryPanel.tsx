'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, Lock } from 'lucide-react';
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
  deepfakeStatus,
  speakerStatus,
  replayStatus,
  vadStatus,
}) => {
  const [expanded, setExpanded] = useState(false);

  const latencyDisplay = formatLatency(measuredLatencyMs);

  return (
    <div className="rounded border border-border bg-surface overflow-hidden transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-surface-elevated transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-surface-elevated text-secondaryText border border-border">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-semibold text-primaryText font-sans block">
              Acoustic & Stream Engineering Telemetry
            </span>
            <span className="text-xs text-mutedText font-sans">
              16 kHz Linear PCM Pipeline • Latency: <span className="font-mono text-secondaryText">{latencyDisplay}</span> • Runtime: <span className="font-sans text-secondaryText">{aiState}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
          <span>{expanded ? 'Collapse' : 'Expand'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3.5 border-t border-border bg-surface-elevated/40 space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Audio Format */}
            <div className="p-2 rounded bg-surface border border-border">
              <span className="text-[11px] text-mutedText font-sans block">Sampling Rate</span>
              <span className="text-primaryText font-mono font-medium text-xs mt-0.5 block">{sampleRate / 1000} kHz (16-bit)</span>
            </div>

            {/* Channels */}
            <div className="p-2 rounded bg-surface border border-border">
              <span className="text-[11px] text-mutedText font-sans block">Channels</span>
              <span className="text-primaryText font-mono font-medium text-xs mt-0.5 block">{channels === 1 ? 'Mono (Linear PCM)' : 'Stereo'}</span>
            </div>

            {/* Chunk Window */}
            <div className="p-2 rounded bg-surface border border-border">
              <span className="text-[11px] text-mutedText font-sans block">Chunk Buffer</span>
              <span className="text-primaryText font-mono font-medium text-xs mt-0.5 block">{chunkDurationMs} ms</span>
            </div>

            {/* Measured Latency */}
            <div className="p-2 rounded bg-surface border border-border">
              <span className="text-[11px] text-mutedText font-sans block">Processing Latency</span>
              <span className="text-info font-mono font-medium text-xs mt-0.5 block">{latencyDisplay}</span>
            </div>
          </div>

          {/* Subsystem States */}
          <div className="p-2.5 rounded bg-surface border border-border flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-3 text-[11px] text-secondaryText font-sans flex-wrap">
              <span>Deepfake: <strong className="text-primaryText font-medium">{deepfakeStatus || 'STANDBY'}</strong></span>
              <span className="text-mutedText">•</span>
              <span>Speaker Biometric: <strong className="text-primaryText font-medium">{speakerStatus || 'STANDBY'}</strong></span>
              <span className="text-mutedText">•</span>
              <span>Replay Filter: <strong className="text-primaryText font-medium">{replayStatus || 'STANDBY'}</strong></span>
              <span className="text-mutedText">•</span>
              <span>VAD: <strong className="text-primaryText font-medium">{vadStatus || 'LISTENING'}</strong></span>
            </div>

            <div className="flex items-center gap-1.5 text-success text-[11px] font-sans">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero Retention Privacy Firewall Enforced</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
