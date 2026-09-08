'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, ShieldAlert, CheckCircle2, Clock, X, ExternalLink } from 'lucide-react';
import { ApiClient } from '@/lib/api';
import { formatSafeTime } from '@/lib/format';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'INFO';
  timestamp: string;
  link?: string;
  read: boolean;
}

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Poll recent incidents or load active threat signals
  useEffect(() => {
    let mounted = true;

    const loadAlerts = async () => {
      try {
        const res = await ApiClient.get('/incidents');
        if (mounted && res.success && res.data) {
          const mapped: NotificationItem[] = res.data.slice(0, 8).map((inc: any) => ({
            id: inc.id,
            title: inc.title || `Incident #${inc.incidentNumber || inc.id.slice(0, 8)}`,
            message: inc.description || 'Voice impersonation threat detected by acoustic AI pipeline.',
            severity: inc.severity === 'CRITICAL' ? 'CRITICAL' : inc.severity === 'HIGH' ? 'HIGH' : 'INFO',
            timestamp: inc.createdAt || new Date().toISOString(),
            link: '/incidents',
            read: inc.status === 'RESOLVED',
          }));
          setNotifications(mapped);
        }
      } catch {
        // graceful offline fallback
      }
    };

    loadAlerts();
    const interval = setInterval(loadAlerts, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-1.5 rounded text-mutedText hover:text-primaryText hover:bg-surface-elevated transition-colors"
        title="Security Telemetry Alerts"
        aria-label="Security notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
          </span>
        )}
      </button>

      {/* Popover Drawer */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface border border-border rounded-lg shadow-elevated overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-elevated">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primaryText">Security Alerts</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-danger/10 text-danger border border-danger/20">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] text-mutedText hover:text-primary transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-mutedText">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-success/60" />
                <span>Zero active threats in telemetry queue</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 text-xs transition-colors flex items-start justify-between gap-2.5 ${
                    notif.read ? 'bg-surface opacity-75' : 'bg-surface-elevated/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`p-1 rounded shrink-0 mt-0.5 ${
                        notif.severity === 'CRITICAL'
                          ? 'bg-danger/15 text-danger'
                          : notif.severity === 'HIGH'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-info/15 text-info'
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-primaryText truncate text-[12px]">
                          {notif.title}
                        </span>
                        <span
                          className={`text-[9px] px-1 rounded font-semibold uppercase ${
                            notif.severity === 'CRITICAL'
                              ? 'bg-danger/10 text-danger'
                              : notif.severity === 'HIGH'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-info/10 text-info'
                          }`}
                        >
                          {notif.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-secondaryText line-clamp-2 mt-0.5">
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-mutedText mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatSafeTime(notif.timestamp)}</span>
                        {notif.link && (
                          <Link
                            href={notif.link}
                            onClick={() => setIsOpen(false)}
                            className="text-primary hover:underline flex items-center gap-0.5 ml-auto"
                          >
                            <span>Investigate</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => clearNotification(notif.id)}
                    className="text-mutedText hover:text-primaryText p-0.5 shrink-0"
                    title="Dismiss alert"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border bg-surface-elevated text-center">
            <Link
              href="/incidents"
              onClick={() => setIsOpen(false)}
              className="text-xs text-primary hover:text-primary-hover font-medium flex items-center justify-center gap-1"
            >
              <span>View Full Incident Queue</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
