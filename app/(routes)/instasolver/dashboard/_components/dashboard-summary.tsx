'use client';

// "Your next step" — ported from the standalone InstaSolver
// (app/(app)/dashboard/_components/dashboard-summary.tsx).
//
// The stat cards answer "how many of each". This answers "what do I do now",
// and where it can, lets you do it right here:
//   CAO / Super Admin — fixes a reporter says did not work (first: they are a
//                       broken promise), new reports needing a priority,
//                       requirements to review.
//   Maintenance       — the next job, with Start work inline (one tap), and
//                       what is already in progress.
//   Reporter          — "Was it fixed?" with Yes, fixed inline; "No" opens the
//                       issue, because a dispute needs a reason.
//   Principal         — open and reopened issues in their institution.
// When exactly one item is waiting, the button opens THAT item. Each row wears
// its status colour; at most three rows. Counts are RLS-scoped, never literals.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Inbox, Loader2, Package, Play, RotateCcw, ThumbsUp, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDashboardStats, useInstaSolverMutation, useNextSteps } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverIssueService } from '@/lib/services/instasolver/issue-service';
import type { InstaSolverAccess, NextStepGroup } from '@/types/instasolver';
import type { DashboardRole } from './role';

type RowTone = 'danger' | 'warning' | 'info' | 'progress' | 'success';

interface Step {
  key: string;
  icon: LucideIcon;
  tone: RowTone;
  title: ReactNode;
  detail?: ReactNode;
  action: ReactNode;
}

const BASE = '/instasolver';
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// A tinted card with a thicker stripe down the left in the status tone.
const ROW_TONE: Record<RowTone, string> = {
  danger: 'border-red-300 border-l-red-600 bg-red-50 dark:border-red-900 dark:border-l-red-500 dark:bg-red-950/50',
  warning: 'border-amber-300 border-l-amber-600 bg-amber-100 dark:border-amber-800 dark:border-l-amber-500 dark:bg-amber-950/60',
  info: 'border-sky-300 border-l-sky-600 bg-sky-100 dark:border-sky-800 dark:border-l-sky-500 dark:bg-sky-950/60',
  progress: 'border-indigo-300 border-l-indigo-600 bg-indigo-100 dark:border-indigo-800 dark:border-l-indigo-500 dark:bg-indigo-950/60',
  success: 'border-emerald-300 border-l-emerald-600 bg-emerald-100 dark:border-emerald-800 dark:border-l-emerald-500 dark:bg-emerald-950/60'
};

const ROW_ICON: Record<RowTone, string> = {
  danger: 'bg-card text-red-600',
  warning: 'bg-card text-amber-700 dark:text-amber-400',
  info: 'bg-card text-sky-700 dark:text-sky-400',
  progress: 'bg-card text-indigo-700 dark:text-indigo-400',
  success: 'bg-card text-emerald-700 dark:text-emerald-400'
};

// The button is the deep form of the row's own colour, so each row reads as
// one piece: pale card, strong mark at each end.
const ROW_ACTION: Record<RowTone, string> = {
  danger: 'bg-red-600 text-white hover:bg-red-700',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  info: 'bg-sky-600 text-white hover:bg-sky-700',
  progress: 'bg-indigo-600 text-white hover:bg-indigo-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700'
};

function OpenButton({ href, tone, children }: { href: string; tone: RowTone; children: ReactNode }) {
  return (
    <Button asChild size="sm" className={cn('shrink-0 font-semibold shadow-sm', ROW_ACTION[tone])}>
      <Link href={href}>
        {children}
        <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden />
      </Link>
    </Button>
  );
}

