// Pure helpers for the intake screens — plain-English labels and counts.
// No React here so the wording can be tested on its own.

import type {
  IntakeAction,
  IntakeConfidence,
  IntakeOpenJob,
  IntakeRow,
} from '@/types/hr-intake';

export function candidateName(row: IntakeRow): string {
  const name = `${row.candidate.first_name ?? ''} ${row.candidate.last_name ?? ''}`.trim();
  return name || 'Name not given';
}

export function jobLabel(job: Pick<IntakeOpenJob, 'title' | 'institution_name' | 'department_name'>): string {
  const where = [job.department_name, job.institution_name].filter(Boolean).join(', ');
  return where ? `${job.title} — ${where}` : job.title;
}

/** "Assistant Manager – Accounts, Arts & Science" — title plus the college, when known. */
export function proposedJobText(
  jobId: string | null,
  fallbackTitle: string | null,
  openJobs: IntakeOpenJob[],
): string | null {
  const job = jobId ? openJobs.find((j) => j.id === jobId) : undefined;
  if (job) return job.institution_name ? `${job.title}, ${job.institution_name}` : job.title;
  return fallbackTitle;
}

/** The one line a card leads with. */
export function actionLine(
  action: IntakeAction,
  jobId: string | null,
  jobTitle: string | null,
  openJobs: IntakeOpenJob[],
): string {
  switch (action) {
    case 'file_under_job': {
      const text = proposedJobText(jobId, jobTitle, openJobs);
      return text ? `File under: ${text}` : 'File under a job (no job chosen yet)';
    }
    case 'merge_existing':
      return 'Link to their earlier application (nothing new is filed)';
    case 'needs_new_job':
      return 'No open job fits — a new job posting is needed first';
    case 'skip':
      return 'Skip — nothing is filed for this card';
  }
}

export const CONFIDENCE_LABEL: Record<IntakeConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

/** Theme-paired status colours (design-system §6: 700 in light, 400 in dark). */
export const CONFIDENCE_CLASS: Record<IntakeConfidence, string> = {
  high: 'border-green-700/30 text-green-700 dark:border-emerald-400/30 dark:text-emerald-400',
  medium: 'border-amber-700/30 text-amber-700 dark:border-amber-400/30 dark:text-amber-400',
  low: 'border-red-600/30 text-red-600 dark:border-red-400/30 dark:text-red-400',
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'date not known';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date not known';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Only http(s) links are rendered; anything else (e.g. javascript:) is dropped. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Rows in the order the cards show them; the card number is position + 1. */
export function sortRows(rows: IntakeRow[]): IntakeRow[] {
  return [...rows].sort((a, b) => a.row_index - b.row_index);
}

export function duplicateText(row: IntakeRow, numberById: Map<string, number>): string | null {
  const d = row.duplicate;
  switch (d.kind) {
    case 'none':
      return null;
    case 'same_file': {
      const n = d.ref_id ? numberById.get(d.ref_id) : undefined;
      // The note ("Same person as row N in this file (same phone number)")
      // already says it; only what matched is added, and "possibly" because a
      // shared phone may be a different person.
      const matched = d.note?.match(/\(([^)]+)\)\s*$/)?.[1];
      const where = n ? `card ${n} in this upload` : 'another card in this upload';
      return matched ? `Possibly the same person as ${where} (${matched})` : `Possibly the same person as ${where}`;
    }
    case 'existing_application':
      return d.note ?? 'Already applied to JKKN before';
    case 'existing_candidate':
      return d.note ?? 'Already in MyJKKN as a candidate';
  }
}

export function isFiled(row: IntakeRow): boolean {
  return !!row.applied && !row.applied.error;
}

export interface IntakeSummary {
  total: number;
  readyToFile: number;
  needsNewJob: number;
  duplicates: number;
  decided: number;
  filed: number;
  /** Decided rows not yet filed — what "File decided candidates" sends. */
  toApply: string[];
}

export function summarise(rows: IntakeRow[]): IntakeSummary {
  const s: IntakeSummary = {
    total: rows.length,
    readyToFile: 0,
    needsNewJob: 0,
    duplicates: 0,
    decided: 0,
    filed: 0,
    toApply: [],
  };
  for (const r of rows) {
    const effective = r.decision?.action ?? r.proposal.action;
    const filed = isFiled(r);
    if (effective === 'file_under_job' && !filed) s.readyToFile += 1;
    if (effective === 'needs_new_job') s.needsNewJob += 1;
    if (r.duplicate.kind !== 'none') s.duplicates += 1;
    if (r.decision) s.decided += 1;
    if (filed) s.filed += 1;
    // Only cards decided "file under job": the others have nothing to file.
    if (r.decision?.action === 'file_under_job' && !filed) s.toApply.push(r.id);
  }
  return s;
}
