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
import {
  AiPulseLearnerService,
  type AiPulseAttendance,
  type AiPulseTeamSummary,
} from '@/lib/services/ai-pulse/learner-service';
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

/**
 * "You may not" and "we could not find out" are different answers, and only the
 * first one may redirect. A `user_has_permission` RPC that fails in transport
 * used to return false, which sent a perfectly entitled learner to
 * /unauthorized — a silent redirect they cannot diagnose.
 */
interface PermissionCheck {
  allowed: boolean;
  failed: boolean;
}

const PERMISSION_GRANTED: PermissionCheck = { allowed: true, failed: false };

async function checkPermission(key: string): Promise<PermissionCheck> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('user_has_permission', {
      permission_name: key,
    });
    if (error) {
      console.error(`[ai-pulse/page] user_has_permission(${key}) failed:`, error);
      return { allowed: false, failed: true };
    }
    return { allowed: data === true, failed: false };
  } catch (e) {
    console.error(`[ai-pulse/page] permission check threw for ${key}:`, e);
    return { allowed: false, failed: true };
  }
}

/**
 * getEnhancedUserProfile returns `{ profile: null, error }` both when nobody is
 * signed in and when the profile read itself failed. Only the first belongs at
 * the login page; bouncing a signed-in learner to login because a query timed
 * out is the same dead end by another route.
 */
function isMissingSession(error: Error | null): boolean {
  if (!error) return true; // no profile and no reason given — treat as no session
  return /no authenticated user|auth session missing|not authenticated|jwt|refresh token/i.test(
    error.message ?? ''
  );
}

/** Reads opted into surfacing their failures instead of degrading silently. */
const SURFACE_ERRORS = { throwOnError: true } as const;

/** The inline "we couldn't load this" strip, shared by both places using it. */
function RetryNotice({
  message,
  retryHref,
}: {
  message: string;
  retryHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <span>{message}</span>
      <a
        href={retryHref}
        className="shrink-0 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
      >
        Try again
      </a>
    </div>
  );
}

/**
 * The page when we could not establish what to show at all. Deliberately NOT a
 * redirect and NOT an empty-looking page: it names what failed and offers the
 * way forward.
 */
function UnavailablePage({
  what,
  retryHref,
}: {
  what: string;
  retryHref: string;
}) {
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
        <h1 className="text-2xl font-bold py-1">My AI Pulse</h1>
        <RetryNotice
          message={`We couldn't load ${what} just now. This is a problem on our side, not with your account.`}
          retryHref={retryHref}
        />
      </div>
    </ContentLayout>
  );
}

/**
 * Run one card's read without letting it take the whole page down.
 *
 * Four reporters (BUG-005574/5576/5579/5581) saw this page replaced by the
 * global "Something went wrong — network error" card. A single stalled read
 * throwing out of the server component is enough to do that, so each read now
 * degrades to its empty shape and the page renders an inline retry instead.
 * Next.js control-flow signals (redirect/notFound) carry a NEXT_* digest and
 * must still propagate.
 */
type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function settle<T>(
  work: Promise<T>,
  fallback: T,
  label: string,
  failed: string[]
): Promise<T> {
  try {
    return await work;
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw e;
    console.error(`[ai-pulse/my-pulse] ${label} failed:`, e);
    failed.push(label);
    return fallback;
  }
}

