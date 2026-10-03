// Small presentation helpers for the triage queue. Nothing here ranks or
// scores anything — that is done by the database view.

import type { TriagedIssue } from '@/types/instasolver';

/** "open 9 days" — elapsed time stated as a fact, never as a target. */
export function openLabel(openDays: number | string): string {
  const d = Number(openDays);
  if (!Number.isFinite(d) || d < 0) return 'open';
  if (d < 1) {
    const hours = Math.round(d * 24);
    if (hours < 1) return 'open under an hour';
    return `open ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.floor(d);
  return `open ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Who holds the issue: a named person, a team nobody has claimed, or nobody. */
export function heldBy(issue: Pick<TriagedIssue, 'assignee' | 'team' | 'assigned_to' | 'assigned_team_id'>): string {
  const person = issue.assignee?.full_name ?? (issue.assigned_to ? 'A team member' : null);
  const team = issue.team?.name ?? (issue.assigned_team_id ? 'a team' : null);
  if (person && team) return `${person} (${team})`;
  if (person) return person;
  if (team) return `Unclaimed — ${team}`;
  return 'Nobody yet';
}

export function issuePath(id: number): string {
  return `/instasolver/issues/${id}`;
}
