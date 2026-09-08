'use client';

import React, { useState } from 'react';

export interface RiskFusionSignalChartProps {
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
}

interface SignalSlice {
  id: string;
  label: string;
  percentage: number;
  color: string;
  description: string;
}

const SIGNALS: SignalSlice[] = [
  {
    id: 'deepfake',
    label: 'Deepfake / Voice-Clone Detection',
    percentage: 35,
    color: '#3B82F6', // Blue
    description: 'Acoustic spectral artifacts & synthetic vocoder anomalies',
  },
  {
    id: 'speaker',
    label: 'Speaker Verification',
    percentage: 25,
    color: '#6366F1', // Indigo
    description: 'Biometric voiceprint embedding distance vs enrolled profile',
  },
  {
    id: 'social',
    label: 'Conversation & Social-Engineering Analysis',
    percentage: 25,
    color: '#F59E0B', // Amber
    description: 'Credential solicitation, urgency cues & NLP intent vectors',
  },
  {
    id: 'replay',
    label: 'Manipulation / Replay Detection',
    percentage: 15,
    color: '#EF4444', // Red
    description: 'Loudspeaker transfer functions & acoustic environment mismatch',
  },
];

export const RiskFusionSignalChart: React.FC<RiskFusionSignalChartProps> = ({
  className = '',
  theme = 'auto',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // SVG Geometry Settings
  const size = 320;
  const center = size / 2;
  const outerRadius = 130;
  const innerRadius = 78;

  // Theme colors
  const isLight = theme === 'light';
  const isDark = theme === 'dark';

  const textColorPrimary = isLight ? '#111827' : isDark ? '#F2F4F7' : 'currentColor';
  const textColorSecondary = isLight ? '#4B5563' : isDark ? '#A7AFBA' : 'currentColor';
  const textColorMuted = isLight ? '#6B7280' : isDark ? '#6C7684' : 'currentColor';
  const gridLineColor = isLight ? '#E5E7EB' : isDark ? '#2A3038' : 'currentColor';
  const cardBg = isLight ? '#FFFFFF' : isDark ? '#171A20' : 'bg-surface';
  const cardBorder = isLight ? '#E5E7EB' : isDark ? '#2A3038' : 'border-border';
  const centerCircleBg = isLight ? '#F9FAFB' : isDark ? '#1D2128' : '#F9FAFB';

  // Calculate slice angles
  let currentAngle = -90; // Start from 12 o'clock
  const slicesWithAngles = SIGNALS.map((s) => {
    const angle = (s.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;
    return { ...s, startAngle, endAngle };
  });

  // Helper function to calculate cartesian coordinates from polar
  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: Math.round((cx + r * Math.cos(angleInRadians)) * 100) / 100,
      y: Math.round((cy + r * Math.sin(angleInRadians)) * 100) / 100,
    };
  };

  // Helper to build SVG arc path
  const createDonutArc = (
    cx: number,
    cy: number,
    rOuter: number,
    rInner: number,
    startAngle: number,
    endAngle: number
  ) => {
    const deltaAngle = endAngle - startAngle;
    const adjustedEndAngle = deltaAngle >= 360 ? startAngle + 359.999 : endAngle;

    const p1 = polarToCartesian(cx, cy, rOuter, startAngle);
    const p2 = polarToCartesian(cx, cy, rOuter, adjustedEndAngle);
    const p3 = polarToCartesian(cx, cy, rInner, adjustedEndAngle);
    const p4 = polarToCartesian(cx, cy, rInner, startAngle);

    const largeArcFlag = deltaAngle <= 180 ? '0' : '1';

    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArcFlag} 0 ${p4.x} ${p4.y}`,
      'Z',
    ].join(' ');
  };

  return (
    <div
      className={`relative w-full rounded border transition-colors p-5 sm:p-6 select-none ${className}`}
      style={{
        backgroundColor: cardBg,
        borderColor: cardBorder,
        color: textColorPrimary,
      }}
    >
      {/* Header */}
      <div className="pb-3 border-b mb-5" style={{ borderColor: gridLineColor }}>
        <h3 className="text-sm font-semibold tracking-tight" style={{ color: textColorPrimary }}>
          Risk Fusion Signal Weighting
        </h3>
        <p className="text-xs mt-0.5 font-sans" style={{ color: textColorMuted }}>
          Proportional contribution of multi-modal detection signals to composite threat evaluation
        </p>
      </div>

      {/* Main Content Layout: Donut Chart + Legend */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-2">
        {/* Vector Donut Chart */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 shrink-0">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-full h-full overflow-visible"
            role="img"
            aria-label="Donut chart showing Risk Fusion Signal Weighting percentages: Deepfake 35%, Speaker 25%, Social Engineering 25%, Replay 15%"
          >
            {slicesWithAngles.map((slice, i) => {
              const isHovered = hoveredIdx === i;
              const rOut = isHovered ? outerRadius + 4 : outerRadius;
              const rIn = isHovered ? innerRadius - 2 : innerRadius;
              const pathD = createDonutArc(
                center,
                center,
                rOut,
                rIn,
                slice.startAngle,
                slice.endAngle
              );

              return (
                <path
                  key={slice.id}
                  d={pathD}
                  fill={slice.color}
                  stroke={isDark ? '#171A20' : '#FFFFFF'}
                  strokeWidth="2.5"
                  className="transition-all duration-150 cursor-pointer focus:outline-none"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  tabIndex={0}
                  aria-label={`${slice.label}: ${slice.percentage}%`}
                />
              );
            })}

            {/* Central Summary Hub */}
            <circle
              cx={center}
              cy={center}
              r={innerRadius - 4}
              fill={centerCircleBg}
              stroke={gridLineColor}
              strokeWidth="1"
            />
            <text
              x={center}
              y={center - 8}
              textAnchor="middle"
              fill={textColorMuted}
              className="text-[10px] uppercase font-semibold tracking-wider font-sans select-none"
            >
              Risk Fusion
            </text>
            <text
              x={center}
              y={center + 16}
              textAnchor="middle"
              fill={textColorPrimary}
              className="text-2xl font-bold font-mono select-none"
            >
              100%
            </text>
          </svg>
        </div>

        {/* Legend List Beside the Chart */}
        <div className="flex-1 w-full space-y-3 font-sans">
          {SIGNALS.map((signal, idx) => {
            const isHovered = hoveredIdx === idx;

            return (
              <div
                key={signal.id}
                className="p-2.5 rounded transition-all cursor-pointer border"
                style={{
                  backgroundColor: isHovered
                    ? isLight
                      ? '#F3F4F6'
                      : '#1D2128'
                    : 'transparent',
                  borderColor: isHovered ? (isLight ? '#D1D5DB' : '#374151') : 'transparent',
                }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: signal.color }}
                    />
                    <span
                      className={`text-xs ${isHovered ? 'font-semibold' : 'font-medium'}`}
                      style={{ color: isHovered ? textColorPrimary : textColorSecondary }}
                    >
                      {signal.label}
                    </span>
                  </div>
                  <span
                    className="font-mono text-xs font-bold"
                    style={{ color: textColorPrimary }}
                  >
                    {signal.percentage}%
                  </span>
                </div>
                <p className="text-[11px] mt-1 pl-4.5" style={{ color: textColorMuted }}>
                  {signal.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Calibration Note */}
      <div
        className="mt-5 pt-3 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] gap-2"
        style={{ borderColor: gridLineColor, color: textColorMuted }}
      >
        <span>Deterministic weighted fusion pipeline calibrated for real-time voice defense.</span>
        <span className="font-mono">Sum: 35 + 25 + 25 + 15 = 100%</span>
      </div>
    </div>
  );
};
