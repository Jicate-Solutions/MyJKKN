'use client';

/**
 * DecideCard — the DECIDE step, the loop's OUTPUT and the most prominent card
 * on the page. It turns the READ into a concrete instruction for next week:
 *
 *  - formatInstruction : which format to make more of ("Make more Reels")
 *  - barToBeat         : the BIG number next week's best post has to clear
 *  - nextInstruction   : the single, plain-English next action
 *  - domainHypothesis  : a muted "why" — the audience/topic theory to test
 *
 * Distinct accent (primary, left-bordered) so it reads as the action, not data.
 */

import { Target, ArrowRight, Lightbulb } from 'lucide-react';
import type { LoopResponse } from '@/lib/types/social-loop';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type DecideBlock = NonNullable<LoopResponse['decide']>;

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function DecideCard({
  decide,
  barToBeat,
}: {
  decide: DecideBlock;
  /** The number to beat — top-level read.barToBeat, passed through. */
  barToBeat: number | null;
}) {
  return (
    <Card className="border-l-4 border-l-primary bg-primary/[0.03]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          The decision for next cycle
        </CardTitle>
        <CardDescription>
          The output of this loop — one format move, one bar to beat, one next
          action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Format instruction */}
        {decide.formatInstruction && (
          <div className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm font-medium leading-snug">
              {decide.formatInstruction}
            </p>
          </div>
        )}

        {/* Bar to beat — the hero number */}
        <div className="rounded-lg border border-primary/20 bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Bar to beat
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
            {fmt(barToBeat)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            real signal — next week’s best post has to clear this.
          </p>
        </div>

        {/* Next instruction */}
        {decide.nextInstruction && (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
            <p className="text-sm leading-snug">{decide.nextInstruction}</p>
          </div>
        )}

        {/* Domain hypothesis — muted "why" */}
        {decide.domainHypothesis && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{decide.domainHypothesis}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
