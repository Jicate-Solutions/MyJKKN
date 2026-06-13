// app/(routes)/ai-pulse/_components/current-cycle-card.tsx
// Created: 2026-05-06 — Wave B.1
// Updated: 2026-06-12 — route learners through the live session page (the only
// surface that records 4-AND engagement); cycle #1 captured zero rows because
// the only join affordance here was a direct Meet anchor gated on meet_url.

import Link from 'next/link';
import { CalendarDays, Radio, Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  AiPulseCycle,
  AiPulseCycleConfig,
} from '@/lib/services/ai-pulse/learner-service';
import {
  deriveCycleTimes,
  deriveEffectiveStatus,
} from '@/lib/services/ai-pulse/live-session-service';

interface CurrentCycleCardProps {
  cycle: AiPulseCycle | null;
}

function formatThursday(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function CurrentCycleCard({ cycle }: CurrentCycleCardProps) {
  if (!cycle) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">This Week's AI Pulse</CardTitle>
          </div>
          <CardDescription>
            No active AI Pulse cycle this week. Check back Thursday at 6:55 PM IST.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // The DB stores the cycle config nested under config.ai_pulse (the flat
  // shape predates the nested write path) — accept both so meet/recording
  // URLs and languages actually surface.
  const rawConfig = (cycle.config ?? {}) as AiPulseCycleConfig;
  const cfg = ((rawConfig.ai_pulse as AiPulseCycleConfig | undefined) ??
    rawConfig) as AiPulseCycleConfig;
  const recordingUrl = cfg.recording_url ?? null;

  // Status is clock-derived (nothing transitions cycles out of 'draft').
  const { starts_at, ends_at } = deriveCycleTimes({
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    config: cycle.config,
  });
  const status = deriveEffectiveStatus(
    cycle.status ?? 'draft',
    starts_at,
    ends_at,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">
                {cycle.name || 'AI Pulse Live Session'}
              </CardTitle>
            </div>
            <CardDescription className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatThursday(cycle.start_date)}
            </CardDescription>
          </div>
          <Badge variant={status === 'live' ? 'default' : 'secondary'}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cfg.primary_language && (
          <p className="text-sm text-muted-foreground">
            Languages: {cfg.primary_language?.toUpperCase()}
            {cfg.secondary_language
              ? ` + ${cfg.secondary_language.toUpperCase()}`
              : ''}
          </p>
        )}
        {/* CARE C-move: the week's stated brief — what teams build toward. */}
        {cfg.challenge_text ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              This week&apos;s challenge
            </p>
            <p className="text-sm">{cfg.challenge_text as string}</p>
          </div>
        ) : null}
        {/* CARE E-move: visible proof that learner feedback changes things. */}
        {cfg.you_said_we_changed ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              You said, we changed:
            </span>{' '}
            {cfg.you_said_we_changed as string}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {/* Always route through the live session page — it records the
              join (engagement credit) and opens the meeting link itself. A
              direct meeting anchor here would bypass attendance capture. */}
          <Button asChild size="sm">
            <Link href={`/ai-pulse/live/${cycle.id}`}>
              <Radio className="h-4 w-4 mr-2" />
              Open Live Session
            </Link>
          </Button>
          {recordingUrl && (
            <Button asChild size="sm" variant="outline">
              <a href={recordingUrl} target="_blank" rel="noreferrer">
                Watch Recording
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
