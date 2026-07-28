'use client';

import { useMemo, useState } from 'react';

// ============================================================================
// MY MEALS — resident menu + Choose Your Menu return-arc surface (P0c)
// ============================================================================
// Spec: specs/choose-your-menu-platform-spec-2026-06-11.md
// Pattern source: app/(routes)/campus-living/my-hostel/housekeeping/page.tsx
// (data-driven gating, no PermissionGuard — students are confined to
// /campus-living/my-hostel/* by CampusLivingResidentGuard in the module
// layout, so this route is reachable by residents and harmless for staff).
//
// Two-layer design, honoring "ships dark":
//   ALWAYS (even with mess.choose.master_enabled = false):
//     → this week's menu for MY tier × gender (fn_mess_menu_week, no
//       pickers). The page is genuinely useful while the engagement layer
//       is off, and nothing hints at unreleased features — no "coming
//       soon" leak. (CARE Clarity corrective: "what I get this week".)
//   ONLY when the super-admin flips mess.choose.master_enabled:
//     → the engagement layer lights up: my activity this week (choices +
//       votes), the live vote tally (feedback.live_counts), and my
//       recognition feed (feedback.recognition) — the return-arc the
//       input modes (P1 personalization/voting/special-day) plug into.
//
// Policy reads go through fn_get_policy* and fail DARK (master defaults
// false), so a broken read can never light the feature accidentally.
// ============================================================================

export const navMeta = {
  label: 'My Meals',
  icon: 'UtensilsCrossed',
  invokedFrom: '/campus-living/my-hostel',
} as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Hourglass,
  ListChecks,
  ThumbsDown,
  ThumbsUp,
  UtensilsCrossed,
} from 'lucide-react';
import {
  useChoosePolicies,
  useLiveVoteCounts,
  useMyMealsContext,
  useMyMenuWeek,
  useMyVotes,
  useMyWeekChoices,
} from '@/hooks/campus-living/use-choose-your-menu';
import { useMyRecognition } from '@/hooks/campus-living/use-recognition';
import { WeekMenuStrip } from './_components/week-menu-strip';
import { MealChoiceDialog } from './_components/meal-choice-dialog';
import { LiveCountsBoard } from './_components/live-counts-board';
import { RecognitionFeed } from './_components/recognition-feed';
import { RateDishesBoard } from './_components/rate-dishes-board';
import { UpcomingSpecialDays } from './_components/upcoming-special-days';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  tea: 'Tea / Snacks',
  dinner: 'Dinner',
};

/** Monday (ISO date) of the current week, formatted as a LOCAL date —
 *  toISOString() would shift IST midnight to the previous UTC day and
 *  mis-key the week (the mess-menu "not reflecting" bug). */
