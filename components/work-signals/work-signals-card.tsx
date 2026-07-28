'use client';

// =====================================================================
// Work-signals spine — shared display (Phase 1)
// =====================================================================
// ONE component every surface renders: My Pulse, the dashboard, (later) the
// profile / accreditation / leadership views. Self-fetches the caller's own
// canonical signals from fn_work_signals_for via WorkSignalsService, so it
// drops in anywhere with no prop threading and every screen shows the SAME
// numbers.
//
// Decisions honoured (locked 2026-07-17):
//  • per-screen window — pass `from`/`to`; omit for the engine default (30d).
//  • gentle empty state — a genuine zero reads "nothing yet", never a verdict.
//  • track both — dual-attribution signals show ASSIGNED big + "you: N" under.
//  • never ranks — presence/activity only; no comparison to peers here.
// Phase 1.1 (2026-07-18): every ZERO signal (and the whole-card empty state)
// deep-links to where that work begins — a "start here" nudge. Director chose
// "ALL zeros link somewhere". The route rides in each signal's action_route
// (seeded on work_signal_types), so no second fetch.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Activity, AlertCircle, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkSignalsService } from '@/lib/services/work-signals-service';
import { WeeklySuggestionCard } from '@/components/work-signals/weekly-suggestion-card';
import type { WorkSignal, WorkSignalsResult } from '@/types/work-signals';

type State = { loading: boolean; data: WorkSignalsResult | null };

function SignalChip({ signal }: { signal: WorkSignal }) {
  const isZero = signal.value === 0;
  const showPersonal =
    signal.attribution === 'dual' && signal.value_personal !== null;
  // A zero signal with a known starting page becomes a "start here" link.
  const canLink = isZero && !!signal.action_route;

  const inner = (
    <>
      {canLink ? (
        <div className="flex items-center gap-1 text-sm font-medium leading-tight text-sky-700 dark:text-sky-400">
          <span>{signal.action_label || 'Start here'}</span>
          <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
        </div>
      ) : (
        <div
          className={`text-lg font-semibold tabular-nums leading-tight ${
            isZero ? 'text-muted-foreground' : ''
          }`}
        >
          {signal.value}
        </div>
      )}
      {/* Keep the personal number visible even when linking, so a delegating /
          proxy marker's own effort is never hidden behind a bare CTA. */}
      {showPersonal && (
        <div className="text-[11px] tabular-nums text-muted-foreground/80">
          you: {signal.value_personal}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground">{signal.label}</div>
    </>
  );

  if (canLink) {
    return (
      <Link
        href={signal.action_route!}
        aria-label={`${signal.action_label || 'Start here'} — ${signal.label}`}
        className="block rounded-md border border-dashed border-sky-300/60 bg-sky-50/40 px-3 py-2 transition-colors hover:border-sky-400 hover:bg-sky-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-sky-800/60 dark:bg-sky-950/20 dark:hover:bg-sky-950/40"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      {inner}
    </div>
  );
}

export function WorkSignalsCard({
  from,
  to,
  title = 'My Pulse — your work, evidenced',
  description = 'Your own work-signals — the same signals leadership sees, for you only. No scores, no comparisons: presence proven by work.',
  className = 'mb-6',
}: {
  from?: string;
  to?: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  const [state, setState] = useState<State>({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    WorkSignalsService.getWorkSignals(from, to).then((data) => {
      if (!cancelled) setState({ loading: false, data });
    });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  // Error/null → render nothing (decorative surface, never an error card).
  if (!state.loading && state.data === null) return null;

  const d = state.data;
  const allZero =
    !!d && d.signals.length > 0 && d.signals.every((s) => s.value === 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-sky-600" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {state.loading || !d ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] animate-pulse rounded-md border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : !d.subject_matched ? (
          // Explicit "can't match this account" — never a silent all-zero.
          <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 px-3 py-2.5 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <span className="text-muted-foreground">
              We couldn&apos;t match your account to the timetable records, so
              signals may be missing. Ask an administrator to check your profile
              email.
            </span>
          </div>
        ) : d.signals.length === 0 ? (
          // No signals at all — gentle line (rare: registry empty).
          <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
            Nothing yet — your work signals appear here as you teach, mark
            sessions, and run pulses.
          </p>
        ) : (
          <>
            {allZero && (
              // Gentle empty state — every card below is a "start here" link.
              <p className="mb-3 text-sm text-muted-foreground">
                Nothing yet — here&apos;s where each kind of work begins. Tap a
                card to start.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.signals.map((s) => (
                <SignalChip key={s.key} signal={s} />
              ))}
              {/* Last-signal chip only when there is activity to date. */}
              {!allZero && (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="text-lg font-semibold leading-tight">
                    {d.last_signal_at
                      ? format(new Date(d.last_signal_at), 'd MMM')
                      : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Last signal</div>
                </div>
              )}
            </div>
            {!allZero && (
              <p className="mt-3 text-xs text-muted-foreground">
                &ldquo;Marked&rdquo; shows your assigned sessions that got marked; the
                small &ldquo;you&rdquo; number is sessions you marked personally.
                Course marks are entered by the exam cell.
              </p>
            )}
          </>
        )}
        {/* Weekly AI suggestion + verdict — renders only when one exists. */}
        <WeeklySuggestionCard />
      </CardContent>
    </Card>
  );
}
