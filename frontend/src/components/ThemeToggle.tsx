'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';

type ThemeMode = 'light' | 'dark' | 'system';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = (localStorage.getItem('voxshield_theme') as ThemeMode) || 'dark';
    setTheme(savedTheme);
    applyTheme(savedTheme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      const current = (localStorage.getItem('voxshield_theme') as ThemeMode) || 'dark';
      if (current === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, []);

  const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement;
    const isDark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.setAttribute('data-theme', 'light');
      root.classList.add('light');
      root.classList.remove('dark');
    }
  };

  const handleSelectTheme = (newMode: ThemeMode) => {
    setTheme(newMode);
    localStorage.setItem('voxshield_theme', newMode);
    applyTheme(newMode);
    window.dispatchEvent(new CustomEvent('voxshield-theme-change', { detail: newMode }));
  };

  if (!mounted) {
    return (
      <div className={`flex items-center bg-surface-elevated border border-border rounded p-0.5 gap-0.5 ${className}`}>
        <div className="w-6 h-6 rounded" />
        <div className="w-6 h-6 rounded" />
        <div className="w-6 h-6 rounded" />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Theme mode"
      className={`flex items-center bg-surface-elevated/70 border border-border rounded p-0.5 gap-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => handleSelectTheme('light')}
        className={`p-1 rounded text-xs transition-colors ${
          theme === 'light'
            ? 'bg-surface text-primary shadow-subtle border border-border/80'
            : 'text-mutedText hover:text-primaryText'
        }`}
        title="Light theme"
        aria-label="Switch to light theme"
        aria-pressed={theme === 'light'}
      >
        <Sun className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleSelectTheme('dark')}
        className={`p-1 rounded text-xs transition-colors ${
          theme === 'dark'
            ? 'bg-surface text-primary shadow-subtle border border-border/80'
            : 'text-mutedText hover:text-primaryText'
        }`}
        title="Dark theme"
        aria-label="Switch to dark theme"
        aria-pressed={theme === 'dark'}
      >
        <Moon className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleSelectTheme('system')}
        className={`p-1 rounded text-xs transition-colors ${
          theme === 'system'
            ? 'bg-surface text-primary shadow-subtle border border-border/80'
            : 'text-mutedText hover:text-primaryText'
        }`}
        title="System theme"
        aria-label="Use system color scheme"
        aria-pressed={theme === 'system'}
      >
        <Laptop className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