export default async function AiPulseLearnerPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  // The failed-read labels behind the inline retry notice.
  const failed: string[] = [];

  // searchParams does not depend on the profile read — resolve both together.
  const [{ profile, error: profileError }, sp] = await Promise.all([
    getEnhancedUserProfile(),
    searchParams,
  ]);

  // Resolve the cycle to show. Default = current week; the week switcher can
  // deep-link any past cycle via ?cycle=<id>. cycles[] backs the switcher.
  const requestedCycleId =
    typeof sp?.cycle === 'string' && sp.cycle.length > 0 ? sp.cycle : null;

  // Same URL, full reload — the page is force-dynamic, so this re-runs every read.
  const retryHref = requestedCycleId
    ? `/ai-pulse/my-pulse?cycle=${encodeURIComponent(requestedCycleId)}`
    : '/ai-pulse/my-pulse';

  if (!profile) {
    if (isMissingSession(profileError)) {
      redirect('/auth/login?next=/ai-pulse');
    }
    // We could not find out who this is. Sending them to login would tell them
    // to fix something that is not broken.
    return <UnavailablePage what="your profile" retryHref={retryHref} />;
  }

  // Permission gate + action permissions in ONE round trip. This used to be the
  // gate RPC awaited alone, then three more — four serial hops before any data
  // read could start. super_admin short-circuits all four.
  const [viewCheck, domainSyncCheck, quizCheck, publicationCheck] =
    profile.is_super_admin === true
      ? [
          PERMISSION_GRANTED,
          PERMISSION_GRANTED,
          PERMISSION_GRANTED,
          PERMISSION_GRANTED,
        ]
      : await Promise.all([
          checkPermission('aiPulse:view.self'),
          checkPermission('aiPulse:submit.domain_sync'),
          checkPermission('aiPulse:submit.quiz'),
          checkPermission('aiPulse:submit.publication'),
        ]);

  // A gate we could not READ is not a gate that said no.
  if (viewCheck.failed) {
    return (
      <UnavailablePage what="your AI Pulse access" retryHref={retryHref} />
    );
  }
  if (!viewCheck.allowed) {
    redirect('/unauthorized?module=ai-pulse');
  }

  const canDomainSync = domainSyncCheck.allowed;
  const canQuiz = quizCheck.allowed;
  const canPublication = publicationCheck.allowed;

  // An action key we could not read hides its button, so say so rather than
  // letting the learner think the action was withdrawn.
  if (domainSyncCheck.failed || quizCheck.failed || publicationCheck.failed) {
    failed.push('permissions');
  }

  // Cycle list, current cycle, the deep-linked cycle and the Gold card are four
  // independent reads. They used to run in three waves (list+current, then the
  // deep-linked cycle, then Gold at the very end); now one.
  const [cycles, currentCycle, requestedCycle, gold] = await Promise.all([
    settle(
      AiPulseLearnerService.listCyclesServer(12, SURFACE_ERRORS),
      [],
      'cycles',
      failed
    ),
    settle(
      AiPulseLearnerService.getCurrentCycleServer(SURFACE_ERRORS),
      null,
      'current-cycle',
      failed
    ),
    requestedCycleId
      ? settle(
          AiPulseLearnerService.getCycleByIdServer(
            requestedCycleId,
            SURFACE_ERRORS
          ),
          null,
          'requested-cycle',
          failed
        )
      : Promise.resolve(null),
    // CARE R-move: latest faculty-picked Gold (null until the first Monday Lab
    // scores a cycle — the card hides itself).
    settle(
      AiPulseLearnerService.getLatestGoldServer(undefined, SURFACE_ERRORS),
      null,
      'gold',
      failed
    ),
  ]);

  // Every card below is scoped to a cycle. If the cycle read itself failed, a
  // null cycle is a guess, and the page would state "no active cycle" with the
  // same confidence it states a real one — exactly the dead end the four
  // reporters could not get past. Say what happened instead.
  if (failed.includes('current-cycle') || failed.includes('requested-cycle')) {
    return <UnavailablePage what="your AI Pulse week" retryHref={retryHref} />;
  }

  // A hand-typed / stale ?cycle= id that isn't an ai_pulse cycle falls back to
  // the current cycle rather than showing an empty page.
  const cycle = requestedCycleId ? requestedCycle ?? currentCycle : currentCycle;

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

  let team: AiPulseTeamSummary | null = null;
  let attendance: AiPulseAttendance = {
    state: 'pending',
    day_type: null,
    marked_at: null,
    signals: null,
  };
  let streak = 0;

  if (cycle) {
    const supabase = await settle<ServerSupabase | null>(
      createServerSupabaseClient(),
      null,
      'supabase-client',
      failed
    );
    if (supabase) {
      // Team, attendance and streak are independent of each other — they used
      // to be three serial awaits (and getMyStreak was itself a per-cycle loop).
      // Attendance is keyed on profile_id in ai_pulse_live_attendance — it does
      // NOT depend on a team assignment. Fetch it regardless so learners who
      // attended (or whose team isn't assigned yet) see their real status
      // instead of a permanent "pending".
      const [teamResult, attendanceResult, streakResult] = await Promise.all([
        settle(
          AiPulseLearnerService.getMyTeam(
            cycle.id,
            profile.id,
            supabase,
            SURFACE_ERRORS
          ),
          null,
          'team',
          failed
        ),
        settle(
          AiPulseLearnerService.getMyAttendance(
            cycle.id,
            profile.id,
            supabase,
            SURFACE_ERRORS
          ),
          attendance,
          'attendance',
          failed
        ),
        settle(
          AiPulseLearnerService.getMyStreak(
            profile.id,
            supabase,
            SURFACE_ERRORS
          ),
          0,
          'streak',
          failed
        ),
      ]);
      team = teamResult;
      attendance = attendanceResult;
      streak = streakResult;
    }
  }

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

        {failed.length > 0 && (
          <RetryNotice
            message="Part of this page didn't load just now. Everything else is shown below."
            retryHref={retryHref}
          />
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
