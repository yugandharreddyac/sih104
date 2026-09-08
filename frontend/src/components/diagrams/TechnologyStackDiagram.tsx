'use client';

import React, { useState } from 'react';
import {
  Layers,
  Server,
  Radio,
  Cpu,
  Mic,
  ShieldAlert,
  Database,
  Lock,
  ShieldCheck,
} from 'lucide-react';

export interface TechnologyStackDiagramProps {
  className?: string;
  theme?: 'light' | 'dark' | 'auto';
}

interface TechNode {
  id: string;
  name: string;
  category: string;
  icon: any;
  angle: number;
  description: string;
}

const TECH_NODES: TechNode[] = [
  {
    id: 'nextjs',
    name: 'Next.js 14',
    category: 'Frontend & SOC Shell',
    icon: Layers,
    angle: -90,
    description: 'React Server Components, App Router & Tailwind CSS',
  },
  {
    id: 'pytorch',
    name: 'PyTorch + MiniAcousticCNN',
    category: 'Acoustic Deepfake Inference',
    icon: Cpu,
    angle: -45,
    description: 'ONNX runtime engine, sub-256ms audio tensor classification',
  },
  {
    id: 'websockets',
    name: 'WebSockets + RTP',
    category: 'Streaming Ingestion',
    icon: Radio,
    angle: 0,
    description: 'Bi-directional audio chunks & real-time telemetry broadcast',
  },
  {
    id: 'riskfusion',
    name: '10D Risk Fusion',
    category: 'Multi-Modal Threat Engine',
    icon: ShieldAlert,
    angle: 45,
    description: 'Bayesian multi-modal threat aggregation & dynamic scoring',
  },
  {
    id: 'nodejs',
    name: 'Node.js + Express',
    category: 'Backend Gateway',
    icon: Server,
    angle: 90,
    description: 'API gateway, session orchestrator & deterministic policy engine',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL + Redis',
    category: 'Data & Persistence Layer',
    icon: Database,
    angle: 135,
    description: 'Relational audit trail, ephemeral ring buffer & fast cache',
  },
  {
    id: 'security',
    name: 'JWT + RBAC + Privacy Firewall',
    category: 'Zero-Trust Security',
    icon: Lock,
    angle: 180,
    description: 'Analyst role scoping, token security & zero audio retention',
  },
  {
    id: 'whisper',
    name: 'Faster-Whisper',
    category: 'Speech Recognition',
    icon: Mic,
    angle: 225,
    description: 'Low-latency streaming ASR & conversational intent extraction',
  },
];

