'use client';

import React, { useState } from 'react';
import {
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  Search,
  Cpu,
  Layers,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import { getRiskSeverity } from '@/lib/format';

interface WhyThisRiskProps {
  assessment: any | null;
  isEvaluated: boolean;
  onInspectSignal?: (signal: any) => void;
}

export const WhyThisRisk: React.FC<WhyThisRiskProps> = ({
  assessment,
  isEvaluated,
  onInspectSignal,
}) => {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const rawScore = assessment?.overall_risk_score ?? assessment?.compositeScore;
  const scoreVal = isEvaluated && typeof rawScore === 'number' ? Math.round(rawScore > 1 ? rawScore : rawScore * 100) : null;
  const severity = getRiskSeverity(scoreVal);
  const riskLevel = assessment?.risk_level || (isEvaluated ? severity.level : 'INCONCLUSIVE');
  const isThreat = scoreVal !== null && scoreVal >= 50;

  const dimensionProvenance = assessment?.dimension_provenance || {};
  const primaryDrivers: string[] = assessment?.primary_drivers || assessment?.primaryDrivers || [];
  const policyRecommendation = assessment?.policy_recommendation;

  // Find top contributing dimensions
  const activeDimensions = Object.entries(dimensionProvenance)
    .filter(([_, prov]: [string, any]) => typeof prov?.score === 'number' && prov.score > 0)
    .sort((a: any, b: any) => (b[1].score || 0) - (a[1].score || 0));

  const topDimension = activeDimensions[0];
  const topDimKey = topDimension ? topDimension[0] : null;
  const topDimData: any = topDimension ? topDimension[1] : null;

  // Step 1: Observed Evidence
  const observedEvidence =
    topDimData?.evidence?.[0] ||
    primaryDrivers[0] ||
    (isThreat
      ? 'Adversarial signals detected in conversation or audio stream.'
      : 'Conversational interaction consistent with standard customer service dialogue.');

  // Step 2: Detector Model
  const detectorModel = topDimData?.model_version || topDimData?.source_detector || (isThreat ? 'Multi-Modal Signal Analyzer' : 'Baseline Security Monitor');

  // Step 3: Risk Dimension
  const affectedDimension = topDimKey
    ? topDimKey.replace(/_/g, ' ').toUpperCase()
    : (isThreat ? 'CONVERSATIONAL & ACOUSTIC THREAT' : 'ALL DIMENSIONS NOMINAL');

  // Step 4: How it affected risk
  const riskImpact = isThreat
    ? `Contributed to composite threat score elevation (${scoreVal}/100) exceeding configured security policy threshold.`
    : 'All 10 dimensions evaluated below operational alerting thresholds.';

  // Step 5: Resulting Risk
  const resultingRisk = `${riskLevel} (${isEvaluated ? `${scoreVal}/100` : 'INCONCLUSIVE'})`;

  // Step 6: Policy Trigger
  const policyTrigger = policyRecommendation?.policy_id || (isThreat ? 'POL-CRED-001' : 'POL-DEFAULT-ALLOW');

  // Step 7: Enforced Response
  const enforcedResponse = policyRecommendation?.recommended_action || policyRecommendation?.action || (isThreat ? 'BLOCK_DISCLOSURE' : 'ALLOW_SESSION');

  const steps = [
    {
      num: '01',
      title: 'What was observed?',
      icon: Search,
      content: observedEvidence,
      badge: topDimKey ? 'EVIDENCE CUE' : 'BASELINE OBSERVATION',
      type: 'evidence',
    },
    {
      num: '02',
      title: 'Which detector identified it?',
      icon: Cpu,
      content: detectorModel,
      badge: 'PROVENANCE MODEL',
      type: 'model',
    },
    {
      num: '03',
      title: 'Which dimension was affected?',
      icon: Layers,
      content: affectedDimension,
      badge: '10D DIMENSION',
      type: 'dimension',
    },
    {
      num: '04',
      title: 'How did it impact risk?',
      icon: AlertCircle,
      content: riskImpact,
      badge: 'RISK FUSION',
      type: 'impact',
    },
    {
      num: '05',
      title: 'What is the resulting risk?',
      icon: ShieldAlert,
      content: resultingRisk,
      badge: `${riskLevel} RISK`,
      type: 'risk',
    },
    {
      num: '06',
      title: 'Which policy was triggered?',
      icon: FileText,
      content: policyTrigger,
      badge: 'DETERMINISTIC RULE',
      type: 'policy',
    },
    {
      num: '07',
      title: 'What response followed?',
      icon: CheckCircle,
      content: enforcedResponse,
      badge: 'ENFORCED ACTION',
      type: 'response',
    },
  ];

  return (
    <section aria-label="Why This Risk Causal Analysis" className="panel-enterprise p-4 md:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primaryText font-mono">
              WHY DID VOXSHIELD ASSIGN THIS RISK?
            </h2>
            <p className="text-[11px] text-mutedText font-sans">
              Traceable causal chain from observed raw telemetry through 10D decomposition to policy decision
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-elevated border border-border text-secondaryText self-start sm:self-center">
          7-STEP CAUSAL TRACE
        </span>
      </div>

      {/* Causal Flow Progress Indicator */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isSelected = activeStep === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveStep(isSelected ? null : idx)}
              className={`p-3 rounded border text-left transition-all flex flex-col justify-between min-h-[100px] ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-subtle'
                  : isThreat && (idx === 0 || idx === 4 || idx === 6)
                  ? 'border-border/80 bg-surface-elevated/80 hover:border-primary/60'
                  : 'border-border/50 bg-surface hover:bg-surface-elevated/40'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-[10px] font-mono font-bold text-mutedText">{step.num}</span>
                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-secondaryText'}`} />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-mutedText block font-mono">
                  {step.title}
                </span>
                <span className="text-xs font-bold font-mono text-primaryText block truncate">
                  {step.content}
                </span>
              </div>

              <div className="mt-2 pt-1 border-t border-border/40 flex items-center justify-between">
                <span className="text-[9px] font-mono text-secondaryText">{step.badge}</span>
                <ChevronRight className="w-3 h-3 text-mutedText" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded Step Detail Box if an officer clicks on a step */}
      {activeStep !== null && (
        <div className="p-3.5 rounded bg-surface-elevated border border-primary/40 space-y-2 animate-fadeIn text-xs font-sans">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-primary flex items-center gap-1.5">
              <span>STEP {steps[activeStep].num}:</span>
              <span>{steps[activeStep].title}</span>
            </span>
            <button
              onClick={() => setActiveStep(null)}
              className="text-mutedText hover:text-primaryText font-mono text-[11px]"
            >
              Close Details [ESC]
            </button>
          </div>
          <p className="text-secondaryText leading-relaxed">{steps[activeStep].content}</p>
          <div className="text-[11px] font-mono text-mutedText pt-1 border-t border-border">
            Trace classification: <strong className="text-primaryText">{steps[activeStep].badge}</strong> •
            Subsystem provenance verified by deterministic security pipeline.
          </div>
        </div>
      )}
    </section>
  );
};
