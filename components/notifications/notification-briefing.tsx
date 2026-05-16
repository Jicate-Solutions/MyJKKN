// components/notifications/notification-briefing.tsx
'use client';

import { useEffect, useState } from 'react';
import { TrajectoryCard } from './trajectory-card';
import type { CategoryTrajectory } from '@/lib/services/notification/notification-trajectories-service';

/**
 * "Director's Briefing" — the editorial above-the-fold section of the
 * /notifications page. Replaces 5+ duplicate "Daily digest" cards (one per
 * day per category) with one trajectory card per category, showing today's
 * value + a 7-day sparkline + change-vs-baseline + sub-category breakdown.
 *
 * Aesthetic: editorial × Bloomberg. Cream paper, ink black, severity ribbons,
 * tabular monospace numerals, display serif headline numbers, small-caps
 * eyebrows. Intentionally distinct from the rest of the platform's shadcn
 * aesthetic — this is the "morning briefing" that deserves visual identity.
 *
 * The chronological list below this section continues to render the full
 * notification log for comprehensiveness (the briefing is curation, not
 * replacement).
 */

interface BriefingState {
  loading: boolean;
  error: string | null;
  trajectories: CategoryTrajectory[];
  windowDays: number;
}

export function NotificationBriefing() {
  const [state, setState] = useState<BriefingState>({
    loading: true,
    error: null,
    trajectories: [],
    windowDays: 14
  });

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      try {
        const res = await fetch('/api/notifications/trajectories?days=14', {
          credentials: 'include',
          signal: ctrl.signal
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
        }
        const json = await res.json();
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          trajectories: json.trajectories || [],
          windowDays: json.window_days || 14
        });
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') return;
        setState({
          loading: false,
          error: err?.message || 'Failed to load briefing',
          trajectories: [],
          windowDays: 14
        });
      }
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  // Hide the briefing entirely if there's nothing to show OR an error occurred.
  // Fail soft: the chronological list below this surface is always available,
  // so if trajectories fail we don't block the rest of the page.
  if (state.error) return null;

  if (state.loading) {
    return (
      <section
        aria-label="Director's briefing — loading"
        className="mb-10 rounded-md p-6"
        style={{
          backgroundColor: '#fcfaf5',
          border: '1px solid rgba(13, 13, 13, 0.08)'
        }}
      >
        <div className="space-y-4 animate-pulse">
          <div className="h-3 w-32 bg-stone-200 rounded" />
          <div className="h-12 w-48 bg-stone-200 rounded" />
          <div className="h-3 w-64 bg-stone-200 rounded" />
        </div>
      </section>
    );
  }

  if (state.trajectories.length === 0) return null;

  // Today's date in editorial format: "MAY 4 · MONDAY"
  const today = new Date();
  const dateline = today
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      weekday: 'long'
    })
    .toUpperCase()
    .replace(',', ' ·');

  return (
    <section
      aria-label="Director's briefing"
      className="mb-10 rounded-md overflow-hidden"
      style={{
        backgroundColor: '#fcfaf5',
        border: '1px solid rgba(13, 13, 13, 0.08)',
        fontFamily: 'var(--font-plex-sans), system-ui, sans-serif'
      }}
    >
      {/* Masthead */}
      <header
        className="px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid rgba(13, 13, 13, 0.12)' }}
      >
        <div
          className="text-[10.5px] font-semibold uppercase tracking-[0.22em] mb-1"
          style={{ color: '#7a4a0a' }}
        >
          {dateline}
        </div>
        <h2
          className="text-2xl leading-tight"
          style={{
            color: '#0d0d0d',
            fontFamily:
              'var(--font-newsreader), Georgia, "Times New Roman", serif',
            fontWeight: 500,
            letterSpacing: '-0.015em'
          }}
        >
          Today's briefing
        </h2>
        <p
          className="text-[12.5px] mt-1.5"
          style={{ color: '#5a5a5a' }}
        >
          {state.trajectories.length} signal
          {state.trajectories.length === 1 ? '' : 's'} ·{' '}
          {state.windowDays}-day window
        </p>
      </header>

      {/* Trajectory cards */}
      <div className="px-6 py-2">
        {state.trajectories.map((t) => (
          <TrajectoryCard key={t.category} trajectory={t} />
        ))}
      </div>

      {/* Footnote */}
      <footer
        className="px-6 py-3 text-[10.5px] uppercase tracking-[0.18em]"
        style={{
          borderTop: '1px solid rgba(13, 13, 13, 0.08)',
          color: '#7a7a7a'
        }}
      >
        Cron-generated daily summaries · Full chronological log below
      </footer>
    </section>
  );
}
