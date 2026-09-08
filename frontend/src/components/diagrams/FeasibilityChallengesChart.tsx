'use client';

import React, { useState } from 'react';

export interface FeasibilityChallengesChartProps {
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
}

interface DataPoint {
  category: string;
  lines: string[];
  feasibility: number;
  challenges: number;
}

const DATA: DataPoint[] = [
  {
    category: 'Modular Architecture',
    lines: ['Modular', 'Architecture'],
    feasibility: 9,
    challenges: 0,
  },
  {
    category: 'Low-Cost Deployment',
    lines: ['Low-Cost', 'Deployment'],
    feasibility: 8,
    challenges: 0,
  },
  {
    category: '100 Concurrent Streams',
    lines: ['100 Concurrent', 'Streams'],
    feasibility: 8,
    challenges: 1,
  },
  {
    category: 'Real-Time Scale Needs',
    lines: ['Real-Time', 'Scale Needs'],
    feasibility: 2,
    challenges: 7,
  },
  {
    category: 'Evolving AI Attack Risk',
    lines: ['Evolving AI', 'Attack Risk'],
    feasibility: 1,
    challenges: 8,
  },
  {
    category: 'Data Handling Efficiency',
    lines: ['Data Handling', 'Efficiency'],
    feasibility: 1,
    challenges: 7,
  },
];

