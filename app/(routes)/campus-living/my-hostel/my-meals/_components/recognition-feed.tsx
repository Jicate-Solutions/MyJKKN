'use client';

// ============================================================================
// My Meals — recognition feed (P0c)
// ----------------------------------------------------------------------------
// The personal half of the return-arc: rows from mess_choose_recognition for
// the signed-in resident ("a dish you backed landed on the menu"). This is
// the CARE Recognition surface — input is publicly attributable back to the
// resident who gave it. Renders only when mess.choose.feedback.recognition
// is on; the page handles that gate.
// ============================================================================

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, CalendarCheck, PartyPopper, UtensilsCrossed } from 'lucide-react';
import type { MyRecognitionEvent } from '@/lib/services/campus-living/choose-your-menu-service';

const EVENT_COPY: Record<
  MyRecognitionEvent['event_type'],
  { label: string; icon: typeof Award }
> = {
  vote_landed: { label: 'A dish you voted for made the menu', icon: PartyPopper },
  proposal_approved: { label: 'Your special-day proposal was approved', icon: CalendarCheck },
  choice_served: { label: 'Your meal pick was served', icon: UtensilsCrossed },
};

export function RecognitionFeed({
  events,
  isLoading,
}: {
  events: MyRecognitionEvent[] | undefined;
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
              const copy = EVENT_COPY[e.event_type] ?? {
                label: 'Recognised',
                icon: Award,
              };
              const Icon = copy.icon;
              return (
                <li key={e.id} className="flex items-start gap-3 rounded-md border px-3 py-2.5">
                  <div className="rounded-lg bg-primary/10 p-1.5 text-primary mt-0.5">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{copy.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.dish_name ?? 'Dish'}
                      {e.menu_week ? ` · week of ${e.menu_week}` : ''}
                      {' · '}
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
