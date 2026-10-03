// lib/instasolver/constants.ts
//
// The ONE place InstaSolver status, severity and priority labels, colours and
// transitions live. v1 of the standalone product inserted 'Pending' and queried
// 'pending', and the triage queue sat empty for months — so no component writes
// a status literal or label of its own; it imports from here.
//
// The transitions mirror the database guards (instasolver_issues_guard /
// instasolver_requirements_guard). They exist to decide which BUTTONS to show;
// the database still refuses anything illegal on its own.

import type {
  IssueStatus,
  Priority,
  RequirementStatus,
  Severity,
  TriageReason,
  WorkTab
} from '@/types/instasolver';

export type Tone = 'neutral' | 'info' | 'warning' | 'progress' | 'success' | 'danger' | 'muted';

/** Tailwind classes per tone, for badges. Light + dark. */
export const TONE_BADGE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900',
  warning: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
  progress: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
  danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900',
  muted: 'bg-muted text-muted-foreground border-border'
};

/** Chart colour per tone (CSS colour), for Recharts series. */
export const TONE_CHART_COLOUR: Record<Tone, string> = {
  neutral: '#64748b',
  info: '#3b82f6',
  warning: '#f59e0b',
  progress: '#8b5cf6',
  success: '#10b981',
  danger: '#ef4444',
  muted: '#94a3b8'
};

interface Meta {
  label: string;
  description: string;
  tone: Tone;
}

// ---------------------------------------------------------------------------
// Issue status
// ---------------------------------------------------------------------------
export const ISSUE_STATUS_VALUES: IssueStatus[] = [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'rejected',
  'withdrawn'
];

export const ISSUE_STATUS_META: Record<IssueStatus, Meta> = {
  pending: { label: 'Awaiting triage', description: 'Reported, waiting for the CAO to prioritise and assign', tone: 'warning' },
  assigned: { label: 'Assigned', description: 'With a person or team, not yet started', tone: 'info' },
  in_progress: { label: 'In progress', description: 'Being worked on', tone: 'progress' },
  completed: { label: 'Completed', description: 'Maintenance has finished the work', tone: 'success' },
  rejected: { label: 'Rejected', description: 'Closed by the CAO without work', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', description: 'Withdrawn by the reporter before triage', tone: 'muted' }
};

export const OPEN_ISSUE_STATUSES: IssueStatus[] = ['pending', 'assigned', 'in_progress'];

/** Legal next statuses per current status. Actor rules are in the DB. */
export const ISSUE_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  pending: ['assigned', 'rejected', 'withdrawn'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['completed', 'rejected'],
  completed: ['in_progress'],
  rejected: [],
  withdrawn: []
};

/** Progress steps shown on the record, in order. */
export const ISSUE_PROGRESS_STEPS: IssueStatus[] = ['pending', 'assigned', 'in_progress', 'completed'];

// ---------------------------------------------------------------------------
// Requirement status
// ---------------------------------------------------------------------------
export const REQUIREMENT_STATUS_VALUES: RequirementStatus[] = [
  'pending',
  'approved',
  'rejected',
  'fulfilled',
  'withdrawn'
];

export const REQUIREMENT_STATUS_META: Record<RequirementStatus, Meta> = {
  pending: { label: 'Awaiting review', description: 'Waiting for the CAO to approve or reject', tone: 'warning' },
  approved: { label: 'Approved', description: 'Approved, waiting to be delivered', tone: 'info' },
  rejected: { label: 'Rejected', description: 'Declined by the CAO, with a reason', tone: 'danger' },
  fulfilled: { label: 'Fulfilled', description: 'Delivered', tone: 'success' },
  withdrawn: { label: 'Withdrawn', description: 'Withdrawn by the requester before review', tone: 'muted' }
};

export const REQUIREMENT_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  pending: ['approved', 'rejected', 'withdrawn'],
  approved: ['fulfilled'],
  rejected: [],
  fulfilled: [],
  withdrawn: []
};

