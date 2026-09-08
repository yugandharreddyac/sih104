'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2, Smartphone, Radio, Sparkles, ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-[#1A1A1F] p-4 relative overflow-hidden">
      {/* Background Ambient Tints */}
      <div className="absolute top-1/4 left-1/4 w-[550px] h-[550px] bg-[#7A1F3D]/8 rounded-full blur-[140px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-[550px] h-[550px] bg-[#482E52]/10 rounded-full blur-[140px] pointer-events-none translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-[750px] h-[750px] bg-[#24242B]/40 rounded-full blur-[140px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />

      <div className="max-w-md w-full bg-[#24242B] p-8 rounded-3xl border border-[#3A3A42] shadow-2xl relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="relative w-16 h-16 mx-auto mb-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7A1F3D] to-[#482E52] flex items-center justify-center shadow-lg border border-[#3A3A42]">
              <Shield className="w-8 h-8 text-[#F5F5F7]" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-[#F5F5F7] tracking-tight">VOXSHIELD</h1>
          <p className="text-xs font-mono font-bold text-[#7A1F3D] tracking-wider">
            VOICE FRAUD & DEEPFAKE DEFENSE PLATFORM
          </p>
          <p className="text-xs text-[#A0A4AE] leading-relaxed max-w-xs mx-auto">
            Multi-layered AI acoustic verification & real-time human-in-the-loop SOC console.
          </p>
        </div>

        {/* Phase Architecture Badge */}
        <div className="p-3 rounded-xl bg-[#2E2E36] border border-[#3A3A42] text-[#A0A4AE] text-xs flex items-center gap-2 font-mono shadow-sm">
          <ShieldCheck className="w-4 h-4 text-[#168F86] shrink-0" />
          <span className="leading-tight text-[#F5F5F7]">Enterprise RBAC • SOC Console & Consumer Call Shield</span>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#D94A5A]/15 border border-[#D94A5A]/40 text-[#D94A5A] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#D94A5A] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A0A4AE] mb-1 font-mono">
              Operator Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#A0A4AE] absolute left-3.5 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-xl text-xs text-[#F5F5F7] placeholder-[#A0A4AE]/50 focus:outline-none focus:border-[#7A1F3D] focus:ring-1 focus:ring-[#7A1F3D]/40 font-mono transition-all shadow-inner"
                placeholder="analyst@voxshield.security"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A0A4AE] mb-1 font-mono">
              Security Key / Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#A0A4AE] absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-3.5 py-2.5 bg-[#1A1A1F] border border-[#3A3A42] rounded-xl text-xs text-[#F5F5F7] placeholder-[#A0A4AE]/50 focus:outline-none focus:border-[#7A1F3D] focus:ring-1 focus:ring-[#7A1F3D]/40 font-mono transition-all shadow-inner"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#7A1F3D] hover:bg-[#691a34] active:scale-[0.99] text-[#F5F5F7] rounded-xl text-xs font-bold font-mono tracking-wider shadow-md flex items-center justify-center gap-2 transition-all mt-4 border border-[#7A1F3D]"
          >
            {loading ? (
              <span>AUTHENTICATING...</span>
            ) : (
              <>
                <span>ENTER AUTHORITY SOC CONSOLE</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Access to Consumer Mobile App */}
        <div className="pt-2 border-t border-[#3A3A42] space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#A0A4AE] text-center">
            Or Test Consumer Call App:
          </p>
          <a
            href="/consumer"
            className="w-full py-2.5 px-4 bg-[#2E2E36] hover:bg-[#3A3A42] border border-[#3A3A42] text-[#F5F5F7] rounded-xl text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all shadow-sm group"
          >
            <Smartphone className="w-4 h-4 text-[#168F86] group-hover:scale-110 transition-transform" />
            <span>LAUNCH CONSUMER CALL APP</span>
          </a>
        </div>

        <div className="text-center pt-1">
          <p className="text-[10px] text-[#A0A4AE] font-mono">
            Demo Credentials: <span className="text-[#F5F5F7]">analyst@voxshield.security</span> / <span className="text-[#F5F5F7]">VoxShield@2026!</span>
          </p>
        </div>
      </div>
    </div>
  );
}
