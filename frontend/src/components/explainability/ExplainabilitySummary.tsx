'use client';

import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity, ArrowUpRight, ArrowDownRight, Minus, HelpCircle, CheckCircle2 } from 'lucide-react';
import { formatPercentage, getRiskSeverity } from '@/lib/format';

interface ExplainabilitySummaryProps {
  assessment: any | null;
  callIdentifier?: string;
  isEvaluated: boolean;
}

export const ExplainabilitySummary: React.FC<ExplainabilitySummaryProps> = ({
  assessment,
  callIdentifier,
  isEvaluated,
}) => {
  const rawScore = assessment?.overall_risk_score ?? assessment?.compositeScore;
  const scoreVal = isEvaluated && typeof rawScore === 'number' ? Math.round(rawScore > 1 ? rawScore : rawScore * 100) : null;
  const severity = getRiskSeverity(scoreVal);
  const riskLevel = assessment?.risk_level || (isEvaluated ? severity.level : 'INCONCLUSIVE');
  const isCritical = riskLevel === 'CRITICAL';
  const isHigh = riskLevel === 'HIGH';

  // Explicit distinction: confidence is AI uncertainty/certainty, NOT risk severity
  const confidenceVal = assessment?.confidence;
  const hasConfidence = typeof confidenceVal === 'number' && Number.isFinite(confidenceVal);
  const velocity = assessment?.risk_velocity ?? 0;
  const trajectoryTrend = assessment?.risk_trajectory_trend || (velocity > 0 ? 'ESCALATING' : velocity < 0 ? 'DECAYING' : 'STABLE');

  const primaryDrivers: string[] = assessment?.primary_drivers || assessment?.primaryDrivers || [];
  const policyRecommendation = assessment?.policy_recommendation;
  const policyId = policyRecommendation?.policy_id || (isCritical ? 'POL-CRED-001' : isHigh ? 'POL-STEP-002' : 'POL-DEFAULT-ALLOW');
  const recommendedAction = policyRecommendation?.recommended_action || policyRecommendation?.action || (isCritical ? 'BLOCK_DISCLOSURE' : isHigh ? 'REQUIRE_STEP_UP_VERIFICATION' : 'ALLOW_SESSION');

  return (
    <section
      aria-label="Explainability Summary"
      className={`panel-enterprise p-4 md:p-5 rounded-lg border transition-all ${
        isCritical
          ? 'border-danger/60 bg-danger/5 shadow-subtle'
          : isHigh
          ? 'border-warning/60 bg-warning/5'
          : 'border-border bg-surface'
      }`}
    >
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-border">
        {/* Left: Operational Risk Verdict */}
        <div className="flex items-center gap-4">
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex flex-col items-center justify-center border font-mono font-extrabold shrink-0 ${
              isCritical
                ? 'bg-danger/20 border-danger text-danger'
                : isHigh
                ? 'bg-warning/20 border-warning text-warning'
                : isEvaluated
                ? 'bg-success/20 border-success text-success'
                : 'bg-surface-elevated border-border text-mutedText'
            }`}
          >
            <span className="text-2xl sm:text-3xl leading-none">{isEvaluated ? scoreVal : '—'}</span>
            <span className="text-[10px] uppercase tracking-wider mt-0.5 opacity-80">/ 100</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold font-mono">
                OPERATIONAL RISK SEVERITY
              </span>
              <span
                title="Risk reflects the operational threat level computed by VOXSHIELD multi-modal fusion. It is NOT AI confidence."
                className="text-mutedText hover:text-primary cursor-help"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-sm sm:text-base font-bold font-mono px-2.5 py-0.5 rounded ${
                  isCritical
                    ? 'badge-danger'
                    : isHigh
                    ? 'badge-warning'
                    : isEvaluated
                    ? 'badge-success'
                    : 'badge-neutral'
                }`}
              >
                {riskLevel} RISK
              </span>

              {/* Trajectory pill */}
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-elevated border border-border text-secondaryText flex items-center gap-1">
                {trajectoryTrend === 'ESCALATING' ? (
                  <>
                    <ArrowUpRight className="w-3 h-3 text-danger" />
                    <span className="text-danger font-semibold">ESCALATING</span>
                  </>
                ) : trajectoryTrend === 'DECAYING' ? (
                  <>
                    <ArrowDownRight className="w-3 h-3 text-success" />
                    <span className="text-success font-semibold">RECOVERING / DECAYING</span>
                  </>
                ) : (
                  <>
                    <Minus className="w-3 h-3 text-mutedText" />
                    <span>STABLE</span>
                  </>
                )}
              </span>
            </div>

            <p className="text-xs text-secondaryText font-sans">
              Target Session:{' '}
              <strong className="font-mono text-primaryText">{callIdentifier || 'ACTIVE SESSION'}</strong>
            </p>
          </div>
        </div>

        {/* Center: Explicit Confidence & Velocity decoupling */}
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 w-full lg:w-auto bg-surface-elevated/80 p-3 rounded border border-border font-mono text-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-mutedText block">
              AI MODEL CONFIDENCE
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-bold text-sm text-primaryText">
                {hasConfidence ? formatPercentage(confidenceVal) : 'NOT AVAILABLE'}
              </span>
            </div>
            <span className="text-[9px] text-mutedText block mt-0.5">
              Detector certainty (Decoupled from risk)
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-mutedText block">
              RISK VELOCITY
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-bold text-sm text-primaryText">
                {typeof velocity === 'number' ? `${velocity > 0 ? '+' : ''}${velocity.toFixed(1)}/s` : '0.0/s'}
              </span>
            </div>
            <span className="text-[9px] text-mutedText block mt-0.5">
              Rate of multi-modal risk change
            </span>
          </div>
        </div>

        {/* Right: Policy & Enforced Action */}
        <div className="w-full lg:w-72 bg-surface-elevated p-3 rounded border border-border flex flex-col justify-center">
          <span className="text-[10px] uppercase tracking-wider text-mutedText font-semibold font-mono">
            DETERMINISTIC POLICY DECISION
          </span>
          <div className="mt-1">
            <span
              className={`text-xs font-mono font-bold block truncate ${
                isCritical ? 'text-danger' : isHigh ? 'text-warning' : 'text-success'
              }`}
            >
              {recommendedAction}
            </span>
            <span className="text-[10px] font-mono text-mutedText block mt-0.5 truncate">
              Triggered: <strong className="text-primaryText font-mono">{policyId}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom: Primary Signal Drivers */}
      <div className="pt-3">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] uppercase tracking-wider text-mutedText font-semibold font-mono">
            PRIMARY THREAT SIGNALS IDENTIFIED
          </span>
          <span className="text-[10px] text-mutedText font-mono ml-auto">
            {primaryDrivers.length > 0 ? `${primaryDrivers.length} active drivers` : 'Baseline nominal'}
          </span>
        </div>

        {primaryDrivers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-sans">
            {primaryDrivers.map((driver, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded bg-surface-elevated/40 border border-border"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <span className="text-primaryText">{driver}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-mutedText italic font-sans py-1">
            {isEvaluated
              ? 'All conversational, biometric, and acoustic dimensions are operating within verified baseline security limits.'
              : 'Awaiting sufficient multi-modal audio telemetry to generate threat signal decomposition.'}
          </p>
        )}
      </div>
    </section>
  );
};
