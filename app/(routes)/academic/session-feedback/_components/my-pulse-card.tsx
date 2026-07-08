'use client';

// =====================================================================
// My Pulse — your work, evidenced (the facilitator's OWN 8 signals)
// =====================================================================
// The leadership Facilitator Pulse board deliberately raises for
// non-leadership callers — "a facilitator sees their own signals on their
// own pages" — but until this card no single own-pulse surface existed.
// This card shows the CALLER's own work-signals for the last 30 days via
// fn_scf_my_pulse (self-scoped by the caller's email; always one row,
// zeros when no signal yet).
//
// Doctrine (same as the board, #1893): presence signals only. No
// understanding scores, no comparisons to others, no ranks — anti-gaming.
// The 8th signal for SELF ("marks in") is exam-cell data and is NOT in
// fn_scf_my_pulse — a muted footer says where that column lives instead.
//
// Decorative surface: loading shell while fetching; renders NOTHING on
// error/null (the service returns null on any failure).
// Created: 2026-07-08.

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type { MyPulseRow } from '@/types/session-feedback';

type MyPulseState = { loading: boolean; row: MyPulseRow | null };

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function MyPulseCard() {
  const [state, setState] = useState<MyPulseState>({ loading: true, row: null });

  useEffect(() => {
    let cancelled = false;
    SessionFeedbackService.getMyPulse().then((row) => {
      if (!cancelled) setState({ loading: false, row });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Error/null → render nothing (decorative surface, never an error card).
  if (!state.loading && state.row === null) return null;

  const r = state.row;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-sky-600" aria-hidden />
          My Pulse — your work, evidenced
        </CardTitle>
        <CardDescription>
          Your own work-signals from the last 30 days — the same signals
          leadership sees, for you only. No scores, no comparisons: presence
          proven by work.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.loading || !r ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[52px] animate-pulse rounded-md border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatChip label="Marked" value={r.sessions_marked} />
              <StatChip label="Witnessed by learners" value={r.sessions_witnessed} />
              <StatChip label="Live pulses" value={r.pulses_run} />
              <StatChip label="Lessons linked" value={r.lessons_linked} />
              <StatChip label="Notes received" value={r.notes_received} />
              <StatChip label="Verdicts given" value={r.verdicts_given} />
              <StatChip label="Student votes" value={r.votes_received} />
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="text-lg font-semibold leading-tight">
                  {r.last_signal_at
                    ? format(new Date(r.last_signal_at), 'd MMM')
                    : '—'}
                </div>
                <div className="text-[11px] text-muted-foreground">Last signal</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Marks for your courses are entered by the exam cell — see the marks
              column meaning on the admin board.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
