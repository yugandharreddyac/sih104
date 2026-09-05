'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Navbar } from '@/components/Navbar';
import { Phase1Notice } from '@/components/Phase1Notice';
import { AlertTriangle, ShieldAlert, CheckCircle2, RefreshCw, FileText, Lock } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeTime } from '@/lib/format';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);

  const fetchIncidents = React.useCallback(async () => {
    setLoading(true);
    const res = await ApiClient.get('/incidents');
    setLoading(false);
    if (res.success && res.data) {
      setIncidents(res.data);
      if (res.data.length > 0 && !selectedIncident) {
        setSelectedIncident(res.data[0]);
      }
    }
  }, [selectedIncident]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleUpdateStatus = async (id: string, status: string) => {
    const res = await ApiClient.patch(`/incidents/${id}/status`, {
      status,
      notes: `Status changed to ${status} via SOC console`,
    });
    if (res.success) {
      fetchIncidents();
      if (selectedIncident?.id === id) {
        setSelectedIncident(res.data);
      }
    }
  };

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Incident Response & Case Management" subtitle="Voice impersonation & fraud triage" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <Phase1Notice />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Incidents List */}
            <div className="soc-glass p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Incidents ({incidents.length})</span>
                </h3>
                <button
                  onClick={fetchIncidents}
                  aria-label="Refresh Incidents"
                  className="p-1 text-slate-400 hover:text-white rounded transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-2">
                {incidents.length === 0 && !loading && (
                  <div className="p-6 text-center text-slate-500 font-mono text-xs">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400/50 mx-auto mb-1.5" />
                    <p className="text-slate-300 font-semibold">Incident Queue Clear</p>
                    <p className="text-[10px] text-slate-500 mt-1">No security violations currently open.</p>
                  </div>
                )}
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedIncident?.id === inc.id
                        ? 'bg-rose-950/30 border-rose-500/50 shadow-md'
                        : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-bold text-white">{inc.incidentNumber}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                          inc.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : inc.severity === 'HIGH'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2 mt-1">{inc.summary}</p>
                    <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60">
                      <span>Status: {inc.status}</span>
                      <span>{formatSafeTime(inc.detectedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Incident Details & Case Actions */}
            <div className="lg:col-span-2 soc-glass p-5 rounded-xl border border-slate-800 space-y-4">
              {selectedIncident ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-white font-mono">{selectedIncident.incidentNumber}</h2>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                          {selectedIncident.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-1">
                        Classification: {selectedIncident.attackClassification}
                      </p>
                      {selectedIncident.callId && (
                        <p className="text-[11px] text-cyan-400 font-mono mt-0.5">
                          Associated Call: {selectedIncident.callId}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'CONTAINED')}
                        className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Contain
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'RESOLVED')}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(selectedIncident.id, 'FALSE_POSITIVE')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                      >
                        False Positive
                      </button>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-200 leading-relaxed">
                    <span className="text-slate-400 font-mono block text-[10px] uppercase mb-1 font-semibold">Incident Summary</span>
                    {selectedIncident.summary}
                  </div>

                  {/* Triggered Policies & Actions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase mb-1.5 font-semibold">Triggered Policies</span>
                      {selectedIncident.triggeredPolicies?.map((pol: string, idx: number) => (
                        <div key={idx} className="text-indigo-300 font-medium">{pol}</div>
                      ))}
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                      <span className="text-slate-500 block text-[10px] uppercase mb-1.5 font-semibold">Actions Enforced</span>
                      {selectedIncident.actionsTaken?.map((act: string, idx: number) => (
                        <div key={idx} className="text-cyan-300 font-medium">{act}</div>
                      ))}
                    </div>
                  </div>

                  {/* Evidence References */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Tamper-Evident Evidence Trail</span>
                    </h4>
                    <div className="space-y-2">
                      {selectedIncident.evidenceReferences?.map((ev: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs font-mono space-y-1">
                          <div className="flex justify-between text-slate-300">
                            <span className="text-indigo-400 font-bold">{ev.type}</span>
                            <span className="text-slate-500 text-[10px]">SHA-256: {ev.hash?.slice(0, 16)}...</span>
                          </div>
                          <p className="text-slate-400 text-[11px]">{ev.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-slate-500 text-sm font-mono">
                  Select an incident from the list to view investigation details.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
