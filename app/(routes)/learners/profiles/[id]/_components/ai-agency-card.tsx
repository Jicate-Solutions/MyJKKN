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
import type { AiAgencyFunnel } from '../_data/get-learner-360';

interface AiAgencyCardProps {
  funnel: AiAgencyFunnel;
}

function Stage({
  label,
  value,
  caption,
  unmeasured,
}: {
  label: string;
  value: number;
  caption: string;
  unmeasured: boolean;
}) {
  return (
    <div className="flex-1 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {unmeasured ? (
        <p className="mt-1 text-sm italic text-muted-foreground">No data yet</p>
      ) : (
        <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

export function AiAgencyCard({ funnel }: AiAgencyCardProps) {
  const { attended, starters, builds, hasLinkedProfile } = funnel;

  // Nothing to say at all — don't render an empty shell.
  if (!hasLinkedProfile && builds === 0) {
    return null;
  }
  if (hasLinkedProfile && attended === 0 && starters === 0 && builds === 0) {
    return null;
  }

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
            value={attended}
            caption="Live AI Pulse sessions joined"
            unmeasured={!hasLinkedProfile}
          />
          <Stage
            label="Starter actions"
            value={starters}
            caption="Picked up a domain starter"
            unmeasured={!hasLinkedProfile}
          />
          <Stage
            label="Prompts built"
            value={builds}
            caption="Assembled and submitted a prompt"
            unmeasured={false}
          />
        </div>

        {!hasLinkedProfile ? (
          <p className="text-xs italic text-muted-foreground">
            This learner has no linked platform login, so attendance and starter
            activity cannot be measured — these are unknown, not zero.
          </p>
        ) : attended > 0 && builds === 0 ? (
          <p className="text-xs text-muted-foreground">
            Attended but has not yet built a prompt — the gap between showing up and
            practising.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
