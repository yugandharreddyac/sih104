'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon, ArrowUpRight } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  subtext?: string;
  statusColor?: 'emerald' | 'cyan' | 'amber' | 'rose' | 'slate';
  href?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  subtext,
  statusColor = 'slate',
  href,
}) => {
  const colorMap = {
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      valueColor: 'text-white',
    },
    cyan: {
      border: 'border-cyan-500/20 hover:border-cyan-500/40',
      iconBg: 'bg-cyan-500/10 text-cyan-400',
      valueColor: 'text-white',
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 text-amber-300',
      valueColor: 'text-amber-300',
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      iconBg: 'bg-rose-500/10 text-rose-400',
      valueColor: 'text-rose-400',
    },
    slate: {
      border: 'border-slate-800 hover:border-slate-700',
      iconBg: 'bg-slate-800/80 text-slate-400',
      valueColor: 'text-white',
    },
  };

  const style = colorMap[statusColor];

  const content = (
    <div className={`p-4 rounded-xl bg-[#0c1222] border transition-all ${style.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${style.iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-xs font-medium text-slate-400 font-sans uppercase tracking-wider">
            {label}
          </span>
        </div>
        {href && <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className={`text-2xl font-bold font-mono tracking-tight ${style.valueColor}`}>
          {value}
        </span>
        {subtext && (
          <span className="text-[11px] text-slate-400 font-sans">{subtext}</span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block">
        {content}
      </Link>
    );
  }

  return content;
};
