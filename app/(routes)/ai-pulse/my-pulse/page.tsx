// app/(routes)/ai-pulse/my-pulse/page.tsx
// Created: 2026-05-06 — Wave B.1 Learner My Pulse
// Relocated: 2026-05-07 (PR #729 Wave 2C nav-fix) — moved from /ai-pulse
// to /ai-pulse/my-pulse so the AI Pulse landing page (PR #749) remains
// authoritative and this learner-only view becomes a sub-route.
//
// DRAFT — gated on PR #644 (substrate: ai_pulse event_type + config.kind discriminator
// + engagement_signals JSONB) and PR #716 (aiPulse:* permission keys).
//
// Surface: /ai-pulse/my-pulse — learner sees their current cycle, team, attendance, streak,
// and quick actions for Domain-Sync / Quiz / Publication submissions.
//
// Permission gate: aiPulse:view.self (server-side via user_has_permission RPC).
// Falls through to /unauthorized when key not granted.

import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import {
  createClient,
  createServerSupabaseClient,
  getEnhancedUserProfile,
} from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { AiPulseLearnerService } from '@/lib/services/ai-pulse/learner-service';
import { CurrentCycleCard } from '../_components/current-cycle-card';
import { GoldThisWeekCard } from '../_components/gold-this-week-card';
import { MyTeamCard } from '../_components/my-team-card';
import { MyAttendanceCard } from '../_components/my-attendance-card';
import { QuickActionsCard } from '../_components/quick-actions-card';
import { PulseImpactCard } from './_components/pulse-impact-card';
import { PdeProgressCard } from './_components/pde-progress-card';
import { DomainStarterCard } from './_components/domain-starter-card';
import { PromptBuilderCard } from './_components/prompt-builder-card';
import { SharedLibraryCard } from './_components/shared-library-card';
import { ClassmatesPromptsCard } from './_components/classmates-prompts-card';
import { NoPromptWeekCard } from './_components/no-prompt-week-card';
import { WeekSwitcher, type SwitcherCycle } from './_components/week-switcher';

// "Week of Jul 23" style label for the cycle switcher; falls back to the cycle
// name when start_date is missing/unparseable.
function cycleSwitcherLabel(c: { name: string; start_date: string | null }): string {
  if (c.start_date) {
    const d = new Date(c.start_date);
    if (!Number.isNaN(d.getTime())) {
      return `Week of ${d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })}`;
    }
  }
  return c.name || 'Cycle';
}

// In-module tab label (AutoTabNav / route manifest): show "My AI Pulse" instead of
// the folder-derived "My Pulse", matching the page heading, sidebar link, and
// breadcrumb. The URL stays /ai-pulse/my-pulse.
export const navMeta = { label: 'My AI Pulse' };

export const dynamic = 'force-dynamic';