// ---------------------------------------------------------------------------
// Severity (what the reporter observed) and priority (what was decided).
// Two vocabularies, never merged.
// ---------------------------------------------------------------------------
export const SEVERITY_VALUES: Severity[] = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_META: Record<Severity, Meta> = {
  critical: { label: 'Critical', description: 'Unsafe, or stops work entirely', tone: 'danger' },
  high: { label: 'High', description: 'Seriously affects work or learning', tone: 'warning' },
  medium: { label: 'Medium', description: 'A nuisance that needs fixing', tone: 'info' },
  low: { label: 'Low', description: 'Minor; fix when convenient', tone: 'neutral' }
};

export const PRIORITY_VALUES: Priority[] = ['urgent', 'high', 'medium', 'low'];

export const PRIORITY_META: Record<Priority, Meta> = {
  urgent: { label: 'Urgent', description: 'Drop other work', tone: 'danger' },
  high: { label: 'High', description: 'Next in line', tone: 'warning' },
  medium: { label: 'Medium', description: 'In the normal queue', tone: 'info' },
  low: { label: 'Low', description: 'When there is capacity', tone: 'neutral' }
};

/** A starting suggestion only — the CAO decides. */
export const SUGGESTED_PRIORITY_FOR_SEVERITY: Record<Severity, Priority> = {
  critical: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low'
};

// ---------------------------------------------------------------------------
// Triage reasons — mirror of instasolver_issue_triage_queue's weights.
// ---------------------------------------------------------------------------
export const TRIAGE_REASON_META: Record<TriageReason, Meta & { weight: string }> = {
  disputed: { label: 'Fix disputed', description: 'The reporter says it is still a problem', tone: 'danger', weight: '+90' },
  critical: { label: 'Critical', description: 'Reported as critical severity', tone: 'danger', weight: '+100' },
  urgent: { label: 'Urgent', description: 'Prioritised as urgent', tone: 'danger', weight: '+80' },
  reopened: { label: 'Reopened', description: 'Came back after being completed', tone: 'warning', weight: '+70' },
  recurring: { label: 'Recurring', description: 'Same fault reported at this location before', tone: 'warning', weight: '+25' },
  ageing: { label: 'Ageing', description: 'Open for 7 days or more', tone: 'warning', weight: '+2/day, max 60' },
  unassigned: { label: 'Unassigned', description: 'Nobody has it yet', tone: 'info', weight: '+15' }
};

// ---------------------------------------------------------------------------
// Maintenance work tabs
// ---------------------------------------------------------------------------
export const WORK_TABS: { value: WorkTab; label: string; description: string }[] = [
  { value: 'assigned', label: 'Assigned to me', description: 'Given to you, not started' },
  { value: 'in_progress', label: 'In progress', description: 'You are working on these' },
  { value: 'to_claim', label: 'To claim', description: 'Given to your team; nobody has picked them up' },
  { value: 'completed', label: 'Completed', description: 'Finished by you' }
];

// ---------------------------------------------------------------------------
// Activity actions — human wording for the timeline.
// ---------------------------------------------------------------------------
export const ACTIVITY_LABEL: Record<string, string> = {
  created: 'reported this',
  edited: 'edited the report',
  status_changed: 'changed the status',
  assigned: 'assigned this',
  claimed: 'claimed this',
  reopened: 'reopened this',
  prioritised: 'set the priority',
  confirmed: 'confirmed the fix',
  disputed: 'said it is still a problem',
  note_added: 'added a note'
};

export function statusLabel(entity: 'issue' | 'requirement', value: string | null | undefined): string {
  if (!value) return '—';
  const meta =
    entity === 'issue'
      ? ISSUE_STATUS_META[value as IssueStatus]
      : REQUIREMENT_STATUS_META[value as RequirementStatus];
  return meta?.label ?? value;
}

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PAGE_SIZE = 25;
