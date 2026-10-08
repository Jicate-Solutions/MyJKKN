'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ExternalLink, MapPin, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IssueStatusBadge, PriorityBadge, SeverityBadge, TriageReasonChip } from '@/components/instasolver/badges';
import type { TriagedIssue } from '@/types/instasolver';
import { heldBy, issuePath, openLabel } from './triage-format';

export interface TriageActionHandlers {
  onAssign: (issue: TriagedIssue) => void;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * Multi-select (as in the standalone triage queue): only rows awaiting triage
 * can be picked, because one bulk assignment gives each the same priority and
 * team — a disputed or already-assigned row needs its own decision.
 */
export interface TriageSelection {
  selected: Set<number>;
  toggle: (id: number) => void;
  setMany: (ids: number[], on: boolean) => void;
}

const selectable = (issue: TriagedIssue) => issue.status === 'pending';

/** "just now", "45m ago", "6h ago", "3d ago", "2mo ago" — as in the standalone app. */
function formatAge(value: string): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function RowCheck({ issue, selection }: { issue: TriagedIssue; selection?: TriageSelection }) {
  if (!selection || !selectable(issue)) return null;
  return (
    <span onClick={stop} className="inline-flex">
      <Checkbox
        checked={selection.selected.has(issue.id)}
        onCheckedChange={() => selection.toggle(issue.id)}
        aria-label={`Select ${issue.reference_no}`}
        className="h-5 w-5"
      />
    </span>
  );
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
 * Row actions: exactly two (owner's decision 2026-10-05) — Prioritise, which
 * opens Prioritise and assign (priority, team, person) on a row awaiting
 * triage, and Open, the record. Reassigning, rejecting and reopening a
 * disputed fix need the history and the reporter's reason in front of you, so
 * they live on the issue page.
 */
function RowActions({ issue, handlers }: { issue: TriagedIssue; handlers: TriageActionHandlers }) {
  return (
    <div className="flex items-center gap-2" onClick={stop}>
      {issue.status === "pending" && (
        <Button size="sm" className="h-10 md:h-8" onClick={() => handlers.onAssign(issue)}>
          <UserCheck className="mr-1.5 h-4 w-4" />
          Prioritise
        </Button>
      )}
      <Button asChild size="sm" variant="outline" className="h-10 md:h-8">
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
function TriageTable({ rows, handlers, selection }: { rows: TriagedIssue[]; handlers: TriageActionHandlers; selection?: TriageSelection }) {
  const router = useRouter();
  const pendingIds = rows.filter(selectable).map((r) => r.id);
  const allOn = pendingIds.length > 0 && pendingIds.every((id) => selection?.selected.has(id));
  const someOn = pendingIds.some((id) => selection?.selected.has(id));
  return (
    <div className="scrollbar-slim hidden overflow-x-auto rounded-md border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            {selection && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allOn ? true : someOn ? 'indeterminate' : false}
                  disabled={pendingIds.length === 0}
                  onCheckedChange={(v) => selection.setMany(pendingIds, v === true)}
                  aria-label="Select every issue awaiting triage on this page"
                  className="h-5 w-5"
                />
              </TableHead>
            )}
            <TableHead className="w-20">Score</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Severity</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Priority</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Status</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Waiting</TableHead>
            <TableHead className="w-[1%] whitespace-nowrap">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((issue) => (
            <TableRow
              key={issue.id}
              className="cursor-pointer align-top"
              onClick={() => router.push(issuePath(issue.id))}
            >
              {selection && (
                <TableCell className="w-10">
                  <RowCheck issue={issue} selection={selection} />
                </TableCell>
              )}
              <TableCell>
                <ScorePill score={issue.triage_score} />
              </TableCell>
              {/* Issue — as in the standalone queue: the title, then
                  reference · location · category, the reasons that ranked it,
                  and a disputed fix's reason in the reporter's own words. */}
              <TableCell className="max-w-md">
                <div className="min-w-0 space-y-1">
                  <Link href={issuePath(issue.id)} onClick={stop} className="font-medium hover:underline">
                    {issue.title}
                  </Link>
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={`${issue.reference_no} · ${issue.location}${issue.category ? ` · ${issue.category.name}` : ''}${issue.institution ? ` · ${issue.institution.name}` : ''}`}
                  >
                    {issue.reference_no} · {issue.location}
                    {issue.category ? ` · ${issue.category.name}` : ''}
                  </p>
                  <ReasonChips issue={issue} />
                  <DisputeNote issue={issue} />
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <SeverityBadge severity={issue.severity} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <PriorityBadge priority={issue.priority} />
              </TableCell>
              {/* Status and holder in one column — "Assigned · Karthik Velu". */}
              <TableCell className="whitespace-nowrap">
                <div className="max-w-[9rem] space-y-1" title={heldBy(issue)}>
                  <IssueStatusBadge status={issue.status} />
                  {issue.assigned_to || issue.assigned_team_id ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {issue.assignee?.full_name ?? 'A team member'}
                      {issue.team ? ` · ${issue.team.name}` : ''}
                    </p>
                  ) : issue.status !== 'pending' ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">Nobody yet</p>
                  ) : null}
                </div>
              </TableCell>
              {/* Waiting — how long since it was reported. */}
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                <time dateTime={issue.created_at} title={new Date(issue.created_at).toLocaleString('en-IN')}>
                  {formatAge(issue.created_at)}
                </time>
              </TableCell>
              <TableCell className="w-[1%] whitespace-nowrap">
                <div className="flex">
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
function TriageCards({ rows, handlers, selection }: { rows: TriagedIssue[]; handlers: TriageActionHandlers; selection?: TriageSelection }) {
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
                <RowCheck issue={issue} selection={selection} />
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

export function TriageList({
  rows,
  handlers,
  selection
}: {
  rows: TriagedIssue[];
  handlers: TriageActionHandlers;
  selection?: TriageSelection;
}) {
  return (
    <>
      <TriageTable rows={rows} handlers={handlers} selection={selection} />
      <TriageCards rows={rows} handlers={handlers} selection={selection} />
    </>
  );
}
