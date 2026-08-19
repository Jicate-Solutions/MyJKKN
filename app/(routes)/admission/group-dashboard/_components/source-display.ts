// ════════════════════════════════════════════════════════════════════════════
// Shared source display vocabulary — colours + labels for lead sources.
//
// Extracted 2026-08-13 when the admitted-by-source drill-down landed, so the
// Source Analytics tab and the drill-down page cannot drift apart on what a
// source is called or coloured. Previously SOURCE_COLORS lived privately in
// source-analytics-tab.tsx.
//
// ── A deliberate split on what `null` means ─────────────────────────────────
// `source === null` does NOT mean the same thing on both surfaces:
//
//   Source Analytics tab   rows come from admission_leads. A null source is a
//                          lead that exists but carries no source value.
//                          (In practice this never occurs today — every one of
//                          the 22,147 lead rows has a non-null source.)
//
//   Admitted drill-down    rows come from learners_profiles. A null source is
//                          a learner with NO LEAD AT ALL — a direct admission.
//                          For AY 2026 that is 964 of 1,515 learners.
//
// So this module exports the pure formatter (formatSourceName) plus the
// drill-down's own null semantics (sourceLabel / DIRECT_SOURCE_LABEL), and
// each surface picks the one that matches its data. Do not collapse them.
//
// Keep SOURCE_COLORS in sync with the admission_leads.source enum. Values
// present in the database but missing here render grey, which makes a real
// channel look like "unknown" — that is exactly how inbound_call (3,119 leads)
// and whatsapp were being mis-displayed before this file existed.
// ════════════════════════════════════════════════════════════════════════════

import {
  DIRECT_SOURCE_KEY,
  type AdmittedSourceCount,
} from '@/types/admission-workflow-config';

export const SOURCE_COLORS: Record<string, string> = {
  referral: '#8b5cf6',
  agent: '#f59e0b',
  walk_in: '#22c55e',
  website: '#3b82f6',
  social_media: '#ec4899',
  newspaper: '#14b8a6',
  education_fair: '#f97316',
  google_ads: '#ef4444',
  facebook_ads: '#6366f1',
  youtube_ads: '#e11d48',
  admission_form: '#84cc16',
  publisher: '#0ea5e9',
  learner_creator_content: '#d946ef',
  // Present in the database but previously unmapped (added 2026-08-13):
  inbound_call: '#06b6d4',
  whatsapp: '#25d366',
  other: '#9ca3af',
  unknown: '#d1d5db',
  // The no-lead bucket. Deliberately a muted slate so it reads as "absence of
  // attribution" rather than as just another marketing channel.
  [DIRECT_SOURCE_KEY]: '#94a3b8',
};

export const DIRECT_SOURCE_LABEL = 'Direct / No lead source';

/**
 * Pure presentation transform: 'education_fair' → 'Education Fair'.
 * Carries no opinion about what a missing source means — callers decide.
 */
export function formatSourceName(source: string): string {
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Label for the ADMITTED DRILL-DOWN, where a missing source means the learner
 * has no lead row at all. Accepts both `null` and the DIRECT_SOURCE_KEY
 * sentinel so callers can pass whichever form they hold.
 *
 * Do not use this on the Source Analytics tab — see the note at the top.
 */
export function sourceLabel(source: string | null | undefined): string {
  if (!source || source === DIRECT_SOURCE_KEY) return DIRECT_SOURCE_LABEL;
  return formatSourceName(source);
}

/** Chart/badge colour for a source value, including the direct bucket. */
export function sourceColor(source: string | null | undefined): string {
  if (!source) return SOURCE_COLORS[DIRECT_SOURCE_KEY];
  return SOURCE_COLORS[source] ?? SOURCE_COLORS.other;
}

/**
 * Order source counts for display: real sources by volume descending, with the
 * direct/no-lead bucket pinned last.
 *
 * The pin matters. For AY 2026 the direct bucket is 964 of 1,515 (64%) and for
 * AY 2025 it is 100%, so sorting purely by volume would put "no attribution"
 * at the head of the list and read as though it were the top-performing
 * channel. It is a residual, not a channel.
 */
export function orderSourceCounts(counts: AdmittedSourceCount[]): AdmittedSourceCount[] {
  const real = counts
    .filter((c) => c.source !== DIRECT_SOURCE_KEY)
    .sort((a, b) => b.admits - a.admits);
  const direct = counts.filter((c) => c.source === DIRECT_SOURCE_KEY);
  return [...real, ...direct];
}
