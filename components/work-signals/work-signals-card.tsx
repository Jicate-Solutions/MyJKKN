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

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WorkSignalsService } from '@/lib/services/work-signals-service';
import type { WorkSignal, WorkSignalsResult } from '@/types/work-signals';

type State = { loading: boolean; data: WorkSignalsResult | null };

function SignalChip({ signal }: { signal: WorkSignal }) {
  const isZero = signal.value === 0;
  const showPersonal =
    signal.attribution === 'dual' && signal.value_personal !== null;
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div
        className={`text-lg font-semibold tabular-nums leading-tight ${
          isZero ? 'text-muted-foreground' : ''
        }`}
      >
        {signal.value}
      </div>
      {showPersonal && (
        <div className="text-[11px] tabular-nums text-muted-foreground/80">
          you: {signal.value_personal}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground">{signal.label}</div>
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
        ) : allZero ? (
          // Gentle empty state — a starting point, not a verdict.
          <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
            Nothing yet — your work signals appear here as you teach, mark
            classes, and run pulses.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.signals.map((s) => (
                <SignalChip key={s.key} signal={s} />
              ))}
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="text-lg font-semibold leading-tight">
                  {d.last_signal_at
                    ? format(new Date(d.last_signal_at), 'd MMM')
                    : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">Last signal</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              &ldquo;Marked&rdquo; shows your assigned classes that got marked; the
              small &ldquo;you&rdquo; number is sessions you marked personally.
              Course marks are entered by the exam cell.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
