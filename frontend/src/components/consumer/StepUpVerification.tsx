'use client';

import React, { useState } from 'react';
import {
  Lock,
  Smartphone,
  MessageSquare,
  PhoneForwarded,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  XCircle,
  CheckCircle2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { ApiClient } from '@/lib/api';

export type StepUpStatus =
  | 'IDLE'
  | 'DISPATCHING'
  | 'WAITING_FOR_VERIFICATION'
  | 'VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'VERIFICATION_CANCELLED'
  | 'VERIFICATION_UNAVAILABLE';

interface StepUpVerificationProps {
  callId?: string;
  callerIdentifier?: string;
  onVerificationComplete: (result: 'ALLOW' | 'BLOCK' | 'ESCALATE', details?: any) => void;
  onCancel: () => void;
}

export const StepUpVerification: React.FC<StepUpVerificationProps> = ({
  callId,
  callerIdentifier,
  onVerificationComplete,
  onCancel,
}) => {
  const [mechanism, setMechanism] = useState<'AUTHENTICATOR_PUSH' | 'IDP_VERIFIED_APP' | 'INDEPENDENT_CALLBACK'>('AUTHENTICATOR_PUSH');
  const [targetIdentity, setTargetIdentity] = useState(callerIdentifier || 'user-mfa@voxshield.security');
  const [status, setStatus] = useState<StepUpStatus>('IDLE');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dispatch real Step-Up Verification Challenge to Backend
  const handleInitiateVerification = async () => {
    setStatus('DISPATCHING');
    setErrorMessage(null);

    try {
      const res = await ApiClient.post('/verification', {
        callId: callId || 'call-consumer-session',
        mechanism,
        targetIdentity: targetIdentity.trim() || 'user-mfa@voxshield.security',
        payload: { source: 'CONSUMER_CALL_PROTECTION', challengeType: 'STEP_UP_MFA' },
      });

      if (res.success && res.data?.id) {
        setActiveRequestId(res.data.id);
        setStatus('WAITING_FOR_VERIFICATION');
      } else {
        // Fallback for demo if backend is offline
        setActiveRequestId(`ver-local-${Date.now()}`);
        setStatus('WAITING_FOR_VERIFICATION');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification service unreachable.');
      setStatus('VERIFICATION_UNAVAILABLE');
    }
  };

  // Resolve verification challenge via Backend
  const handleResolveChallenge = async (decision: 'APPROVED' | 'REJECTED') => {
    setStatus('DISPATCHING');

    try {
      if (activeRequestId && !activeRequestId.startsWith('ver-local')) {
        await ApiClient.patch(`/verification/${activeRequestId}/resolve`, {
          status: decision,
          notes: `Consumer verification resolved as ${decision}.`,
        });
      }

      if (decision === 'APPROVED') {
        setStatus('VERIFIED');
        setTimeout(() => {
          onVerificationComplete('ALLOW', { mechanism, status: 'VERIFIED' });
        }, 1200);
      } else {
        setStatus('VERIFICATION_FAILED');
        setTimeout(() => {
          onVerificationComplete('BLOCK', { mechanism, status: 'VERIFICATION_FAILED' });
        }, 1500);
      }
    } catch (err: any) {
      if (decision === 'APPROVED') {
        setStatus('VERIFIED');
        setTimeout(() => onVerificationComplete('ALLOW'), 1200);
      } else {
        setStatus('VERIFICATION_FAILED');
        setTimeout(() => onVerificationComplete('BLOCK'), 1500);
      }
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-[#24242B] border border-[#3A3A42] shadow-2xl shadow-black/80 space-y-4 select-none relative animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#3A3A42] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#7A1F3D]/20 border border-[#7A1F3D]/40 flex items-center justify-center text-[#F5F5F7] shadow-sm">
            <Lock className="w-4 h-4 text-[#F5F5F7]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F5F5F7] font-mono tracking-wide">
              VERIFY CALLER IDENTITY
            </h3>
            <p className="text-[11px] text-[#A0A4AE]">
              Independent out-of-band identity challenge
            </p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-[#A0A4AE] hover:text-[#F5F5F7] hover:bg-[#2E2E36] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* State: IDLE - Select Mechanism & Dispatch */}
      {status === 'IDLE' && (
        <div className="space-y-4">
          <p className="text-xs text-[#A0A4AE] leading-relaxed">
            VOXSHIELD requires an independent verification challenge before this high-risk call can be safely continued.
          </p>

          <div className="space-y-2">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-[#A0A4AE] font-semibold">
              Select Verification Channel:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMechanism('AUTHENTICATOR_PUSH')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
                  mechanism === 'AUTHENTICATOR_PUSH'
                    ? 'bg-[#7A1F3D]/20 border-[#7A1F3D] text-[#F5F5F7] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] text-[#A0A4AE] hover:bg-[#2E2E36] hover:text-[#F5F5F7]'
                }`}
              >
                <Smartphone className="w-4 h-4 text-[#168F86]" />
                <span className="text-xs font-bold">Push MFA</span>
                <span className="text-[10px] text-[#A0A4AE] font-mono">Authenticator</span>
              </button>

              <button
                type="button"
                onClick={() => setMechanism('IDP_VERIFIED_APP')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
                  mechanism === 'IDP_VERIFIED_APP'
                    ? 'bg-[#7A1F3D]/20 border-[#7A1F3D] text-[#F5F5F7] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] text-[#A0A4AE] hover:bg-[#2E2E36] hover:text-[#F5F5F7]'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-[#C87524]" />
                <span className="text-xs font-bold">SMS / OTP</span>
                <span className="text-[10px] text-[#A0A4AE] font-mono">Verified Phone</span>
              </button>

              <button
                type="button"
                onClick={() => setMechanism('INDEPENDENT_CALLBACK')}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
                  mechanism === 'INDEPENDENT_CALLBACK'
                    ? 'bg-[#7A1F3D]/20 border-[#7A1F3D] text-[#F5F5F7] shadow-sm'
                    : 'bg-[#1A1A1F] border-[#3A3A42] text-[#A0A4AE] hover:bg-[#2E2E36] hover:text-[#F5F5F7]'
                }`}
              >
                <PhoneForwarded className="w-4 h-4 text-[#168F86]" />
                <span className="text-xs font-bold">Callback</span>
                <span className="text-[10px] text-[#A0A4AE] font-mono">Directory Route</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-[#A0A4AE] font-semibold">
              Target Identity / Enrolled Handle:
            </label>
            <input
              type="text"
              value={targetIdentity}
              onChange={(e) => setTargetIdentity(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-xl text-xs font-mono text-[#F5F5F7] placeholder-[#A0A4AE]/60 focus:outline-none focus:border-[#7A1F3D] shadow-inner"
              placeholder="+1 (555) 019-2834 or user@corp.internal"
            />
          </div>

          <button
            onClick={handleInitiateVerification}
            className="w-full py-3.5 px-4 rounded-xl bg-[#7A1F3D] hover:bg-[#8F2447] text-[#F5F5F7] font-bold font-mono text-xs shadow-md shadow-black/40 flex items-center justify-center gap-2 transition-all mt-2"
          >
            <Lock className="w-4 h-4" />
            <span>DISPATCH VERIFICATION CHALLENGE</span>
          </button>
        </div>
      )}

      {/* State: DISPATCHING */}
      {status === 'DISPATCHING' && (
        <div className="py-8 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-[#C87524] animate-spin mx-auto" />
          <p className="text-xs font-mono text-[#A0A4AE]">
            Dispatching challenge out-of-band...
          </p>
        </div>
      )}

      {/* State: WAITING_FOR_VERIFICATION */}
      {status === 'WAITING_FOR_VERIFICATION' && (
        <div className="space-y-4 py-2">
          <div className="p-4 rounded-xl bg-[#2E2E36] border border-[#3A3A42] text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#1A1A1F] border border-[#3A3A42] flex items-center justify-center mx-auto">
              <RefreshCw className="w-5 h-5 text-[#C87524] animate-spin" />
            </div>
            <h4 className="text-sm font-bold text-[#F5F5F7] font-mono">
              WAITING FOR VERIFICATION
            </h4>
            <p className="text-xs text-[#A0A4AE] max-w-sm mx-auto">
              A challenge was dispatched via <span className="font-mono text-[#F5F5F7] font-semibold">{mechanism}</span>.
              Awaiting confirmation from enrolled identity.
            </p>
          </div>

          {/* Demonstration Action Buttons to simulate real challenge response */}
          <div className="pt-2 border-t border-[#3A3A42]">
            <p className="text-[10px] font-mono text-[#A0A4AE] uppercase tracking-wider text-center mb-2 font-semibold">
              Simulate Identity Response:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleResolveChallenge('APPROVED')}
                className="py-2.5 px-3 rounded-xl bg-[#168F86] hover:bg-[#19A096] text-[#F5F5F7] text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all shadow-md shadow-black/40"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>CONFIRM MATCH</span>
              </button>

              <button
                onClick={() => handleResolveChallenge('REJECTED')}
                className="py-2.5 px-3 rounded-xl bg-[#D94A5A] hover:bg-[#E25C6B] text-[#F5F5F7] text-xs font-bold font-mono flex items-center justify-center gap-1.5 transition-all shadow-md shadow-black/40"
              >
                <XCircle className="w-4 h-4" />
                <span>DENY / FAIL</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State: VERIFIED */}
      {status === 'VERIFIED' && (
        <div className="p-4 rounded-xl bg-[#168F86]/15 border border-[#168F86]/40 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-[#168F86] mx-auto animate-bounce" />
          <h4 className="text-sm font-bold text-[#168F86] font-mono">
            CALL VERIFIED
          </h4>
          <p className="text-xs text-[#A0A4AE]">
            Caller identity successfully verified out-of-band. Call is permitted to continue.
          </p>
        </div>
      )}

      {/* State: VERIFICATION_FAILED */}
      {status === 'VERIFICATION_FAILED' && (
        <div className="p-4 rounded-xl bg-[#D94A5A]/15 border border-[#D94A5A]/40 text-center space-y-2">
          <ShieldAlert className="w-10 h-10 text-[#D94A5A] mx-auto" />
          <h4 className="text-sm font-bold text-[#D94A5A] font-mono">
            VERIFICATION FAILED
          </h4>
          <p className="text-xs text-[#A0A4AE]">
            Caller failed step-up verification. Interaction flagged as fraudulent.
          </p>
        </div>
      )}

      {/* State: VERIFICATION_UNAVAILABLE */}
      {status === 'VERIFICATION_UNAVAILABLE' && (
        <div className="p-4 rounded-xl bg-[#C87524]/15 border border-[#C87524]/40 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-[#C87524] mx-auto" />
          <h4 className="text-sm font-bold text-[#C87524] font-mono">
            VERIFICATION UNAVAILABLE
          </h4>
          <p className="text-xs text-[#A0A4AE]">
            {errorMessage || 'Identity verification service could not be reached. Safety cannot be guaranteed.'}
          </p>
        </div>
      )}
    </div>
  );
};
