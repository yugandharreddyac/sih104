'use client';

import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Search,
  RefreshCw,
  ChevronRight,
  ShieldX,
  PhoneIncoming,
  PhoneOutgoing,
  Calendar,
  Filter,
} from 'lucide-react';
import { ApiClient, CallSession } from '@/lib/api';

interface CallHistoryItem {
  id: string;
  callerIdentifier: string;
  callerDisplayName?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  createdAt: string;
  riskScore?: number | null;
  riskLevel?: string;
  threatClassification?: string;
  durationSeconds?: number;
}

interface CallHistoryProps {
  onSelectCall?: (call: CallSession) => void;
  onReportCall?: (call: CallSession) => void;
}

export const CallHistory: React.FC<CallHistoryProps> = ({
  onSelectCall,
  onReportCall,
}) => {
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<'ALL' | 'HIGH' | 'LOW'>('ALL');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await ApiClient.get<any[]>('/calls');
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        const mapped: CallHistoryItem[] = res.data.map((c: any) => ({
          id: c.id,
          callerIdentifier: c.callerIdentifier || c.caller_identifier || 'Unknown Caller',
          callerDisplayName: c.callerDisplayName || c.metadata?.department || undefined,
          direction: c.direction || 'INBOUND',
          status: c.status || 'TERMINATED',
          createdAt: c.createdAt || c.startedAt || new Date().toISOString(),
          riskScore: c.metadata?.riskScore ?? (c.status === 'BLOCKED' ? 88 : 15),
          riskLevel: c.status === 'BLOCKED' ? 'HIGH RISK' : c.status === 'FLAGGED' ? 'SUSPICIOUS' : 'LOW RISK',
          threatClassification: c.metadata?.threatClassification || (c.status === 'BLOCKED' ? 'AI Voice Impersonation' : undefined),
          durationSeconds: c.durationSeconds || 120,
        }));
        setCalls(mapped);
      } else {
        // Fallback default sample history
        const samples: CallHistoryItem[] = [
          {
            id: 'call-hist-001',
            callerIdentifier: '+1 (555) 019-2834',
            callerDisplayName: 'Treasury Wire Pretext',
            direction: 'INBOUND',
            status: 'BLOCKED',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            riskScore: 84,
            riskLevel: 'HIGH RISK',
            threatClassification: 'AI Voice Cloning & Credential Harvesting',
            durationSeconds: 145,
          },
          {
            id: 'call-hist-002',
            callerIdentifier: '+1 (555) 014-9912',
            callerDisplayName: 'IT Helpdesk Password Reset',
            direction: 'INBOUND',
            status: 'FLAGGED',
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            riskScore: 68,
            riskLevel: 'SUSPICIOUS',
            threatClassification: 'High-Pressure Urgent Pretext',
            durationSeconds: 210,
          },
          {
            id: 'call-hist-003',
            callerIdentifier: '+1 (800) 555-0100',
            callerDisplayName: 'Verified Bank Support',
            direction: 'INBOUND',
            status: 'TERMINATED',
            createdAt: new Date(Date.now() - 172800000).toISOString(),
            riskScore: 12,
            riskLevel: 'LOW RISK',
            durationSeconds: 95,
          },
        ];
        setCalls(samples);
      }
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredCalls = calls.filter((call) => {
    const matchesQuery =
      call.callerIdentifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (call.callerDisplayName && call.callerDisplayName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (call.threatClassification && call.threatClassification.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesQuery) return false;

    if (filterRisk === 'HIGH') {
      return call.riskLevel?.includes('HIGH') || call.status === 'BLOCKED' || (call.riskScore ?? 0) >= 70;
    }
    if (filterRisk === 'LOW') {
      return call.riskLevel?.includes('LOW') || (call.riskScore ?? 0) < 40;
    }
    return true;
  });

  const formatCallDate = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  return (
    <div className="p-5 rounded-2xl bg-[#24242B] border border-[#3A3A42] shadow-2xl shadow-black/80 space-y-4 select-none animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#3A3A42] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#7A1F3D]/20 border border-[#7A1F3D]/40 flex items-center justify-center text-[#F5F5F7] shadow-sm">
            <Clock className="w-4 h-4 text-[#F5F5F7]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F5F5F7] font-mono tracking-wide">
              CALL PROTECTION HISTORY
            </h3>
            <p className="text-[11px] text-[#A0A4AE]">
              Recent protected call logs & threat records
            </p>
          </div>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="p-2 rounded-xl bg-[#2E2E36] hover:bg-[#3A3A42] text-[#F5F5F7] transition-colors shadow-sm"
          title="Refresh History"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#A0A4AE] absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by caller, label, or threat..."
            className="w-full pl-8 pr-3 py-2 bg-[#1A1A1F] border border-[#3A3A42] rounded-xl text-xs text-[#F5F5F7] placeholder-[#A0A4AE]/60 focus:outline-none focus:border-[#7A1F3D] shadow-inner font-sans"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#1A1A1F] p-1 rounded-xl border border-[#3A3A42] shrink-0">
          <button
            onClick={() => setFilterRisk('ALL')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all ${
              filterRisk === 'ALL'
                ? 'bg-[#7A1F3D] text-[#F5F5F7] shadow-sm'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7]'
            }`}
          >
            All ({calls.length})
          </button>
          <button
            onClick={() => setFilterRisk('HIGH')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all ${
              filterRisk === 'HIGH'
                ? 'bg-[#D94A5A] text-[#F5F5F7] shadow-sm'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7]'
            }`}
          >
            Threats
          </button>
          <button
            onClick={() => setFilterRisk('LOW')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all ${
              filterRisk === 'LOW'
                ? 'bg-[#168F86] text-[#F5F5F7] shadow-sm'
                : 'text-[#A0A4AE] hover:text-[#F5F5F7]'
            }`}
          >
            Low Risk
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-[#A0A4AE] space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C87524]" />
            <p>Loading historical call records...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#A0A4AE] italic bg-[#1A1A1F] rounded-xl border border-[#3A3A42]">
            No call records found matching criteria.
          </div>
        ) : (
          filteredCalls.map((item) => {
            const { date, time } = formatCallDate(item.createdAt);
            const isThreat = item.riskLevel?.includes('HIGH') || item.status === 'BLOCKED' || (item.riskScore ?? 0) >= 70;
            const isSuspicious = item.riskLevel?.includes('SUSPICIOUS') || item.status === 'FLAGGED';

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-[#1A1A1F] hover:bg-[#2E2E36] border border-[#3A3A42] hover:border-[#482E52] transition-all space-y-2 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm ${
                        isThreat
                          ? 'bg-[#D94A5A]/20 text-[#D94A5A] border border-[#D94A5A]/30'
                          : isSuspicious
                          ? 'bg-[#C87524]/20 text-[#C87524] border border-[#C87524]/30'
                          : 'bg-[#168F86]/20 text-[#168F86] border border-[#168F86]/30'
                      }`}
                    >
                      {item.direction === 'INBOUND' ? (
                        <PhoneIncoming className="w-4 h-4" />
                      ) : (
                        <PhoneOutgoing className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-[#F5F5F7] font-mono">
                        {item.callerIdentifier}
                      </h4>
                      {item.callerDisplayName && (
                        <p className="text-[11px] text-[#A0A4AE] font-sans">
                          {item.callerDisplayName}
                        </p>
                      )}
                      <p className="text-[10px] text-[#A0A4AE]/70 font-mono mt-0.5">
                        {date} at {time} • {item.durationSeconds || 60}s
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono border shadow-sm ${
                        isThreat
                          ? 'bg-[#D94A5A]/20 text-[#D94A5A] border-[#D94A5A]/40'
                          : isSuspicious
                          ? 'bg-[#C87524]/20 text-[#C87524] border-[#C87524]/40'
                          : 'bg-[#168F86]/20 text-[#168F86] border-[#168F86]/40'
                      }`}
                    >
                      {item.riskLevel || 'LOW RISK'}
                    </span>
                    {item.riskScore !== undefined && item.riskScore !== null && (
                      <p className="text-[10px] font-mono text-[#A0A4AE] mt-0.5 font-medium">
                        Score: {item.riskScore}/100
                      </p>
                    )}
                  </div>
                </div>

                {item.threatClassification && (
                  <div className="p-2 rounded-lg bg-[#D94A5A]/10 border border-[#D94A5A]/25 text-[11px] text-[#D94A5A] flex items-center gap-1.5 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#D94A5A] shrink-0" />
                    <span className="truncate">{item.threatClassification}</span>
                  </div>
                )}

                {/* Card Quick Action */}
                {isThreat && onReportCall && (
                  <div className="pt-1.5 border-t border-[#3A3A42] flex justify-end">
                    <button
                      onClick={() =>
                        onReportCall({
                          id: item.id,
                          callerIdentifier: item.callerIdentifier,
                          callerDisplayName: item.callerDisplayName,
                          direction: item.direction,
                          status: item.status as any,
                          organizationId: '00000000-0000-0000-0000-000000000001',
                          createdAt: item.createdAt,
                        })
                      }
                      className="text-[11px] font-mono text-[#D94A5A] hover:text-[#E25C6B] flex items-center gap-1.5 transition-colors font-semibold"
                    >
                      <ShieldX className="w-3.5 h-3.5" />
                      <span>Report to Cyber Cell</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
