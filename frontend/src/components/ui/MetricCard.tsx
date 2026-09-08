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
  unboxed?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  subtext,
  statusColor = 'slate',
  href,
  unboxed = false,
}) => {
  const colorMap = {
    emerald: {
      border: 'border-border hover:border-success/40',
      iconColor: 'text-success',
      valueColor: 'text-primaryText',
    },
    cyan: {
      border: 'border-border hover:border-primary/40',
      iconColor: 'text-primary',
      valueColor: 'text-primaryText',
    },
    amber: {
      border: 'border-border hover:border-warning/40',
      iconColor: 'text-warning',
      valueColor: 'text-warning',
    },
    rose: {
      border: 'border-border hover:border-danger/40',
      iconColor: 'text-danger',
      valueColor: 'text-danger',
    },
    slate: {
      border: 'border-border hover:border-border-hover',
      iconColor: 'text-mutedText',
      valueColor: 'text-primaryText',
    },
  };

  const style = colorMap[statusColor];

  const content = unboxed ? (
    <div className="py-2 px-1 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 shrink-0 ${style.iconColor}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-mutedText font-sans">
            {label}
          </span>
        </div>
        {href && <ArrowUpRight className="w-3 h-3 text-mutedText group-hover:text-primaryText transition-colors" />}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold font-mono tracking-tight ${style.valueColor}`}>
          {value}
        </span>
        {subtext && (
          <span className="text-[11px] text-mutedText font-sans truncate">{subtext}</span>
        )}
      </div>
    </div>
  ) : (
    <div className={`p-4 rounded bg-surface border transition-colors shadow-subtle ${style.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 shrink-0 ${style.iconColor}`} />
          <span className="text-xs font-medium text-secondaryText font-sans">
            {label}
          </span>
        </div>
        {href && <ArrowUpRight className="w-3.5 h-3.5 text-mutedText group-hover:text-primaryText transition-colors" />}
      </div>
      <div className="mt-2.5 flex items-baseline justify-between">
        <span className={`text-xl font-semibold font-mono tracking-tight ${style.valueColor}`}>
          {value}
        </span>
        {subtext && (
          <span className="text-xs text-mutedText font-sans">{subtext}</span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded">
        {content}
      </Link>
    );
  }

  return content;
};
