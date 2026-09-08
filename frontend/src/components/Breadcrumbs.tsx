'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Shield } from 'lucide-react';

interface RouteMeta {
  group: string;
  name: string;
}

const ROUTE_MAP: Record<string, RouteMeta> = {
  '/dashboard': { group: 'MONITOR', name: 'Overview' },
  '/calls': { group: 'MONITOR', name: 'Live Voice Sessions' },
  '/incidents': { group: 'RESPOND', name: 'Incident Response' },
  '/verification': { group: 'RESPOND', name: 'Step-Up Verification' },
  '/risk': { group: 'ANALYZE', name: 'Risk Assessment' },
  '/policies': { group: 'ANALYZE', name: 'Policy Engine' },
  '/diagrams': { group: 'ANALYZE', name: 'Architecture & Diagrams' },
  '/audit': { group: 'GOVERN', name: 'Audit Logs' },
  '/health': { group: 'GOVERN', name: 'System Health' },
};

export const Breadcrumbs: React.FC = () => {
  const pathname = usePathname();
  const current = ROUTE_MAP[pathname] || { group: 'PLATFORM', name: 'Portal' };

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-mutedText font-sans">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-mutedText hover:text-primaryText transition-colors"
        title="VOXSHIELD Platform"
      >
        <Shield className="w-3.5 h-3.5 text-primary" />
        <span className="font-semibold text-primaryText tracking-tight">VOXSHIELD</span>
      </Link>

      <ChevronRight className="w-3 h-3 text-mutedText/70 shrink-0" />

      <span className="text-[10px] font-semibold tracking-wider text-mutedText uppercase">
        {current.group}
      </span>

      <ChevronRight className="w-3 h-3 text-mutedText/70 shrink-0" />

      <span className="text-secondaryText font-medium truncate max-w-[200px]">
        {current.name}
      </span>
    </nav>
  );
};
