'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Shield,
  PhoneCall,
  AlertTriangle,
  Lock,
  BarChart3,
  FileCheck2,
  Network,
  ScrollText,
  Activity,
  ArrowRight,
  Command,
  X,
} from 'lucide-react';

interface SearchItem {
  id: string;
  title: string;
  category: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

const SEARCH_ITEMS: SearchItem[] = [
  {
    id: 'dashboard',
    title: 'Overview Dashboard',
    category: 'MONITOR',
    description: 'Executive SOC KPIs, active threat feeds, and SLA health overview',
    href: '/dashboard',
    icon: Shield,
  },
  {
    id: 'calls',
    title: 'Live Voice Sessions',
    category: 'MONITOR',
    description: 'Real-time microphone interception, Whisper ASR, and 10D threat telemetry',
    href: '/calls',
    icon: PhoneCall,
  },
  {
    id: 'incidents',
    title: 'Incident Response',
    category: 'RESPOND',
    description: 'Case triage, threat containment queue, and account quarantine orders',
    href: '/incidents',
    icon: AlertTriangle,
  },
  {
    id: 'verification',
    title: 'Step-Up Verification',
    category: 'RESPOND',
    description: 'Out-of-band identity challenges and executive MFA authentication',
    href: '/verification',
    icon: Lock,
  },
  {
    id: 'risk',
    title: 'Risk Assessment & Analytics',
    category: 'ANALYZE',
    description: '10-dimensional risk tensor breakdown, evidence graphs, and forensic cues',
    href: '/risk',
    icon: BarChart3,
  },
  {
    id: 'policies',
    title: 'Security Policy Engine',
    category: 'ANALYZE',
    description: 'Autonomous guardrail rules, deterministic mitigation, and JSON simulator',
    href: '/policies',
    icon: FileCheck2,
  },
  {
    id: 'diagrams',
    title: 'Architecture & Diagrams',
    category: 'ANALYZE',
    description: 'Standalone vector SVG assets, feasibility charts, and tech stack models',
    href: '/diagrams',
    icon: Network,
  },
  {
    id: 'audit',
    title: 'Security Audit Logs',
    category: 'GOVERN',
    description: 'Cryptographic tamper-evident action trail and analyst intervention logs',
    href: '/audit',
    icon: ScrollText,
  },
  {
    id: 'health',
    title: 'System Health & SLAs',
    category: 'GOVERN',
    description: 'Microservice uptime, Acoustic AI SLAs, and Privacy Firewall status',
    href: '/health',
    icon: Activity,
  },
];

export const GlobalSearch: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const filteredItems = SEARCH_ITEMS.filter((item) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });

  const handleSelect = (item: SearchItem) => {
    setIsOpen(false);
    router.push(item.href);
  };

  const handleKeyDownList = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded border border-border bg-surface-elevated hover:bg-surface-hover text-mutedText hover:text-primaryText text-xs font-sans transition-colors cursor-pointer"
        title="Quick Command Search (Ctrl+K)"
        aria-label="Search platform"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-secondaryText font-medium">Search navigation...</span>
        <kbd className="ml-2 flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-mutedText">
          <span>Ctrl</span>
          <span>K</span>
        </kbd>
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-elevated overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            {/* Search Input Bar */}
            <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border bg-surface-elevated">
              <Search className="w-4 h-4 text-primary shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDownList}
                placeholder="Jump to route, analysis module, or governance log..."
                className="flex-1 bg-transparent text-primaryText placeholder:text-mutedText text-xs font-sans focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 text-mutedText hover:text-primaryText"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-mutedText">
                ESC
              </kbd>
            </div>

            {/* Search Results List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-mutedText font-sans">
                  No matching platform destinations found for &quot;{query}&quot;
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between p-2.5 rounded text-left transition-colors text-xs font-sans ${
                        isSelected
                          ? 'bg-primary/10 text-primaryText border border-primary/25'
                          : 'text-secondaryText hover:bg-surface-elevated border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded shrink-0 ${
                            isSelected
                              ? 'bg-primary text-white'
                              : 'bg-surface-elevated border border-border text-mutedText'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-primaryText truncate">
                              {item.title}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold tracking-wider uppercase bg-surface-elevated text-mutedText border border-border">
                              {item.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-mutedText truncate mt-0.5">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <ArrowRight
                        className={`w-3.5 h-3.5 shrink-0 ml-2 transition-transform ${
                          isSelected ? 'text-primary translate-x-0.5' : 'text-mutedText/40'
                        }`}
                      />
                    </button>
                  );
                })
              )}
            </div>

            {/* Modal Footer Key Navigation Helper */}
            <div className="px-3.5 py-2 border-t border-border bg-surface-elevated flex items-center justify-between text-[11px] text-mutedText font-sans">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-surface border border-border text-[9px] font-mono">↑</kbd>
                  <kbd className="px-1 py-0.5 rounded bg-surface border border-border text-[9px] font-mono">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-surface border border-border text-[9px] font-mono">↵</kbd>
                  <span>Select</span>
                </span>
              </div>
              <span className="text-[10px] text-mutedText font-mono">VOXSHIELD Command Palette</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
