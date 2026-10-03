'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ExternalLink, MapPin, RotateCcw, UserCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IssueStatusBadge, PriorityBadge, SeverityBadge, TriageReasonChip } from '@/components/instasolver/badges';
import { QuickAssign, useAssigneeSuggestions } from '@/components/instasolver/assign';
import type { TriagedIssue } from '@/types/instasolver';
import { heldBy, issuePath, openLabel } from './triage-format';

export interface TriageActionHandlers {
  onAssign: (issue: TriagedIssue) => void;
  onReopen: (issue: TriagedIssue) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function isDisputedCompleted(issue: TriagedIssue): boolean {
  return issue.status === 'completed' && !!issue.resolution_disputed_at;
}

function DisputeNote({ issue }: { issue: TriagedIssue }) {
  if (!issue.resolution_disputed_at) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 break-words">
        <span className="font-semibold">Reporter says it is still a problem: </span>
        {issue.resolution_dispute_reason?.trim() || 'No reason given.'}
      </p>
    </div>
  );
}

function ReasonChips({ issue }: { issue: TriagedIssue }) {
  if (!issue.triage_reasons?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {issue.triage_reasons.map((r) => (
        <TriageReasonChip key={r} reason={r} />
      ))}
    </div>
  );
}

/**
 * Row actions, as in the standalone triage queue (triage-queue.tsx,
 * PendingRowAction): a pending row whose category a team covers gets
 * "Assign team" (opens the dialog on that team) and the one-click
 * "Assign member"; with no covering team, "Prioritise". A disputed row gets
 * Reopen. Reassigning and rejecting need the record in front of you — the
 * history, the reporter's reason — so they live on the issue page.
 */
function RowActions({ issue, handlers }: { issue: TriagedIssue; handlers: TriageActionHandlers }) {
  const isPending = issue.status === 'pending';
  const canReopen = isDisputedCompleted(issue);
  const { suggestions } = useAssigneeSuggestions(issue, isPending);

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={stop}>
      {isPending &&
        (suggestions.length > 0 ? (
          <>
            <Button size="sm" className="h-10 md:h-8" onClick={() => handlers.onAssign(issue)}>
              <Users className="mr-1.5 h-4 w-4" />
              Assign team
            </Button>
            <QuickAssign issue={issue} canAssign size="sm" className="h-10 md:h-8" />
          </>
        ) : (
          <Button size="sm" className="h-10 md:h-8" onClick={() => handlers.onAssign(issue)}>
            <UserCheck className="mr-1.5 h-4 w-4" />
            Prioritise
          </Button>
        ))}
      {canReopen && (
        <Button size="sm" className="h-10 md:h-8" onClick={() => handlers.onReopen(issue)}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Reopen
        </Button>
      )}
      <Button asChild size="sm" variant="ghost" className="h-10 md:h-8">
        <Link href={issuePath(issue.id)}>
          <ExternalLink className="mr-1.5 h-4 w-4" />
          Open
        </Link>
      </Button>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <span
      className="inline-flex min-w-[3rem] flex-col items-center rounded-md border bg-muted px-2 py-1 leading-tight"
      title="Triage score"
    >
      <span className="text-base font-semibold tabular-nums">{score}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">score</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// md and up — table
// ---------------------------------------------------------------------------
function TriageTable({ rows, handlers }: { rows: TriagedIssue[]; handlers: TriageActionHandlers }) {
  const router = useRouter();
  return (
    <div className="hidden rounded-md border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Score</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Where</TableHead>
            <TableHead>Severity / priority</TableHead>
            <TableHead>Held by</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((issue) => (
            <TableRow
              key={issue.id}
              className="cursor-pointer align-top"
              onClick={() => router.push(issuePath(issue.id))}
            >
              <TableCell>
                <ScorePill score={issue.triage_score} />
              </TableCell>
              <TableCell className="max-w-md space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={issuePath(issue.id)}
                    onClick={stop}
                    className="font-mono text-xs font-medium text-primary hover:underline"
                  >
                    {issue.reference_no}
                  </Link>
                  <IssueStatusBadge status={issue.status} />
                  <span className="text-xs text-muted-foreground">{openLabel(issue.open_days)}</span>
                </div>
                <p className="font-medium">{issue.title}</p>
                <ReasonChips issue={issue} />
                <DisputeNote issue={issue} />
              </TableCell>
              <TableCell className="space-y-1 text-sm">
                <p className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="break-words">{issue.location}</span>
                </p>
                <p className="text-muted-foreground">{issue.institution?.name ?? '—'}</p>
                <p className="text-muted-foreground">{issue.category?.name ?? '—'}</p>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <SeverityBadge severity={issue.severity} />
                  <PriorityBadge priority={issue.priority} />
                </div>
              </TableCell>
              <TableCell className="text-sm">{heldBy(issue)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <RowActions issue={issue} handlers={handlers} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// below md — cards
// ---------------------------------------------------------------------------
function TriageCards({ rows, handlers }: { rows: TriagedIssue[]; handlers: TriageActionHandlers }) {
  const router = useRouter();
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((issue) => (
        <li
          key={issue.id}
          className="cursor-pointer space-y-3 rounded-lg border bg-card p-3"
          onClick={() => router.push(issuePath(issue.id))}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={issuePath(issue.id)}
                  onClick={stop}
                  className="font-mono text-xs font-medium text-primary hover:underline"
                >
                  {issue.reference_no}
                </Link>
                <IssueStatusBadge status={issue.status} />
              </div>
              <p className="font-medium leading-snug">{issue.title}</p>
            </div>
            <ScorePill score={issue.triage_score} />
          </div>

          <p className="flex items-start gap-1 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="break-words">{issue.location}</span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={issue.severity} />
            <PriorityBadge priority={issue.priority} />
            <span className="text-xs text-muted-foreground">{openLabel(issue.open_days)}</span>
          </div>

          <ReasonChips issue={issue} />
          <DisputeNote issue={issue} />

          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              {issue.institution?.name ?? '—'} · {issue.category?.name ?? '—'}
            </p>
            <p>Held by: {heldBy(issue)}</p>
          </div>

          <RowActions issue={issue} handlers={handlers} />
        </li>
      ))}
    </ul>
  );
}

export function TriageList({ rows, handlers }: { rows: TriagedIssue[]; handlers: TriageActionHandlers }) {
  return (
    <>
      <TriageTable rows={rows} handlers={handlers} />
      <TriageCards rows={rows} handlers={handlers} />
    </>
  );
}
