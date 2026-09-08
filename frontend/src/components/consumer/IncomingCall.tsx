'use client';

import React from 'react';
import {
  Phone,
  PhoneOff,
  ShieldCheck,
  User,
  Radio,
  Lock,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { CallSession } from '@/lib/api';

interface IncomingCallProps {
  call: CallSession | null;
  onAnswer: () => void;
  onDecline: () => void;
  isAnswering?: boolean;
}

export const IncomingCall: React.FC<IncomingCallProps> = ({
  call,
  onAnswer,
  onDecline,
  isAnswering = false,
}) => {
  const callerNumber = call?.callerIdentifier || 'Unknown Caller';
  const callerName = call?.callerDisplayName || (call?.callerIdentifier ? 'Incoming Caller' : 'Unknown Caller');

  return (
    <div className="flex flex-col items-center justify-between min-h-[500px] p-6 text-center select-none relative overflow-hidden rounded-3xl bg-[#24242B] border border-[#3A3A42] shadow-glass-card">
      {/* Background Animated Acoustic Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-80 h-80 rounded-full border border-[#3A3A42]/40 animate-ping opacity-30" style={{ animationDuration: '3s' }} />
        <div className="w-64 h-64 rounded-full border border-[#3A3A42]/60 animate-pulse opacity-40" />
        <div className="w-48 h-48 rounded-full bg-[#7A1F3D]/10 blur-2xl" />
      </div>

      {/* VOXSHIELD Protected Header Pill */}
      <div className="relative z-10 space-y-1.5 pt-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#2E2E36] border border-[#3A3A42] text-[#F5F5F7] text-xs font-mono shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-[#168F86] animate-pulse" />
          <span className="font-semibold tracking-wide">VOXSHIELD PROTECTED CALL</span>
        </div>
        <p className="text-[11px] text-[#A0A4AE] font-mono flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#168F86] animate-ping" />
          Real-time AI voice inspection active
        </p>
      </div>

      {/* Caller Avatar & Identification */}
      <div className="relative z-10 my-auto py-6 space-y-4">
        <div className="relative mx-auto w-28 h-28">
          <div className="relative w-28 h-28 rounded-full bg-[#2E2E36] border-2 border-[#3A3A42] flex items-center justify-center shadow-lg">
            <User className="w-14 h-14 text-[#F5F5F7]" />
          </div>

          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#168F86] border-2 border-[#24242B] flex items-center justify-center shadow-sm">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </span>
        </div>

        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-[#F5F5F7] tracking-tight">
            {callerName}
          </h2>
          <p className="text-sm font-mono text-[#A0A4AE] font-medium tracking-wide">
            {callerNumber}
          </p>
          <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full bg-[#1A1A1F] border border-[#3A3A42] text-[#A0A4AE] text-[11px] font-mono shadow-sm">
            <Lock className="w-3 h-3 text-[#A0A4AE]" />
            <span>Encrypted Audio Ingest Active</span>
          </div>
        </div>
      </div>

      {/* Call Action Controls: Decline / Answer */}
      <div className="relative z-10 w-full max-w-xs space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-4">
          {/* DECLINE BUTTON */}
          <button
            onClick={onDecline}
            disabled={isAnswering}
            className="group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-[#2E2E36] hover:bg-[#3A3A42] active:scale-95 border border-[#3A3A42] text-[#D94A5A] transition-all shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-[#D94A5A] hover:bg-[#E05C6B] flex items-center justify-center transition-all shadow-sm">
              <PhoneOff className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-[#F5F5F7]">
              DECLINE
            </span>
          </button>

          {/* ANSWER BUTTON */}
          <button
            onClick={onAnswer}
            disabled={isAnswering}
            className="group flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl bg-[#2E2E36] hover:bg-[#3A3A42] active:scale-95 border border-[#3A3A42] text-[#168F86] transition-all shadow-sm"
          >
            <div className="w-14 h-14 rounded-full bg-[#168F86] hover:bg-[#1D9E94] flex items-center justify-center transition-all shadow-sm animate-pulse">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-bold font-mono tracking-widest text-[#F5F5F7]">
              {isAnswering ? 'CONNECTING...' : 'ANSWER'}
            </span>
          </button>
        </div>

        <p className="text-[11px] text-[#A0A4AE] font-mono pt-1">
          VOXSHIELD continuously verifies caller voice authenticity
        </p>
      </div>
    </div>
  );
};
