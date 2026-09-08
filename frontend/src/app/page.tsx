'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { ThemeToggle } from '@/components/ThemeToggle';

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

    if (res.success && res.data?.token && res.data?.user) {
      ApiClient.setAuth(res.data.token, res.data.user);
      router.push('/dashboard');
    } else {
      setError(res.message || res.error || 'Authentication failed. Please verify credentials.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="max-w-sm w-full bg-surface p-6 sm:p-8 rounded border border-border shadow-card relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded bg-surface-elevated border border-border flex items-center justify-center mx-auto mb-3 text-primary">
            <Shield className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold text-primaryText tracking-wide font-sans">VOXSHIELD</h1>
          <p className="text-xs text-mutedText font-sans mt-0.5">
            Security Operations Center
          </p>
        </div>

        {error && (
          <div className="alert-danger mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-secondaryText mb-1 font-sans">
              Operator Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-mutedText absolute left-2.5 top-2.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username email"
                className="input-enterprise pl-9 font-sans"
                placeholder="analyst@voxshield.security"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondaryText mb-1 font-sans">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-mutedText absolute left-2.5 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="input-enterprise pl-9 font-sans"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-2 mt-4 text-xs font-medium"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Access Security Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-3 border-t border-border text-center">
          <p className="text-[11px] text-mutedText font-mono">
            analyst@voxshield.security / VoxShield@2026!
          </p>
        </div>
      </div>
    </div>
  );
}