export const FeasibilityChallengesChart: React.FC<FeasibilityChallengesChartProps> = ({
  className = '',
  theme = 'auto',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // SVG Coordinate Space
  const width = 760;
  const height = 380;
  const padding = { top: 40, right: 40, bottom: 70, left: 55 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Color tokens based on explicit theme selection
  const isLight = theme === 'light';
  const isDark = theme === 'dark';

  const textColorPrimary = isLight ? '#111827' : isDark ? '#F2F4F7' : 'currentColor';
  const textColorSecondary = isLight ? '#4B5563' : isDark ? '#A7AFBA' : 'currentColor';
  const textColorMuted = isLight ? '#6B7280' : isDark ? '#6C7684' : 'currentColor';
  const gridLineColor = isLight ? '#E5E7EB' : isDark ? '#2A3038' : 'currentColor';
  const axisLineColor = isLight ? '#D1D5DB' : isDark ? '#374151' : 'currentColor';
  const cardBg = isLight ? '#FFFFFF' : isDark ? '#171A20' : 'bg-surface';
  const cardBorder = isLight ? '#E5E7EB' : isDark ? '#2A3038' : 'border-border';

  // X position for index i
  const getX = (index: number) => {
    return Math.round((padding.left + (index / (DATA.length - 1)) * innerWidth) * 100) / 100;
  };

  // Y position for score (0–10)
  const getY = (value: number) => {
    return Math.round((padding.top + innerHeight - (value / 10) * innerHeight) * 100) / 100;
  };

  // Build SVG path strings
  const feasibilityPoints = DATA.map((d, i) => `${getX(i)},${getY(d.feasibility)}`).join(' ');
  const challengesPoints = DATA.map((d, i) => `${getX(i)},${getY(d.challenges)}`).join(' ');

  const yTicks = [0, 2, 4, 6, 8, 10];
  const activePoint = hoveredIdx !== null ? DATA[hoveredIdx] : null;

  return (
    <div
      className={`relative w-full rounded border transition-colors p-5 sm:p-6 select-none ${className}`}
      style={{
        backgroundColor: cardBg,
        borderColor: cardBorder,
        color: textColorPrimary,
      }}
    >
      {/* Header & Legend */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b mb-4"
        style={{ borderColor: gridLineColor }}
      >
        <div>
          <h3 className="text-sm font-semibold tracking-tight" style={{ color: textColorPrimary }}>
            Feasibility vs Potential Challenges
          </h3>
          <p className="text-xs mt-0.5 font-sans" style={{ color: textColorMuted }}>
            Architecture feasibility strengths plotted against implementation risk vectors
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-xs font-sans">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#3B82F6] rounded-full inline-block" />
            <span className="w-2 h-2 rounded-full bg-[#3B82F6] -ml-2.5 inline-block" />
            <span className="font-medium ml-1" style={{ color: textColorSecondary }}>
              Feasibility
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#EF4444] rounded-full inline-block" />
            <span className="w-2 h-2 rounded-full bg-[#EF4444] -ml-2.5 inline-block" />
            <span className="font-medium ml-1" style={{ color: textColorSecondary }}>
              Challenges
            </span>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible font-sans"
          role="img"
          aria-label="Line chart comparing Feasibility strengths versus Potential Challenges across 6 project dimensions"
        >
          {/* Subtle Horizontal Grid Lines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={gridLineColor}
                  strokeWidth="1"
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  fill={textColorMuted}
                  className="text-[11px] font-mono select-none"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Left Y-Axis Line */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke={axisLineColor}
            strokeWidth="1"
          />

          {/* Bottom X-Axis Line */}
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke={axisLineColor}
            strokeWidth="1"
          />

          {/* Vertical Guide when Hovering */}
          {hoveredIdx !== null && (
            <line
              x1={getX(hoveredIdx)}
              y1={padding.top}
              x2={getX(hoveredIdx)}
              y2={height - padding.bottom}
              stroke={axisLineColor}
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Feasibility Line (Blue) */}
          <polyline
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={feasibilityPoints}
          />

          {/* Challenges Line (Red) */}
          <polyline
            fill="none"
            stroke="#EF4444"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={challengesPoints}
          />

          {/* Feasibility Data Points */}
          {DATA.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.feasibility);
            const isHovered = hoveredIdx === i;

            return (
              <g key={`feas-${i}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4}
                  fill="#3B82F6"
                  stroke={isDark ? '#171A20' : '#FFFFFF'}
                  strokeWidth="2"
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  tabIndex={0}
                  aria-label={`${d.category}: Feasibility score ${d.feasibility}/10`}
                />
              </g>
            );
          })}

          {/* Challenges Data Points */}
          {DATA.map((d, i) => {
            const cx = getX(i);
            const cy = getY(d.challenges);
            const isHovered = hoveredIdx === i;

            return (
              <g key={`chal-${i}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : 4}
                  fill="#EF4444"
                  stroke={isDark ? '#171A20' : '#FFFFFF'}
                  strokeWidth="2"
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  tabIndex={0}
                  aria-label={`${d.category}: Challenges score ${d.challenges}/10`}
                />
              </g>
            );
          })}

          {/* X-Axis Multi-line Labels */}
          {DATA.map((d, i) => {
            const x = getX(i);
            const y = height - padding.bottom + 18;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={`label-${i}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <rect
                  x={x - innerWidth / (DATA.length * 2)}
                  y={padding.top}
                  width={innerWidth / DATA.length}
                  height={innerHeight + padding.bottom}
                  fill="transparent"
                />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fill={isHovered ? textColorPrimary : textColorSecondary}
                  className={`text-[11px] font-sans transition-colors ${
                    isHovered ? 'font-semibold' : 'font-normal'
                  }`}
                >
                  <tspan x={x} dy="0">
                    {d.lines[0]}
                  </tspan>
                  <tspan x={x} dy="14">
                    {d.lines[1]}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>

        {/* Clean Interactive Hover Tooltip */}
        {activePoint && hoveredIdx !== null && (
          <div
            className="absolute z-20 pointer-events-none rounded shadow-md border px-3 py-2 text-xs font-sans transition-all duration-100"
            style={{
              left: `${(getX(hoveredIdx) / width) * 100}%`,
              top: '15%',
              transform:
                hoveredIdx > 3
                  ? 'translateX(-105%)'
                  : hoveredIdx < 2
                  ? 'translateX(5%)'
                  : 'translateX(-50%)',
              backgroundColor: isDark ? '#1D2128' : '#FFFFFF',
              borderColor: isDark ? '#2A3038' : '#D9DEE5',
              color: textColorPrimary,
            }}
          >
            <div
              className="font-semibold mb-1.5 pb-1 border-b"
              style={{ borderColor: gridLineColor, color: textColorPrimary }}
            >
              {activePoint.category}
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between gap-3 text-[#3B82F6]">
                <span>Feasibility:</span>
                <span className="font-bold">{activePoint.feasibility} / 10</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[#EF4444]">
                <span>Challenges:</span>
                <span className="font-bold">{activePoint.challenges} / 10</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Notes */}
      <div
        className="mt-4 pt-3 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] gap-2"
        style={{ borderColor: gridLineColor, color: textColorMuted }}
      >
        <span>Analysis: Convergence observed at real-time scale & concurrency transition.</span>
        <span className="font-mono">Scale: 0 (Min) – 10 (Max)</span>
      </div>
    </div>
  );
};
