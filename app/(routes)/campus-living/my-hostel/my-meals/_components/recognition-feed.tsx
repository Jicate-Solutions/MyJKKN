'use client';

// ============================================================================
// My Meals — recognition feed (P0c, rewired to the CARE keystone stream)
// ----------------------------------------------------------------------------
// The personal half of the return-arc: the signed-in resident's own rows from
// the cross-module `campus_living_recognition` stream, scoped to module
// 'mess' ("a dish you backed landed on the menu"). Titles are display-ready
// from the stream (the firing module writes them); icons stay keyed by
// event_type. Renders only when mess.choose.feedback.recognition is on; the
// page handles that gate.
// ============================================================================

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, CalendarCheck, PartyPopper, UtensilsCrossed } from 'lucide-react';
import type { MyRecognitionRow } from '@/lib/services/campus-living/recognition-service';

const EVENT_ICON: Record<string, typeof Award> = {
  vote_landed: PartyPopper,
  proposal_approved: CalendarCheck,
  choice_served: UtensilsCrossed,
};

export function RecognitionFeed({
  events,
  isLoading,
}: {
  events: MyRecognitionRow[] | undefined;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4 text-primary" />
          Your wins
        </CardTitle>
        <CardDescription>
          When something you backed reaches the menu, it shows up here — with
          your name on it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nothing yet — vote for dishes or pick your meals, and when your
            input lands on the menu you&apos;ll see it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const Icon = EVENT_ICON[e.event_type] ?? Award;
              return (
                <li key={e.id} className="flex items-start gap-3 rounded-md border px-3 py-2.5">
                  <div className="rounded-lg bg-primary/10 p-1.5 text-primary mt-0.5">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.detail ?? ''}
                      {e.detail ? ' · ' : ''}
                      {new Date(e.fired_at).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