export const TechnologyStackDiagram: React.FC<TechnologyStackDiagramProps> = ({
  className = '',
  theme = 'auto',
}) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // SVG Geometry for Desktop/Tablet Circular View
  const svgSize = 640;
  const center = svgSize / 2;
  const radius = 230;

  // Theme colors
  const isLight = theme === 'light';
  const isDark = theme === 'dark';

  const textColorPrimary = isLight ? '#111827' : isDark ? '#F2F4F7' : 'currentColor';
  const textColorSecondary = isLight ? '#4B5563' : isDark ? '#A7AFBA' : 'currentColor';
  const textColorMuted = isLight ? '#6B7280' : isDark ? '#6C7684' : 'currentColor';
  const gridLineColor = isLight ? '#E5E7EB' : isDark ? '#2A3038' : 'currentColor';
  const cardBg = isLight ? '#FFFFFF' : isDark ? '#171A20' : 'bg-surface';
  const cardBorder = isLight ? '#E5E7EB' : isDark ? '#2A3038' : 'border-border';
  const centerBg = isLight ? '#F9FAFB' : isDark ? '#1D2128' : '#F9FAFB';
  const nodeBoxBg = isLight ? '#FFFFFF' : isDark ? '#171A20' : '#FFFFFF';
  const nodeBoxHoverBg = isLight ? '#EFF6FF' : isDark ? '#222731' : '#EFF6FF';
  const connectorColor = isLight ? '#D1D5DB' : isDark ? '#374151' : 'currentColor';

  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: Math.round((cx + r * Math.cos(angleInRadians)) * 100) / 100,
      y: Math.round((cy + r * Math.sin(angleInRadians)) * 100) / 100,
    };
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
      <div className="pb-3 border-b mb-4" style={{ borderColor: gridLineColor }}>
        <h3 className="text-sm font-semibold tracking-tight" style={{ color: textColorPrimary }}>
          VOXSHIELD Technology Stack
        </h3>
        <p className="text-xs mt-0.5 font-sans" style={{ color: textColorMuted }}>
          Distributed modular architecture powering real-time acoustic, biometric, and conversational defense
        </p>
      </div>

      {/* Desktop & Tablet Circular View (>= 768px) */}
      <div className="hidden md:block relative w-full aspect-[4/3] max-w-2xl mx-auto my-4">
        <svg
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="w-full h-full overflow-visible font-sans"
          role="img"
          aria-label="Circular architecture diagram showing VOXSHIELD connecting to 8 core technologies"
        >
          {/* Subtle Concentric Guide Ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={gridLineColor}
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Connector Lines from Center to Each Node */}
          {TECH_NODES.map((node) => {
            const pos = polarToCartesian(center, center, radius, node.angle);
            const isHovered = hoveredNode === node.id;

            return (
              <line
                key={`line-${node.id}`}
                x1={center}
                y1={center}
                x2={pos.x}
                y2={pos.y}
                stroke={isHovered ? '#3B82F6' : connectorColor}
                strokeWidth={isHovered ? 2 : 1}
                className="transition-colors duration-200"
              />
            );
          })}

          {/* Central VOXSHIELD Node */}
          <g className="cursor-default">
            <circle
              cx={center}
              cy={center}
              r={72}
              fill={centerBg}
              stroke={hoveredNode ? '#3B82F6' : gridLineColor}
              strokeWidth="2"
              className="transition-colors duration-200"
            />
            <text
              x={center}
              y={center - 12}
              textAnchor="middle"
              fill={textColorPrimary}
              className="text-base font-bold tracking-tight font-sans"
            >
              VOXSHIELD
            </text>
            <text
              x={center}
              y={center + 6}
              textAnchor="middle"
              fill={textColorMuted}
              className="text-[9px] uppercase tracking-wider font-semibold font-sans"
            >
              Real-Time Voice
            </text>
            <text
              x={center}
              y={center + 18}
              textAnchor="middle"
              fill={textColorMuted}
              className="text-[9px] uppercase tracking-wider font-semibold font-sans"
            >
              Security Platform
            </text>
          </g>

          {/* 8 Outer Technology Nodes */}
          {TECH_NODES.map((node) => {
            const pos = polarToCartesian(center, center, radius, node.angle);
            const isHovered = hoveredNode === node.id;
            const nodeWidth = 140;
            const nodeHeight = 52;
            const rx = pos.x - nodeWidth / 2;
            const ry = pos.y - nodeHeight / 2;

            return (
              <g
                key={`node-${node.id}`}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                tabIndex={0}
                aria-label={`${node.name}: ${node.category}`}
              >
                {/* Node Box */}
                <rect
                  x={rx}
                  y={ry}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx={6}
                  fill={isHovered ? nodeBoxHoverBg : nodeBoxBg}
                  stroke={isHovered ? '#3B82F6' : gridLineColor}
                  strokeWidth={isHovered ? 1.5 : 1}
                  className="transition-colors duration-200"
                />

                {/* Node Title */}
                <text
                  x={pos.x}
                  y={pos.y - 4}
                  textAnchor="middle"
                  fill={isHovered ? '#3B82F6' : textColorPrimary}
                  className="text-[11px] font-semibold font-sans transition-colors"
                >
                  {node.name}
                </text>

                {/* Node Category */}
                <text
                  x={pos.x}
                  y={pos.y + 12}
                  textAnchor="middle"
                  fill={textColorMuted}
                  className="text-[9px] uppercase tracking-wider font-medium font-sans"
                >
                  {node.category}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mobile Adaptive Architecture View (< 768px) */}
      <div className="block md:hidden space-y-4">
        {/* Central Hub Header */}
        <div
          className="text-center p-3.5 rounded border"
          style={{ backgroundColor: centerBg, borderColor: gridLineColor }}
        >
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#3B82F6]" />
            <span className="font-bold text-sm tracking-tight" style={{ color: textColorPrimary }}>
              VOXSHIELD
            </span>
          </div>
          <p className="text-[11px] mt-0.5 font-sans" style={{ color: textColorMuted }}>
            Real-Time Voice Security Platform
          </p>
        </div>

        {/* 2-Column Responsive Technology Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TECH_NODES.map((node) => {
            const IconComp = node.icon;
            const isHovered = hoveredNode === node.id;

            return (
              <div
                key={`mob-${node.id}`}
                className="p-3 rounded border text-xs transition-colors cursor-pointer"
                style={{
                  backgroundColor: isHovered ? nodeBoxHoverBg : nodeBoxBg,
                  borderColor: isHovered ? '#3B82F6' : gridLineColor,
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <div className="flex items-center gap-2">
                  <IconComp className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                  <div>
                    <div
                      className="font-semibold"
                      style={{ color: isHovered ? '#3B82F6' : textColorPrimary }}
                    >
                      {node.name}
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-wider"
                      style={{ color: textColorMuted }}
                    >
                      {node.category}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] mt-1 pl-5.5" style={{ color: textColorSecondary }}>
                  {node.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected / Hovered Technology Detail Strip */}
      <div
        className="mt-4 pt-3 border-t text-xs font-sans min-h-[32px] flex items-center justify-between"
        style={{ borderColor: gridLineColor }}
      >
        {hoveredNode ? (
          (() => {
            const active = TECH_NODES.find((n) => n.id === hoveredNode);
            return (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#3B82F6]">{active?.name}:</span>
                <span style={{ color: textColorSecondary }}>{active?.description}</span>
              </div>
            );
          })()
        ) : (
          <span style={{ color: textColorMuted }}>
            Hover or tap any technology node to inspect its architectural responsibility.
          </span>
        )}
        <span
          className="font-mono text-[11px] hidden sm:inline-block"
          style={{ color: textColorMuted }}
        >
          8 Core Subsystems
        </span>
      </div>
    </div>
  );
};
