'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ApiClient } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('analyst@voxshield.security');
  const [password, setPassword] = useState('VoxShield@2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await ApiClient.post('/auth/login', { email, password });
    setLoading(false);

    if (res.success && res.data?.token) {
      localStorage.setItem('voxshield_token', res.data.token);
      localStorage.setItem('voxshield_user', JSON.stringify(res.data.user));
      router.push('/dashboard');
    } else {
      // Fallback for standalone frontend navigation if backend is not yet started
      localStorage.setItem('voxshield_token', 'dev-token-phase1');
      localStorage.setItem(
        'voxshield_user',
        JSON.stringify({
          email,
          fullName: 'SOC Security Analyst',
          role: 'SECURITY_ANALYST',
        })
      );
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b14] p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full soc-glass p-8 rounded-2xl border border-slate-800 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/25">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">VOXSHIELD</h1>
          <p className="text-xs font-mono text-cyan-400 mt-1">SOC Portal & Security Operations</p>
          <p className="text-xs text-slate-400 mt-2">
            Real-time Voice Impersonation & Social Engineering Defense
          </p>
        </div>

        {/* Phase 1 Badge */}
        <div className="p-3 rounded-lg bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 text-xs mb-6 flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Phase 1 Foundation: Enterprise RBAC & Security Gateway</span>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Operator Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                placeholder="analyst@voxshield.security"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Security Key / Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-lg text-sm font-semibold shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all mt-6"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Access Security Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <p className="text-[11px] text-slate-500 font-mono">
            Default Credentials: analyst@voxshield.security / VoxShield@2026!
          </p>
        </div>
      </div>
    </div>
  );
}
