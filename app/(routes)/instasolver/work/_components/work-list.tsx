'use client';

import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import { CheckCircle2, Hand, MapPin, Phone, PlayCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IssueStatusBadge, PriorityBadge, SeverityBadge } from '@/components/instasolver/badges';
import type { Issue, WorkTab } from '@/types/instasolver';

export interface WorkActionHandlers {
  onClaim: (issue: Issue) => void;
  onStart: (issue: Issue) => void;
  onComplete: (issue: Issue) => void;
  /** id of the issue with an action in flight, so its buttons can wait. */
  busyId: number | null;
}

const issuePath = (id: number) => `/instasolver/issues/${id}`;

/** "open 9 days" — elapsed time as a fact. */
function ageLabel(iso: string): string {
  return `open ${formatDistanceToNowStrict(new Date(iso))}`;
}

function heldBy(issue: Issue): string {
  if (issue.assignee?.full_name) return issue.assignee.full_name;
  if (issue.assigned_to) return 'A team member';
  return `Unclaimed — ${issue.team?.name ?? 'no team'}`;
}

function Reporter({ issue }: { issue: Issue }) {
  const name = issue.reporter?.full_name ?? 'Reporter';
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-muted-foreground">Reported by {name}</span>
      {issue.contact_phone && (
        <a
          href={`tel:${issue.contact_phone}`}
          className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium text-primary hover:bg-muted md:min-h-0 md:border-0 md:px-0 md:hover:underline"
          aria-label={`Call ${name} on ${issue.contact_phone}`}
        >
          <Phone className="h-4 w-4" />
          {issue.contact_phone}
        </a>
      )}
    </div>
  );
}

function Actions({ tab, issue, h }: { tab: WorkTab; issue: Issue; h: WorkActionHandlers }) {
  const busy = h.busyId === issue.id;
  const btn = 'h-11 flex-1 md:h-9 md:flex-none';

  if (tab === 'to_claim') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button className={btn} disabled={busy} onClick={() => h.onClaim(issue)}>
          <Hand className="mr-1.5 h-4 w-4" />
          Claim
        </Button>
        {issue.status === 'assigned' && (
          <Button className={btn} variant="outline" disabled={busy} onClick={() => h.onStart(issue)}>
            <Zap className="mr-1.5 h-4 w-4" />
            Claim &amp; start
          </Button>
        )}
      </div>
    );
  }
  if (tab === 'assigned') {
    return (
      <Button className={btn} disabled={busy} onClick={() => h.onStart(issue)}>
        <PlayCircle className="mr-1.5 h-4 w-4" />
        Start
      </Button>
    );
  }
  if (tab === 'in_progress') {
    return (
      <Button className={btn} disabled={busy} onClick={() => h.onComplete(issue)}>
        <CheckCircle2 className="mr-1.5 h-4 w-4" />
        Complete
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" className={btn}>
      <Link href={issuePath(issue.id)}>Open</Link>
    </Button>
  );
}

function completionNote(issue: Issue): string | null {
  if (issue.resolution_disputed_at) return 'The reporter says it is still a problem';
  if (issue.resolution_confirmed_at) return 'The reporter confirmed the fix';
  return 'Waiting for the reporter to confirm';
}

// ---------------------------------------------------------------------------
// md and up — table
// ---------------------------------------------------------------------------
function WorkTable({ tab, rows, h }: { tab: WorkTab; rows: Issue[]; h: WorkActionHandlers }) {
  return (
    <div className="scrollbar-slim hidden overflow-x-auto rounded-md border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Priority / severity</TableHead>
            <TableHead>Held by</TableHead>
            <TableHead>Reporter</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((issue) => (
            <TableRow key={issue.id} className="align-top">
              <TableCell className="max-w-xs space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={issuePath(issue.id)} className="font-mono text-xs font-medium text-primary hover:underline">
                    {issue.reference_no}
                  </Link>
                  <IssueStatusBadge status={issue.status} />
                </div>
                <Link href={issuePath(issue.id)} className="block font-medium hover:underline">
                  {issue.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {tab === 'completed' && issue.completed_at
                    ? `completed ${formatDistanceToNowStrict(new Date(issue.completed_at), { addSuffix: true })}`
                    : ageLabel(issue.created_at)}
                </p>
                {tab === 'completed' && <p className="text-xs text-muted-foreground">{completionNote(issue)}</p>}
              </TableCell>
              <TableCell className="text-sm">
                <p className="flex items-start gap-1">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="break-words">{issue.location}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{issue.institution?.name}</p>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <PriorityBadge priority={issue.priority} />
                  <SeverityBadge severity={issue.severity} />
                </div>
              </TableCell>
              <TableCell className="text-sm">{heldBy(issue)}</TableCell>
              <TableCell>
                <Reporter issue={issue} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <Actions tab={tab} issue={issue} h={h} />
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
// below md — cards, built for a phone in a corridor
// ---------------------------------------------------------------------------
function WorkCards({ tab, rows, h }: { tab: WorkTab; rows: Issue[]; h: WorkActionHandlers }) {
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((issue) => (
        <li key={issue.id} className="space-y-3 rounded-lg border bg-card p-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={issuePath(issue.id)} className="font-mono text-xs font-medium text-primary">
                {issue.reference_no}
              </Link>
              <IssueStatusBadge status={issue.status} />
            </div>
            <Link href={issuePath(issue.id)} className="block font-medium leading-snug">
              {issue.title}
            </Link>
          </div>

          <p className="flex items-start gap-1.5 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="break-words font-medium">{issue.location}</span>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={issue.priority} />
            <SeverityBadge severity={issue.severity} />
            <span className="text-xs text-muted-foreground">
              {tab === 'completed' && issue.completed_at
                ? `completed ${formatDistanceToNowStrict(new Date(issue.completed_at), { addSuffix: true })}`
                : ageLabel(issue.created_at)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">Held by: {heldBy(issue)}</p>
          {tab === 'completed' && <p className="text-xs text-muted-foreground">{completionNote(issue)}</p>}

          <Reporter issue={issue} />
          <Actions tab={tab} issue={issue} h={h} />
        </li>
      ))}
    </ul>
  );
}

export function WorkList({ tab, rows, handlers }: { tab: WorkTab; rows: Issue[]; handlers: WorkActionHandlers }) {
  return (
    <>
      <WorkTable tab={tab} rows={rows} h={handlers} />
      <WorkCards tab={tab} rows={rows} h={handlers} />
    </>
  );
}