function mondayOfThisWeek(): string {
  const d = new Date();
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function MyMealsPage() {
  const weekStart = mondayOfThisWeek();

  const { data: context, isLoading: contextLoading } = useMyMealsContext();
  const { data: policies, isLoading: policiesLoading } = useChoosePolicies();

  const learnerId = context?.learnerId ?? null;
  const masterOn = !!policies?.masterEnabled;

  // Menu: always (when we know who the resident is, menu-wise).
  const { data: menu, isLoading: menuLoading } = useMyMenuWeek(
    weekStart,
    context?.tierKey ?? 'classic',
    context?.gender ?? null
  );

  // Engagement layer: only fetched when the master switch is on.
  const { data: myChoices, isLoading: choicesLoading } = useMyWeekChoices(
    learnerId,
    weekStart,
    masterOn
  );
  const { data: myVotes, isLoading: votesLoading } = useMyVotes(learnerId, masterOn);
  const { data: liveCounts, isLoading: liveLoading } = useLiveVoteCounts(
    masterOn && !!policies?.feedbackLiveCounts
  );
  const { data: recognition, isLoading: recognitionLoading } = useMyRecognition(
    learnerId,
    'mess',
    masterOn && !!policies?.feedbackRecognition
  );

  // Mode A gate: master ON + my plan is personalization-enabled. The RPCs
  // re-check everything server-side; this only controls whether the Choose
  // buttons render. Dark today on all three layers.
  const canChoose =
    masterOn && !!context?.tierKey && !!policies?.personalizationTiers?.includes(context.tierKey);

  // Mode B gate: master ON + my mess-plan tier is voting-enabled. The cast/clear
  // RPCs re-check server-side; this only controls whether the board renders.
  const canVote =
    masterOn && !!context?.tierKey && !!policies?.votingTiers?.includes(context.tierKey);

  const chosenByMeal = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of myChoices ?? []) m[`${c.day_of_week}-${c.meal_type}`] = c.dish;
    return m;
  }, [myChoices]);

  const [choiceDialog, setChoiceDialog] = useState<{
    open: boolean;
    day: number | null;
    meal: string | null;
    label: string;
  }>({ open: false, day: null, meal: null, label: '' });

  const breadcrumb = (
    <PageBreadcrumb
      items={[
        { label: 'Home', href: '/' },
        { label: 'My Hostel', href: '/campus-living/my-hostel' },
        { label: 'My Meals' },
      ]}
    />
  );

  if (contextLoading || policiesLoading) {
    return (
      <ContentLayout title="My Meals">
        {breadcrumb}
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  // No mess access — calm non-error state. Gate = allocation OR mess plan
  // (Director 2026-06-12: a day scholar who pays for mess sees My Meals too);
  // staff and residents whose allocation/plan is still pending land here.
  if (!context?.hasMessAccess || !context.gender) {
    return (
      <ContentLayout title="My Meals">
        {breadcrumb}
        <Card className="max-w-xl mx-auto mt-10">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Hourglass className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No mess plan yet</h2>
            <p className="text-sm text-muted-foreground">
              Your weekly menu appears here once you have a hostel allocation
              or a mess plan. If you&apos;ve just been allotted or enrolled,
              it can take a moment to reflect.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Meals">
      {breadcrumb}

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            My Meals
          </h1>
          <p className="text-muted-foreground">
            Your hostel menu for the week
            {masterOn ? ' — and where your meal input lands.' : '.'}
          </p>
        </div>

        {/* Layer 1 — always: this week's menu for my tier × gender */}
        <WeekMenuStrip
          menu={menu}
          isLoading={menuLoading}
          tierKey={context.tierKey}
          canChoose={canChoose}
          chosenByMeal={chosenByMeal}
          onChoose={(day, meal, label) =>
            setChoiceDialog({ open: true, day, meal, label })
          }
          profileId={context.profileId}
        />

        {canChoose && context.gender && (
          <MealChoiceDialog
            open={choiceDialog.open}
            onOpenChange={(v) => setChoiceDialog((d) => ({ ...d, open: v }))}
            weekStart={weekStart}
            dayOfWeek={choiceDialog.day}
            mealType={choiceDialog.meal}
            mealLabel={choiceDialog.label}
            gender={context.gender}
            currentChoiceDish={
              choiceDialog.day && choiceDialog.meal
                ? chosenByMeal[`${choiceDialog.day}-${choiceDialog.meal}`] ?? null
                : null
            }
          />
        )}

        {/* Layer 2 — engagement (only when the super-admin flips the master switch) */}
        {masterOn && (
          <>
            {/* My activity this week */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="h-4 w-4 text-primary" />
                  My activity this week
                </CardTitle>
                <CardDescription>
                  Your meal picks and dish votes — this is what feeds the tally
                  below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {choicesLoading || votesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium mb-1.5">Meal picks</p>
                      {!myChoices || myChoices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No meal swaps this week.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {myChoices.map((c) => (
                            <li
                              key={c.id}
                              className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm"
                            >
                              <span className="font-medium truncate">{c.dish}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {DAY_LABELS[c.day_of_week - 1] ?? `Day ${c.day_of_week}`} ·{' '}
                                {MEAL_LABELS[c.meal_type] ?? c.meal_type}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1.5">Dish votes</p>
                      {!myVotes || myVotes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          You haven&apos;t voted on any dishes yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {myVotes.map((v) => (
                            <Badge
                              key={v.id}
                              variant={v.vote === 1 ? 'secondary' : 'outline'}
                              className="gap-1"
                            >
                              {v.vote === 1 ? (
                                <ThumbsUp className="h-3 w-3" />
                              ) : (
                                <ThumbsDown className="h-3 w-3" />
                              )}
                              {v.dish}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Mode B input — rate dishes (only for voting-enabled tiers) */}
            {canVote && <RateDishesBoard />}

            {/* Mode C — upcoming approved special days */}
            <UpcomingSpecialDays enabled={masterOn} />

            {/* The return-arc: public tally + personal recognition */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {policies?.feedbackLiveCounts && (
                <LiveCountsBoard counts={liveCounts} isLoading={liveLoading} />
              )}
              {policies?.feedbackRecognition && (
                <RecognitionFeed events={recognition} isLoading={recognitionLoading} />
              )}
            </div>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