async function checkPermission(key: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('user_has_permission', {
      permission_name: key,
    });
    if (error) {
      console.error(`[ai-pulse/page] user_has_permission(${key}) failed:`, error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(`[ai-pulse/page] permission check threw for ${key}:`, e);
    return false;
  }
}

export default async function AiPulseLearnerPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { profile } = await getEnhancedUserProfile();

  if (!profile) {
    redirect('/auth/login?next=/ai-pulse');
  }

  // Permission gate — super_admin always passes; others require key.
  if (profile.is_super_admin !== true) {
    const canView = await checkPermission('aiPulse:view.self');
    if (!canView) {
      redirect('/unauthorized?module=ai-pulse');
    }
  }

  // Resolve action permissions in parallel (super_admin shortcut).
  const [canDomainSync, canQuiz, canPublication] = profile.is_super_admin
    ? [true, true, true]
    : await Promise.all([
        checkPermission('aiPulse:submit.domain_sync'),
        checkPermission('aiPulse:submit.quiz'),
        checkPermission('aiPulse:submit.publication'),
      ]);

  // Resolve the cycle to show. Default = current week; the week switcher can
  // deep-link any past cycle via ?cycle=<id>. cycles[] backs the switcher.
  const sp = await searchParams;
  const requestedCycleId =
    typeof sp?.cycle === 'string' && sp.cycle.length > 0 ? sp.cycle : null;

  const [cycles, currentCycle] = await Promise.all([
    AiPulseLearnerService.listCyclesServer(),
    AiPulseLearnerService.getCurrentCycleServer(),
  ]);

  // A hand-typed / stale ?cycle= id that isn't an ai_pulse cycle falls back to
  // the current cycle rather than showing an empty page.
  const cycle = requestedCycleId
    ? (await AiPulseLearnerService.getCycleByIdServer(requestedCycleId)) ??
      currentCycle
    : currentCycle;

  const isCurrentCycle =
    !!cycle && !!currentCycle && cycle.id === currentCycle.id;

  // The switcher now returns every week the learner ATTENDED, including weeks
  // with no starter for their programme (has_prompt=false) — those used to be
  // dropped, which made real sessions invisible. Render an honest empty state
  // for them instead. Strict `=== false`: a deep-linked cycle that isn't in the
  // switcher list has no has_prompt, and "not known" must not print "no prompt".
  const selectedHasNoPrompt =
    !!cycle &&
    cycles.find((c) => c.id === cycle.id)?.has_prompt === false;

  // Ensure the selected cycle is present in the switcher list even if it fell
  // outside the recent-N window (deep-linked older cycle).
  const switcherCycles: SwitcherCycle[] = (
    cycle && !cycles.some((c) => c.id === cycle.id) ? [cycle, ...cycles] : cycles
  ).map((c) => ({ id: c.id, label: cycleSwitcherLabel(c) }));

  let team = null;
  let attendance = {
    state: 'pending' as const,
    day_type: null,
    marked_at: null,
    signals: null,
  };
  let streak = 0;

  if (cycle) {
    const supabase = await createServerSupabaseClient();
    team = await AiPulseLearnerService.getMyTeam(cycle.id, profile.id, supabase);
    // Attendance is keyed on profile_id in ai_pulse_live_attendance — it does
    // NOT depend on a team assignment. Fetch it regardless so learners who
    // attended (or whose team isn't assigned yet) see their real status instead
    // of a permanent "pending".
    attendance = await AiPulseLearnerService.getMyAttendance(
      cycle.id,
      profile.id,
      supabase
    );
    streak = await AiPulseLearnerService.getMyStreak(profile.id, supabase);
  }

  // CARE R-move: latest faculty-picked Gold (null until the first Monday Lab
  // scores a cycle — the card hides itself).
  const gold = await AiPulseLearnerService.getLatestGoldServer();

  return (
    <ContentLayout title="My AI Pulse">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'AI Pulse', href: '/ai-pulse' },
          { label: 'My AI Pulse' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">My AI Pulse</h1>
            <p className="text-sm text-muted-foreground">
              Your weekly AI Pulse cycle, team, attendance, and submissions.
            </p>
          </div>
          <Link
            href="/ai-pulse/guide"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            How this works
          </Link>
        </div>

        {/* Week switcher — browse any past cycle read-only. The whole page
            re-scopes to the selected cycle via ?cycle=<id>. */}
        {switcherCycles.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <WeekSwitcher cycles={switcherCycles} selectedId={cycle?.id ?? null} />
            {!isCurrentCycle && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                Viewing a past week — read-only
              </span>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <CurrentCycleCard cycle={cycle} />
          <MyTeamCard team={team} />
          {/* Domain Starter — the SELECTED cycle's copy-paste AI prompt pack
              for the learner's subject/programme. Scoped by cycleId so the week
              switcher shows each week's own prompt. Renders nothing while the
              generation loop is dark (kill switch off) or no starter exists. */}
          <div className="md:col-span-2">
            {selectedHasNoPrompt ? (
              <NoPromptWeekCard />
            ) : (
              <DomainStarterCard cycleId={cycle?.id} />
            )}
          </div>
          {/* Build-a-prompt — learn prompt engineering by assembling a prompt
              from four parts, then get an AI grade. Renders nothing while dark
              (prompt_build_enabled off). */}
          <div className="md:col-span-2">
            <PromptBuilderCard cycleId={cycle?.id} />
          </div>
          {/* Prompt library — the best GRADUATED peer prompts on the learner's
              topics, each with a learner "Report" control (champion disqualifies).
              Renders nothing until prompt graduation is switched on (both feeds
              dark today → empty → byte-identical to now). */}
          <div className="md:col-span-2">
            <SharedLibraryCard cycleId={cycle?.id} />
          </div>
          {/* Classmates' prompts — decent (score 60–79) NON-star peer prompts on
              the learner's topics, matched by subject name across all colleges.
              Copying one pings the distinct-copier counter (v2 popularity path).
              Renders nothing until such prompts exist → byte-identical to now. */}
          <div className="md:col-span-2">
            <ClassmatesPromptsCard cycleId={cycle?.id} />
          </div>
          {/* Gold Standard — "this week" recognition; only on the current cycle. */}
          {isCurrentCycle && gold && (
            <div className="md:col-span-2">
              <GoldThisWeekCard gold={gold} />
            </div>
          )}
          <MyAttendanceCard attendance={attendance} streak={streak} />
          {/* Quick Actions = submissions against the live cycle. Hidden when
              viewing a past week (read-only — you can't submit to a closed cycle). */}
          {isCurrentCycle && (
            <QuickActionsCard
              cycleId={cycle?.id ?? null}
              hasTeam={!!team}
              canSubmitDomainSync={canDomainSync}
              canSubmitQuiz={canQuiz}
              canSubmitPublication={canPublication}
            />
          )}
          {/* Pulse Impact — SOP Phase V read path (2026-06-11) */}
          <div className="md:col-span-2">
            <PulseImpactCard cycleId={cycle?.id ?? null} />
          </div>
          {/* PDE Progress — AI Pulse → PDE bridge read path (2026-06-11) */}
          <div className="md:col-span-2">
            <PdeProgressCard />
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
