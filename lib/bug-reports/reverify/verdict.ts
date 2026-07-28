// lib/bug-reports/reverify/verdict.ts
// Shared verdict parsing for the `bug.reverify` recipe output.
//
// Used by BOTH the per-bug re-verify route (/api/bug-reports/[id]/ai-reverify)
// and the cluster Verify-group fan-out (/api/bug-reports/clusters/[id]/verify).
// One copy on purpose: the write-symptom safety clamp below is a safety rule —
// a "can't submit / can't mark" (write) symptom can never be read-verified as
// fixed — and two drifting copies of a safety rule is how it silently breaks.

import { classifyReproducibility, type ReverifyBug } from './evidence';

export const VERDICTS = ['likely_fixed', 'still_broken', 'inconclusive'] as const;
export const CONFIDENCES = ['low', 'medium', 'high'] as const;
export const REPRO = ['read', 'write', 'unknown'] as const;

export type ReverifyVerdictValue = (typeof VERDICTS)[number];

export interface ParsedReverifyVerdict {
  verdict: ReverifyVerdictValue;
  confidence: (typeof CONFIDENCES)[number];
  reasoning: string;
  what_would_confirm: string;
  reproducible: (typeof REPRO)[number];
}

/** Compact a report's console_logs into a short excerpt for the judge prompt. */
export function compactConsole(consoleLogs: unknown): string {
  if (!Array.isArray(consoleLogs) || consoleLogs.length === 0) return '';
  const errorish = consoleLogs.filter((l: any) => l && (l.type === 'error' || l.level === 'error'));
  const picked = (errorish.length > 0 ? errorish : consoleLogs).slice(0, 3);
  return JSON.stringify(picked).slice(0, 1500);
}

/** Parse the strict-JSON verdict from a completed `bug.reverify` job result.
 *  Forces reproducible to 'write' when the description is clearly a write
 *  symptom, so a WRITE bug can never be reported as read-verified "fixed" even
 *  if the model slips. Returns null when the result is unreadable. */
export function parseVerdict(result: unknown, bug: ReverifyBug): ParsedReverifyVerdict | null {
  let text: string | null = null;
  if (typeof result === 'string') text = result;
  else if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    for (const k of ['answer', 'text', 'result']) {
      if (typeof o[k] === 'string') { text = o[k] as string; break; }
    }
    if (!text && typeof o.verdict === 'string') return sanitizeVerdict(o, bug);
  }
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return sanitizeVerdict(JSON.parse(text.slice(start, end + 1)), bug);
  } catch {
    return null;
  }
}

export function sanitizeVerdict(
  raw: Record<string, unknown>,
  bug: ReverifyBug
): ParsedReverifyVerdict | null {
  if (typeof raw.reasoning !== 'string' || raw.reasoning.trim().length === 0) return null;
  const heuristicRepro = classifyReproducibility(bug.description ?? '');
  let verdict = VERDICTS.includes(raw.verdict as any)
    ? (raw.verdict as ReverifyVerdictValue)
    : 'inconclusive';
  let reproducible = REPRO.includes(raw.reproducible as any)
    ? (raw.reproducible as (typeof REPRO)[number])
    : 'unknown';
  // Safety clamp: a write symptom cannot be read-verified as fixed.
  if (heuristicRepro === 'write') {
    reproducible = 'write';
    if (verdict === 'likely_fixed') verdict = 'inconclusive';
  }
  return {
    verdict,
    confidence: CONFIDENCES.includes(raw.confidence as any)
      ? (raw.confidence as (typeof CONFIDENCES)[number])
      : 'low',
    reasoning: raw.reasoning,
    what_would_confirm: typeof raw.what_would_confirm === 'string' ? raw.what_would_confirm : '',
    reproducible,
  };
}
