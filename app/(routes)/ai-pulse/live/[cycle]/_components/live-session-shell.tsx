'use client';

/**
 * AI Pulse — Live Session Shell (client orchestrator)
 *
 * Owns the per-cycle live UX:
 *   - Loads session state via useLiveSession()
 *   - Composes Join button, Polls panel, Quiz panel, Engagement progress
 *   - Mounts the heartbeat once the learner has joined
 *
 * Pure presentation lives in the leaf components; this file is just wiring.
 * The page wrapper (page.tsx) handles permission gating and passes the
 * cycle id down.
 */

import {
  Loader2,
  AlertCircle,
  Languages,
  Calendar,
  Radio,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermissions } from '@/hooks/use-permissions';
import {
  evaluateGates,
  useLiveSession,
} from '@/lib/services/ai-pulse/live-session-service';
import { JoinButton } from './join-button';
import { PollsPanel } from './polls-panel';
import { ChampionPollsControl } from './champion-polls-control';
import { QuizPanel } from './quiz-panel';
import { EngagementProgress } from './engagement-progress';
import { StayHeartbeat } from './stay-heartbeat';

interface LiveSessionShellProps {
  cycleId: string;
}

function formatIst(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LiveSessionShell({ cycleId }: LiveSessionShellProps) {
  const { data, isLoading, error } = useLiveSession(cycleId);
  // Champion + Co-Champion hold the ai_pulse_champion role — gate the "Issue
  // poll" control on the SAME identity the RLS write policy enforces
  // (is_super_admin() OR is_admin() OR the champion role). NOTE: usePermissions
  // short-circuits super admins to userRoles: [], so a super-admin champion is
  // NOT in userRoles — the isSuperAdmin flag is load-bearing here, otherwise the
  // control is invisible to every super-admin host (the reason polls never fired).
  const { userRoles, isSuperAdmin } = usePermissions();
  const isChampion =
    isSuperAdmin || userRoles.some((r) => r.role_key === 'ai_pulse_champion');

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading live session…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Could not load this AI Pulse cycle.</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error
                ? error.message
                : 'The cycle may not exist, or you may not have access.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const {
    cycle,
    attendance,
    polls,
    quiz_open,
    quiz_async_window_open,
    async_makeup_window_hours,
  } = data;
  // polls = ALL polls issued this cycle (gate requirement is min(3, issued)).
  // The panel shows every poll — accepting ones are answerable, closed ones
  // render as "Closed" so a learner can see one existed (and was missed).
  const gates = evaluateGates(
    attendance.engagement_signals,
    cycle.ends_at,
    polls.length,
  );
  const alreadyJoined = !!attendance.joined_at;
  const heartbeatEnabled =
    alreadyJoined && (cycle.status === 'live' || cycle.status === 'execution');

  const quizSubmitted =
    typeof attendance.engagement_signals.quiz_score === 'number';

  return (
    <div className="space-y-6">
      {/* Header card — cycle metadata + Join button */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl flex items-center gap-2">
            <Radio
              className={
                cycle.status === 'live' || cycle.status === 'execution'
                  ? 'h-5 w-5 text-red-500 animate-pulse'
                  : 'h-5 w-5 text-muted-foreground'
              }
              aria-hidden
            />
            {cycle.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden />
              {formatIst(cycle.starts_at)} → {formatIst(cycle.ends_at)} IST
            </span>
            <span className="flex items-center gap-1.5">
              <Languages className="h-4 w-4" aria-hidden />
              {cycle.primary_language.toUpperCase()}
              {cycle.secondary_language
                ? ` + ${cycle.secondary_language.toUpperCase()}`
                : ''}
            </span>
            <span className="text-xs uppercase tracking-wide">
              Status: <strong>{cycle.status}</strong>
            </span>
          </div>

          {/* Champion's featured AI tool for this week — surfaced to learners
              (previously admin/NAAC-only). */}
          {data.featured_tool ? (
            <div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden />
              <span>
                This week&apos;s featured tool:{' '}
                <strong>{data.featured_tool.label_en}</strong>
                {data.featured_tool.vendor_name
                  ? ` — ${data.featured_tool.vendor_name}`
                  : ''}
              </span>
            </div>
          ) : null}

          <div className="pt-2">
            <JoinButton
              cycleId={cycle.id}
              meetUrl={cycle.meet_url}
              alreadyJoined={alreadyJoined}
              joinOpen={data.join_open}
              joinOpensAt={data.join_opens_at}
            />
          </div>
        </CardContent>
      </Card>

      {/* Engagement gate visualisation */}
      <EngagementProgress gates={gates} asyncWindowHours={async_makeup_window_hours} />

      {/* Champion-only — issue / close live polls for this cycle */}
      {isChampion && (
        <ChampionPollsControl cycleId={cycle.id} endsAt={cycle.ends_at} />
      )}

      {/* Polls + Quiz side-by-side on wide screens, stacked on mobile */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PollsPanel
          cycleId={cycle.id}
          polls={polls}
          endsAt={cycle.ends_at}
          pollsRespondedCount={
            attendance.engagement_signals.polls_responded ?? 0
          }
        />
        <QuizPanel
          cycleId={cycle.id}
          quizOpen={quiz_open}
          asyncWindowOpen={quiz_async_window_open}
          asyncWindowHours={async_makeup_window_hours}
          alreadySubmitted={quizSubmitted}
          existingScore={attendance.engagement_signals.quiz_score}
        />
      </div>

      {/* Invisible heartbeat — only ticks while joined + session is live */}
      <StayHeartbeat cycleId={cycle.id} enabled={heartbeatEnabled} />
    </div>
  );
}
