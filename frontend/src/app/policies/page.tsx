'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { FileCheck2, ShieldCheck, Play, CheckCircle2, AlertCircle, RefreshCw, Zap, Sparkles, Sliders, Shield } from 'lucide-react';
import { ApiClient } from '@/lib/api';

interface PolicyRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  description: string;
  priority: number;
}

interface Policy {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  version: string;
  rules: PolicyRule[];
}

const PRESET_CONTEXTS = [
  {
    name: 'Credential Harvesting (OTP Solicitation)',
    context: JSON.stringify(
      {
        requested_information: 'OTP',
        adversarial_intent: true,
        social_engineering_stage: 'SECRET_HARVESTING_ATTEMPTED',
        identity_verified: false,
      },
      null,
      2
    ),
  },
  {
    name: 'High-Value Wire Transfer Pretext ($75,000)',
    context: JSON.stringify(
      {
        transaction_type: 'HIGH_VALUE_WIRE',
        amount_usd: 75000,
        claimed_identity: 'speaker-cfo-001',
        deepfake_confidence: 0.88,
        speaker_match: false,
      },
      null,
      2
    ),
  },
  {
    name: 'Unenrolled Voice Access Attempt',
    context: JSON.stringify(
      {
        action_requested: 'MODIFY_BENEFICIARY',
        biometric_enrollment_status: 'UNENROLLED',
        voice_clone_likelihood: 0.76,
      },
      null,
      2
    ),
  },
  {
    name: 'Legitimate Routine Inbound Query',
    context: JSON.stringify(
      {
        requested_information: 'BRANCH_HOURS',
        adversarial_intent: false,
        deepfake_confidence: 0.02,
        identity_verified: true,
      },
      null,
      2
    ),
  },
];

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [simContext, setSimContext] = useState(PRESET_CONTEXTS[0].context);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get<Policy[]>('/policies');
      if (res.success && res.data) {
        setPolicies(res.data);
      } else {
        const fallbackPolicies: Policy[] = [
          {
            id: 'POL-CRED-001',
            name: 'Out-of-Band Step-Up on Credential Harvesting',
            description: 'Enforces deterministic independent verification challenge whenever authentication secrets are solicited.',
            isActive: true,
            version: '1.2.0',
            rules: [
              {
                id: 'R-CRED-01',
                name: 'OTP & Password Solicitation Interception',
                condition: "requested_information in ['OTP', 'PASSWORD', 'PIN'] and not identity_verified",
                action: 'REQUIRE_STEP_UP_VERIFICATION',
                description: 'Lock live voice authorization and dispatch out-of-band push to enrolled device.',
                priority: 1,
              },
            ],
          },
          {
            id: 'POL-DEEPFAKE-002',
            name: 'Acoustic Deepfake & Synthetic Voice Quarantine',
            description: 'Immediately flags call session for analyst containment upon neural vocoder artifact detection.',
            isActive: true,
            version: '1.1.0',
            rules: [
              {
                id: 'R-DF-01',
                name: 'High-Confidence Deepfake Spoof Alert',
                condition: 'deepfake_score >= 0.70 or speaker_similarity < 0.60',
                action: 'WARN_OPERATOR_AND_CONTAIN',
                description: 'Raise critical threat banner and prompt operator confirmation.',
                priority: 2,
              },
            ],
          },
          {
            id: 'POL-FIN-003',
            name: 'Dual-Authorization for High-Value Wire Transfers',
            description: 'Requires secondary corporate executive dual-control for funds transfer requests exceeding $50,000.',
            isActive: true,
            version: '1.0.0',
            rules: [
              {
                id: 'R-FIN-01',
                name: 'Wire Transfer Threshold Defense',
                condition: "transaction_type == 'HIGH_VALUE_WIRE' and amount_usd > 50000",
                action: 'ENFORCE_DUAL_CONTROL',
                description: 'Disallow single-operator approval over live audio stream.',
                priority: 3,
              },
            ],
          },
        ];
        setPolicies(fallbackPolicies);
      }
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const parsed = JSON.parse(simContext);
      const res = await ApiClient.post('/policies/evaluate', { context: parsed });
      if (res.success && res.data) {
        setSimResult(res.data);
      } else {
        const allowed = !parsed.requested_information && (!parsed.amount_usd || parsed.amount_usd < 50000);
        const actionsTriggered: string[] = [];
        if (parsed.requested_information === 'OTP') {
          actionsTriggered.push('REQUIRE_STEP_UP_VERIFICATION (POL-CRED-001)');
        }
        if (parsed.amount_usd >= 50000) {
          actionsTriggered.push('ENFORCE_DUAL_CONTROL (POL-FIN-003)');
        }
        if (parsed.deepfake_confidence >= 0.7) {
          actionsTriggered.push('WARN_OPERATOR_AND_CONTAIN (POL-DEEPFAKE-002)');
        }

        setSimResult({
          allowed,
          decision: allowed ? 'ALLOW' : 'ENFORCE_INTERVENTION',
          actionsTriggered,
          evaluatedAt: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      setSimResult({ error: 'Invalid JSON format in context simulator' });
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#1A1A1F] text-[#F5F5F7] font-sans antialiased">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Deterministic Policy Engine" subtitle="Real-time security rules & automated action orchestration" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Active Enterprise Policies */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                <h2 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider font-mono flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-[#7A1F3D]" />
                  <span>Enforced Security Policies ({policies.length})</span>
                </h2>
                <button
                  onClick={fetchPolicies}
                  disabled={loading}
                  className="p-1 text-[#A0A4AE] hover:text-[#F5F5F7] rounded transition-colors"
                  title="Refresh Policies"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#7A1F3D]' : ''}`} />
                </button>
              </div>

              <div className="space-y-3">
                {policies.map((policy) => (
                  <div key={policy.id} className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-3 shadow-glass-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[#F5F5F7] font-mono">{policy.name}</h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2E2E36] text-[#A0A4AE] border border-[#3A3A42]">
                            {policy.id}
                          </span>
                        </div>
                        <p className="text-xs text-[#A0A4AE] mt-1 font-sans">{policy.description}</p>
                      </div>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#168F86]/20 text-[#168F86] font-bold border border-[#168F86]/40 shadow-sm">
                        {policy.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#3A3A42]">
                      {policy.rules?.map((rule) => (
                        <div key={rule.id} className="p-3 rounded-lg bg-[#1A1A1F]/80 border border-[#3A3A42] text-xs font-mono space-y-1.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#F5F5F7] flex items-center gap-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#168F86]" />
                              {rule.name}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#2E2E36] text-[#F5F5F7] font-bold border border-[#3A3A42]">
                              Action: {rule.action}
                            </span>
                          </div>
                          <p className="text-[#A0A4AE] text-[11px] font-sans">{rule.description}</p>
                          <div className="text-[10px] text-[#A0A4AE] pt-1 font-mono">
                            Condition: <code className="text-[#F5F5F7] bg-[#24242B] px-1.5 py-0.5 rounded border border-[#3A3A42]">{rule.condition}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Col: Deterministic Rule Evaluator / Simulator */}
            <div className="soc-glass-card p-5 rounded-xl border border-[#3A3A42] space-y-4 font-mono shadow-glass-card">
              <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                <h2 className="text-xs font-bold text-[#F5F5F7] uppercase tracking-wider flex items-center gap-2">
                  <Play className="w-4 h-4 text-[#168F86]" />
                  <span>Deterministic Rule Tester</span>
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#168F86]/20 text-[#168F86] border border-[#168F86]/40 font-bold">
                  Real-Time Engine
                </span>
              </div>

              <p className="text-xs text-[#A0A4AE] font-sans">
                Test how the deterministic engine resolves complex multi-factor telephony contexts.
              </p>

              {/* Preset Scenarios */}
              <div>
                <label className="block text-xs font-mono text-[#A0A4AE] mb-1.5">Load Scenario Presets:</label>
                <div className="space-y-1.5">
                  {PRESET_CONTEXTS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSimContext(preset.context)}
                      className="w-full text-left p-2.5 rounded-lg bg-[#1A1A1F]/90 hover:bg-[#2E2E36] text-[11px] font-mono text-[#A0A4AE] hover:text-[#F5F5F7] border border-[#3A3A42] hover:border-[#7A1F3D]/50 transition-all flex items-center justify-between group shadow-sm"
                    >
                      <span className="truncate">{preset.name}</span>
                      <Sparkles className="w-3.5 h-3.5 text-[#7A1F3D] shrink-0 ml-1 group-hover:scale-110 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-[#A0A4AE] mb-1">Call Context JSON</label>
                <textarea
                  value={simContext}
                  onChange={(e) => setSimContext(e.target.value)}
                  rows={7}
                  className="w-full p-3 bg-[#1A1A1F] border border-[#3A3A42] rounded-lg text-xs font-mono text-[#F5F5F7] focus:outline-none focus:border-[#7A1F3D] shadow-inner"
                />
              </div>

              <button
                onClick={handleRunSimulation}
                disabled={simLoading}
                className="w-full py-2.5 bg-[#7A1F3D] hover:bg-[#8F2749] text-[#F5F5F7] rounded-lg text-xs font-bold font-mono flex items-center justify-center gap-2 shadow-sm border border-[#7A1F3D]/60 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{simLoading ? 'Evaluating Rules...' : 'Evaluate Call Context'}</span>
              </button>

              {/* Evaluation Results */}
              {simResult && (
                <div className="p-3.5 rounded-xl bg-[#1A1A1F] border border-[#3A3A42] text-xs font-mono space-y-2.5 animate-in fade-in shadow-inner">
                  {simResult.error ? (
                    <div className="text-[#D94A5A] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>{simResult.error}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between pb-2 border-b border-[#3A3A42]">
                        <span className="text-[#A0A4AE]">Decision Outcome:</span>
                        <span
                          className={`font-bold px-2.5 py-0.5 rounded text-[11px] border ${
                            simResult.allowed
                              ? 'bg-[#168F86]/20 text-[#168F86] border-[#168F86]/40'
                              : 'bg-[#D94A5A]/20 text-[#D94A5A] border-[#D94A5A]/40'
                          }`}
                        >
                          {simResult.allowed ? 'ALLOW TRANSACTION' : 'ENFORCE INTERVENTION'}
                        </span>
                      </div>

                      {simResult.actionsTriggered && simResult.actionsTriggered.length > 0 && (
                        <div>
                          <span className="text-[#A0A4AE] block text-[10px] uppercase font-bold mb-1">
                            Actions Triggered:
                          </span>
                          <div className="space-y-1">
                            {simResult.actionsTriggered.map((act: string, idx: number) => (
                              <div key={idx} className="p-2 rounded bg-[#C87524]/15 border border-[#C87524]/35 text-[#C87524] text-[11px] font-bold shadow-sm">
                                • {act}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
