// ============================================
// LEARNER PROFILE — AI AGENCY CARD (SERVER COMPONENT)
// ============================================
// Created: 2026-07-30
// Purpose: Show the learner's AI Pulse funnel. The DROP-OFF is the story, so
//   the three stages are always shown together — platform-wide on 2026-07-30
//   this ran 1,583 attended → 540 starter actions → 8 prompts built. Showing
//   only "attended" would read as engagement; showing the funnel reads as what
//   it is: attendance-deep, not practice-deep.
//
// This card is presentational — it receives an already-fetched funnel so the
// profile page makes exactly one round-trip for the whole 360 section.
// ============================================

import { Bot } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { AiAgencyFunnel, FunnelStage } from '../_data/get-learner-360';

interface AiAgencyCardProps {
  funnel: AiAgencyFunnel;
}

/** True only when the stage is a proven zero — never for an unreadable one. */
function isProvenZero(stage: FunnelStage): boolean {
  return stage.status === 'counted' && stage.count === 0;
}

/**
 * Render one stage.
 *
 * A number is printed ONLY for a `counted` stage, i.e. one where the read was
 * proved to have been permitted. Every other state gets a worded blank, because
 * a digit here is read as a fact about the learner and there is no honest digit
 * for "we could not look".
 */
function Stage({
  label,
  stage,
  caption,
}: {
  label: string;
  stage: FunnelStage;
  caption: string;
}) {
  return (
    <div className="flex-1 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {stage.status === 'counted' ? (
        <p className="mt-1 text-3xl font-bold tabular-nums">{stage.count}</p>
      ) : stage.status === 'denied' ? (
        <p className="mt-1 text-sm italic text-muted-foreground">
          Not visible to your role
        </p>
      ) : stage.status === 'unlinked' ? (
        <p className="mt-1 text-sm italic text-muted-foreground">Not measurable</p>
      ) : (
        // `unconfirmed`. Deliberately NOT "No data yet": an empty source and a
        // refused one are byte-identical over PostgREST, so claiming the source
        // is empty would just swap one false statement for a quieter one.
        <p className="mt-1 text-sm italic text-muted-foreground">Not visible</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

export function AiAgencyCard({ funnel }: AiAgencyCardProps) {
  const { attended, starters, builds, hasLinkedProfile } = funnel;
  const stages = [attended, starters, builds];

  // Nothing to say at all — don't render an empty shell. Both guards now demand
  // PROVEN zeroes: an unreadable stage must never be mistaken for "did nothing"
  // and silently collapse the whole card.
  if (!hasLinkedProfile && isProvenZero(builds)) {
    return null;
  }
  if (hasLinkedProfile && stages.every(isProvenZero)) {
    return null;
  }

  // Any stage we were not permitted to read (or could not confirm) means the
  // funnel on screen is partial, and the reader has to be told that.
  const anyUnreadable = stages.some(
    (s) => s.status === 'denied' || s.status === 'unconfirmed',
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI agency
        </CardTitle>
        <CardDescription>
          Turning up is not the same as building. Each step below is a deeper act of
          authorship than the one before it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Stage
            label="Sessions attended"
            stage={attended}
            caption="Live AI Pulse sessions joined"
          />
          <Stage
            label="Starter actions"
            stage={starters}
            caption="Picked up a domain starter"
          />
          <Stage
            label="Prompts built"
            stage={builds}
            caption="Assembled and submitted a prompt"
          />
        </div>

        {!hasLinkedProfile ? (
          <p className="text-xs italic text-muted-foreground">
            This learner has no linked platform login, so attendance and starter
            activity cannot be measured — these are unknown, not zero.
          </p>
        ) : anyUnreadable ? (
          <p className="text-xs italic text-muted-foreground">
            A blank above is not a zero — either nothing has been recorded yet, or
            your role may not read it. It is shown as unknown rather than counted
            as nothing.
          </p>
        ) : attended.status === 'counted' &&
          attended.count > 0 &&
          isProvenZero(builds) ? (
          <p className="text-xs text-muted-foreground">
            Attended but has not yet built a prompt — the gap between showing up and
            practising.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
