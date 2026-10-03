'use client';

import Link from 'next/link';
import { ArrowRight, BellRing, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardStats, InstaSolverAccess } from '@/types/instasolver';

interface Step {
  key: string;
  text: string;
  cta: string;
  href: string;
}

/** The most useful actions right now, in order of who is waiting on whom. */
function buildSteps(access: InstaSolverAccess, s: DashboardStats): Step[] {
  const steps: Step[] = [];
  if (access.is_manager) {
    if (s.issues.disputed > 0) {
      steps.push({
        key: 'disputed',
        text: `${s.issues.disputed} completed ${s.issues.disputed === 1 ? 'fix is' : 'fixes are'} disputed by the reporter.`,
        cta: 'Review disputed fixes',
        href: '/instasolver/triage'
      });
    }
    if (s.issues.pending > 0) {
      steps.push({
        key: 'triage',
        text: `${s.issues.pending} ${s.issues.pending === 1 ? 'issue is' : 'issues are'} waiting for a priority and an assignee.`,
        cta: `Triage ${s.issues.pending} ${s.issues.pending === 1 ? 'issue' : 'issues'}`,
        href: '/instasolver/triage'
      });
    }
    if (s.requirements.pending > 0) {
      steps.push({
        key: 'requirements',
        text: `${s.requirements.pending} ${s.requirements.pending === 1 ? 'requirement is' : 'requirements are'} waiting for review.`,
        cta: 'Review requirements',
        href: '/instasolver/requirements?status=pending'
      });
    }
  }
  if (access.is_maintenance) {
    if (s.mine.to_claim > 0) {
      steps.push({
        key: 'claim',
        text: `${s.mine.to_claim} ${s.mine.to_claim === 1 ? 'job is' : 'jobs are'} with your team and nobody has picked ${s.mine.to_claim === 1 ? 'it' : 'them'} up.`,
        cta: 'Claim team work',
        href: '/instasolver/work?tab=to_claim'
      });
    }
    if (s.mine.assigned_to_me > 0) {
      steps.push({
        key: 'start',
        text: `${s.mine.assigned_to_me} ${s.mine.assigned_to_me === 1 ? 'job is' : 'jobs are'} assigned to you and not started.`,
        cta: 'Open my work',
        href: '/instasolver/work'
      });
    }
  }
  if (s.own.awaiting_confirmation > 0) {
    steps.push({
      key: 'confirm',
      text: `${s.own.awaiting_confirmation} of your reports ${s.own.awaiting_confirmation === 1 ? 'has' : 'have'} been completed. Is ${s.own.awaiting_confirmation === 1 ? 'it' : 'each one'} fixed?`,
      cta: 'Confirm the fix',
      href: '/instasolver/issues?scope=mine&status=completed'
    });
  }
  return steps;
}

/**
 * Highlighted when something is waiting on this person — amber accent bar,
 * tinted background, a live dot and the count — so it is the first thing the
 * eye lands on. When nothing is waiting it drops back to a calm green card.
 */
export function NextStepPanel({ access, stats }: { access: InstaSolverAccess; stats: DashboardStats }) {
  const steps = buildSteps(access, stats);
  const waiting = steps.length > 0;

  return (
    <Card
      className={cn(
        'overflow-hidden border-l-4',
        waiting
          ? 'border-amber-400 border-l-amber-500 bg-amber-50/70 shadow-md ring-1 ring-amber-200 dark:border-amber-700 dark:border-l-amber-500 dark:bg-amber-950/30 dark:ring-amber-900'
          : 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {waiting ? (
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
              <BellRing className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
            </span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          )}
          Your next step
          {waiting && (
            <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
              {steps.length} waiting
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!waiting ? (
          <p className="text-sm text-muted-foreground">Nothing is waiting on you right now.</p>
        ) : (
          steps.map((s) => (
            <div
              key={s.key}
              className="flex flex-col gap-2 rounded-md border border-amber-200 bg-background p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-900"
            >
              <p className="text-sm font-medium">{s.text}</p>
              <Button asChild size="sm" className="shrink-0">
                <Link href={s.href}>
                  {s.cta} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
