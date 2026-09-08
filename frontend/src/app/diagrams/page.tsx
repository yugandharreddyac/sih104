'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { FeasibilityChallengesChart } from '@/components/diagrams/FeasibilityChallengesChart';
import { RiskFusionSignalChart } from '@/components/diagrams/RiskFusionSignalChart';
import { TechnologyStackDiagram } from '@/components/diagrams/TechnologyStackDiagram';
import {
  LineChart,
  PieChart,
  Network,
  Sun,
  Moon,
  Monitor,
  Download,
  ExternalLink,
  FileCode2,
} from 'lucide-react';

export default function DiagramsShowcasePage() {
  const [diagramTheme, setDiagramTheme] = useState<'auto' | 'light' | 'dark'>('light');

  const standaloneFiles = [
    {
      title: 'Feasibility vs Potential Challenges',
      filename: 'feasibility-vs-challenges.svg',
      path: '/diagrams/feasibility-vs-challenges.svg',
      desc: 'Line chart comparing 6 feasibility strengths against implementation risk vectors (16:9 vector SVG).',
    },
    {
      title: 'Risk Fusion Signal Weighting',
      filename: 'risk-fusion-signal-weighting.svg',
      path: '/diagrams/risk-fusion-signal-weighting.svg',
      desc: '2D donut chart showing proportional signal contributions totaling 100% (16:9 vector SVG).',
    },
    {
      title: 'VOXSHIELD Technology Stack',
      filename: 'voxshield-technology-stack.svg',
      path: '/diagrams/voxshield-technology-stack.svg',
      desc: 'Circular architecture showing central platform connected to 8 microservice nodes (16:9 vector SVG).',
    },
  ];

  return (
    <div className="flex min-h-screen bg-background text-primaryText">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Architecture & Presentation Diagrams"
          subtitle="Vector-based data visualizations and standalone SVG assets for slides, documentation, and executive decks"
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto font-sans space-y-8">
          {/* Top Control Toolbar & Download Summary */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-primaryText flex items-center gap-2">
                <span>Technical Data Visualizations &amp; Architecture</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success border border-success/20 font-medium">
                  Standalone SVG Vector Ready
                </span>
              </h2>
              <p className="text-xs text-mutedText mt-0.5">
                Native vector SVG diagrams suitable for PowerPoint (16:9), Word, PDF, LaTeX, and technical whitepapers.
              </p>
            </div>

            {/* Diagram Theme Controller */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-mutedText font-medium mr-1">Preview Style:</span>
              <div className="flex items-center border border-border rounded overflow-hidden p-0.5 bg-surface-elevated">
                <button
                  type="button"
                  onClick={() => setDiagramTheme('light')}
                  className={`px-2.5 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-colors ${
                    diagramTheme === 'light'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-secondaryText hover:text-primaryText'
                  }`}
                  title="Presentation Light (Ideal for slides/exports)"
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light (Deck)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiagramTheme('dark')}
                  className={`px-2.5 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-colors ${
                    diagramTheme === 'dark'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-secondaryText hover:text-primaryText'
                  }`}
                  title="SOC Dark Mode"
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark (SOC)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiagramTheme('auto')}
                  className={`px-2.5 py-1 text-xs rounded font-medium flex items-center gap-1.5 transition-colors ${
                    diagramTheme === 'auto'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-secondaryText hover:text-primaryText'
                  }`}
                  title="Inherit system theme"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Auto</span>
                </button>
              </div>
            </div>
          </div>

          {/* Standalone Vector Asset Index */}
          <div className="p-3.5 rounded border border-border bg-surface text-xs space-y-2.5 font-sans">
            <div className="flex items-center gap-2 text-primary font-semibold">
              <FileCode2 className="w-4 h-4" />
              <span>Standalone Vector SVG Files (Saved in public/diagrams/)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {standaloneFiles.map((file) => (
                <div
                  key={file.filename}
                  className="p-2.5 rounded bg-surface-elevated border border-border flex flex-col justify-between space-y-2"
                >
                  <div>
                    <div className="font-semibold text-primaryText font-mono text-[11px] truncate">
                      {file.filename}
                    </div>
                    <p className="text-[11px] text-mutedText mt-0.5 line-clamp-2">
                      {file.desc}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <a
                      href={file.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-hover flex items-center gap-1 text-[11px] font-medium"
                    >
                      <span>Open SVG</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={file.path}
                      download={file.filename}
                      className="text-secondaryText hover:text-primaryText flex items-center gap-1 text-[11px] ml-auto font-medium"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Diagram 1: Feasibility vs Potential Challenges */}
          <section aria-label="Diagram 1: Feasibility vs Potential Challenges" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-secondaryText">
                <LineChart className="w-3.5 h-3.5 text-primary" />
                <span>Diagram 1: Feasibility vs Potential Challenges</span>
              </div>
              <a
                href="/diagrams/feasibility-vs-challenges.svg"
                download="feasibility-vs-challenges.svg"
                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 font-mono"
              >
                <Download className="w-3 h-3" />
                <span>feasibility-vs-challenges.svg</span>
              </a>
            </div>
            <FeasibilityChallengesChart theme={diagramTheme} />
          </section>

          {/* Diagram 2: Risk Fusion Signal Weighting */}
          <section aria-label="Diagram 2: Risk Fusion Signal Weighting" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-secondaryText">
                <PieChart className="w-3.5 h-3.5 text-primary" />
                <span>Diagram 2: Risk Fusion Signal Weighting</span>
              </div>
              <a
                href="/diagrams/risk-fusion-signal-weighting.svg"
                download="risk-fusion-signal-weighting.svg"
                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 font-mono"
              >
                <Download className="w-3 h-3" />
                <span>risk-fusion-signal-weighting.svg</span>
              </a>
            </div>
            <RiskFusionSignalChart theme={diagramTheme} />
          </section>

          {/* Diagram 3: VOXSHIELD Technology Stack */}
          <section aria-label="Diagram 3: VOXSHIELD Technology Stack" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-secondaryText">
                <Network className="w-3.5 h-3.5 text-primary" />
                <span>Diagram 3: Circular Technology Architecture</span>
              </div>
              <a
                href="/diagrams/voxshield-technology-stack.svg"
                download="voxshield-technology-stack.svg"
                className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 font-mono"
              >
                <Download className="w-3 h-3" />
                <span>voxshield-technology-stack.svg</span>
              </a>
            </div>
            <TechnologyStackDiagram theme={diagramTheme} />
          </section>
        </main>
      </div>
    </div>
  );
}