/** One tap: assigned → in progress, from the dashboard. */
function StartWorkButton({ id, assignedTo }: { id: number; assignedTo: string }) {
  const start = useInstaSolverMutation(
    () => InstaSolverIssueService.start({ id, assigned_to: assignedTo }),
    'Work started'
  );
  return (
    <Button
      size="sm"
      className={cn('shrink-0 font-semibold shadow-sm', ROW_ACTION.info)}
      disabled={start.isPending}
      onClick={() => start.mutate(undefined)}
    >
      {start.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
      {start.isPending ? 'Starting…' : 'Start work'}
    </Button>
  );
}

/** "Yes" is one tap; "No" needs a reason, so it opens the issue. */
function ConfirmFixButtons({ id }: { id: number }) {
  const confirm = useInstaSolverMutation(() => InstaSolverIssueService.confirmFix(id), 'Thanks — marked as fixed');
  return (
    <div className="flex shrink-0 gap-1.5">
      <Button
        size="sm"
        className={cn('font-semibold shadow-sm', ROW_ACTION.success)}
        disabled={confirm.isPending}
        onClick={() => confirm.mutate(undefined)}
      >
        <ThumbsUp className="mr-1 h-3.5 w-3.5" />
        {confirm.isPending ? 'Saving…' : 'Yes, fixed'}
      </Button>
      {/* "No" stays quiet: it costs the team another visit, so it should be a
          deliberate press, not the obvious one. */}
      <Button asChild size="sm" variant="outline" className="bg-card">
        <Link href={`${BASE}/issues/${id}`}>No</Link>
      </Button>
    </div>
  );
}

/** The issue itself when there is one, the list when there are several. */
const target = (group: NextStepGroup, list: string) =>
  group.count === 1 && group.first ? `${BASE}/issues/${group.first.id}` : list;

export function DashboardSummary({ role, access }: { role: DashboardRole; access: InstaSolverAccess }) {
  const isManager = role === 'cao' || role === 'super_admin';
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: next, isLoading: nextLoading } = useNextSteps({
    manager: isManager,
    maintenance: access.is_maintenance,
    reporter: access.can_report
  });

  if ((statsLoading && !stats) || (nextLoading && !next)) {
    return <Skeleton className="h-16 w-full rounded-xl" />;
  }

  const steps: Step[] = [];
  const issues = stats?.issues;
  const open = issues ? issues.pending + issues.assigned + issues.in_progress : 0;

  // The reporter's question first, for every role that reports: only they can
  // answer it, and the CAO's queue waits on it.
  const confirm = next?.toConfirm;
  if (confirm?.count && confirm.first) {
    steps.push({
      key: 'confirm',
      icon: CheckCircle2,
      tone: 'success',
      title: <>Was “{confirm.first.title}” fixed?</>,
      detail:
        confirm.count > 1 ? `${confirm.count} fixes are waiting for your answer` : 'The team marked it done — tell them if it worked',
      action: <ConfirmFixButtons id={confirm.first.id} />
    });
  }

  if (isManager) {
    const disputed = next?.disputed;
    if (disputed?.count) {
      steps.push({
        key: 'disputed',
        icon: RotateCcw,
        tone: 'danger',
        title: (
          <>
            <b className="tabular-nums">{disputed.count}</b>{' '}
            {plural(disputed.count, 'fix the reporter says did not work', 'fixes reporters say did not work')}
          </>
        ),
        detail: disputed.first ? `Oldest: ${disputed.first.title}` : null,
        action: (
          <OpenButton href={target(disputed, `${BASE}/triage`)} tone="danger">
            Look again
          </OpenButton>
        )
      });
    }

    const pending = next?.needsPriority;
    if (pending?.count) {
      steps.push({
        key: 'needs-priority',
        icon: Inbox,
        tone: 'warning',
        title: (
          <>
            <b className="tabular-nums">{pending.count}</b>{' '}
            {plural(pending.count, 'new report needs a priority', 'new reports need a priority')}
          </>
        ),
        detail: pending.first ? `Waiting longest: ${pending.first.title}` : null,
        action: (
          <OpenButton href={target(pending, `${BASE}/triage`)} tone="warning">
            {pending.count === 1 ? 'Prioritise' : 'Start triage'}
          </OpenButton>
        )
      });
    }

    const requirements = stats?.requirements?.pending ?? 0;
    if (requirements > 0) {
      steps.push({
        key: 'requirements',
        icon: Package,
        tone: 'info',
        title: (
          <>
            <b className="tabular-nums">{requirements}</b> {plural(requirements, 'requirement to review', 'requirements to review')}
          </>
        ),
        action: (
          <OpenButton href={`${BASE}/requirements?status=pending`} tone="info">
            Review
          </OpenButton>
        )
      });
    }
  }

  if (access.is_maintenance) {
    const toStart = next?.toStart;
    if (toStart?.count && toStart.first) {
      // Start is offered only on work assigned to YOU; team work is claimed
      // first, on My work, so two people never start the same job.
      const mine = toStart.first.assigned_to === access.user_id;
      steps.push({
        key: 'start',
        icon: Wrench,
        tone: 'info',
        title: <>Next job: {toStart.first.title}</>,
        detail:
          toStart.count > 1
            ? `${toStart.count} jobs waiting to start · urgent first`
            : mine
              ? 'Waiting to start'
              : 'Assigned to your team — claim it on My work',
        action: mine ? (
          <StartWorkButton id={toStart.first.id} assignedTo={toStart.first.assigned_to as string} />
        ) : (
          <OpenButton href={`${BASE}/work?tab=to_claim`} tone="warning">
            Claim
          </OpenButton>
        )
      });
    }

    const inProgress = next?.inProgress;
    if (inProgress?.count) {
      steps.push({
        key: 'in-progress',
        icon: Loader2,
        tone: 'progress',
        title: (
          <>
            <b className="tabular-nums">{inProgress.count}</b> {plural(inProgress.count, 'job in progress', 'jobs in progress')}
          </>
        ),
        detail: inProgress.first ? `Mark done when finished: ${inProgress.first.title}` : null,
        action: (
          <OpenButton href={target(inProgress, `${BASE}/work?tab=in_progress`)} tone="progress">
            {inProgress.count === 1 ? 'Mark done' : 'Open'}
          </OpenButton>
        )
      });
    }
  }

  if (role === 'principal' && issues) {
    if (open > 0) {
      steps.push({
        key: 'open',
        icon: Inbox,
        tone: 'info',
        title: (
          <>
            <b className="tabular-nums">{open}</b>{' '}
            {plural(open, 'issue is open in your institution', 'issues are open in your institution')}
          </>
        ),
        action: (
          <OpenButton href={`${BASE}/issues?status=pending,assigned,in_progress`} tone="info">
            View
          </OpenButton>
        )
      });
    }
    if (issues.reopened > 0) {
      steps.push({
        key: 'reopened',
        icon: RotateCcw,
        tone: 'danger',
        title: (
          <>
            <b className="tabular-nums">{issues.reopened}</b>{' '}
            {plural(issues.reopened, 'issue came back after a fix', 'issues came back after a fix')}
          </>
        ),
        action: (
          <OpenButton href={`${BASE}/analytics`} tone="danger">
            View
          </OpenButton>
        )
      });
    }
  }

  const ownOpen = stats?.own.issues_open ?? 0;
  if (role === 'reporter' && ownOpen > 0) {
    steps.push({
      key: 'mine',
      icon: Inbox,
      tone: 'info',
      title: (
        <>
          <b className="tabular-nums">{ownOpen}</b> {plural(ownOpen, 'of your reports is still open', 'of your reports are still open')}
        </>
      ),
      detail: 'You will be notified as each one moves',
      action: (
        <OpenButton href={`${BASE}/issues?scope=mine`} tone="info">
          View
        </OpenButton>
      )
    });
  }

  if (steps.length === 0) {
    return (
      <p className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        Nothing is waiting on you — all caught up.
      </p>
    );
  }

  return (
    <section aria-labelledby="next-step-heading" className="space-y-2">
      <h2 id="next-step-heading" className="text-xs font-medium text-muted-foreground">
        Your next step
      </h2>
      <ul className="space-y-2">
        {steps.slice(0, 3).map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.key}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-l-4 px-4 py-3 sm:flex-nowrap',
                ROW_TONE[step.tone]
              )}
            >
              <span
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm', ROW_ICON[step.tone])}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </span>
              {/* Phone: the text takes the full row and the button drops below it. */}
              <div className="min-w-0 flex-1 basis-[calc(100%-2.75rem)] sm:basis-auto">
                <p className="line-clamp-2 text-sm font-medium sm:truncate">{step.title}</p>
                {step.detail ? <p className="truncate text-xs text-muted-foreground">{step.detail}</p> : null}
              </div>
              <div className="ml-11 sm:ml-0">{step.action}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
