// lib/services/accreditation/narrative-capout-notice.ts
// ============================================================================
// The words we say when the AI gives up on an accreditation narrative.
//
// The nightly drafter re-drafts an ungrounded narrative until it hits the
// policy cap accreditation.narrative_max_draft_attempts. After that the pair
// silently stops being offered — no flag, no message, and the blocked draft
// looks exactly like one that is merely waiting its turn. This module builds
// the notice that ends that silence.
//
// WHAT THE NOTICE MUST AND MUST NOT SAY
//   MUST: which metric, which institution, which period, how many times the AI
//         tried, what could not be traced, and what the human should do next.
//   MUST NOT: claim the draft is wrong. Some blocked drafts are blocked because
//         the AI invented a figure (metric 7.3.f on JKKN College of Pharmacy is
//         stuck on a 0.22 that appears nowhere in its evidence — the gate is
//         right and must stay right). Others are blocked only because the
//         evidence behind a true statement has not been filed yet. The gate
//         cannot tell those apart, so neither may the notice. It says "a person
//         needs to decide", never "unblock this".
//
// Pure functions, no I/O — the cron route composes these with the canonical
// fanoutNotification helper. Covered by
// __tests__/lib/services/accreditation/narrative-capout-notice.test.ts.
// ============================================================================

/** How the recipients were resolved (returned by the SQL detector). */
export type CapoutRecipientKind = 'owner' | 'institution_queue' | 'platform_queue';

/** One row of fn_accreditation_narrative_capout_pending. */
export interface CapoutNarrativeRow {
  narrative_id: string;
  institution_id: string;
  institution_name: string | null;
  metric_code: string;
  metric_name: string | null;
  period_label: string;
  attempt_count: number;
  max_attempts: number;
  /** jsonb array of the wording the grounding gate could not trace. */
  ungrounded_tokens: unknown;
  recipient_kind: CapoutRecipientKind;
  recipient_ids: string[] | null;
}

export interface CapoutNotice {
  title: string;
  body: string;
  url: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
}

/** Accreditation body this notice is written for. */
const BODY_LABEL = 'NAAC';

/** Listing every flagged fragment would bury the instruction; six is plenty. */
export const MAX_LISTED_TOKENS = 6;

/**
 * One notice per narrative, forever. Paired with the UNIQUE partial index on
 * notifications.idempotency_key this is the second, independent guard behind
 * accreditation_metric_narratives.capout_notified_at, so a crash between
 * "send" and "claim" still cannot produce a duplicate bell item.
 */
export function capoutIdempotencyKey(narrativeId: string): string {
  return `accreditation_narrative_capout:${narrativeId}`;
}

/** Deep link to the one screen where the draft can actually be worked. */
export function narrativeDeepLink(narrativeId: string): string {
  return `/accreditation/naac/narratives/${narrativeId}`;
}

/**
 * The jsonb column is written by the grounding validator and may legitimately
 * repeat a fragment (it records every occurrence). De-duplicate, drop blanks,
 * and cap the list — this is a summary for a human, not the audit record. The
 * full, unmodified list stays on the narrative row.
 */
export function readUngroundedTokens(raw: unknown, limit: number = MAX_LISTED_TOKENS): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const value = typeof entry === 'string' ? entry.trim() : '';
    if (value) seen.add(value);
  }
  return Array.from(seen).slice(0, Math.max(0, limit));
}

/** How many distinct fragments the gate flagged (before the display cap). */
export function countUngroundedTokens(raw: unknown): number {
  return readUngroundedTokens(raw, Number.MAX_SAFE_INTEGER).length;
}

/** Explains, in the notice itself, why THIS person is the one reading it. */
function routingSentence(row: CapoutNarrativeRow, institution: string): string {
  switch (row.recipient_kind) {
    case 'owner':
      return `You are the assigned owner for this metric.`;
    case 'institution_queue':
      return `No owner is assigned for this metric, so this went to the IQAC / admin queue for ${institution}.`;
    default:
      return (
        `No owner is assigned for this metric and ${institution} has no local IQAC / admin account, ` +
        `so this went to the platform admin queue. Assigning an owner for the metric will route the next one straight to them.`
      );
  }
}

/**
 * Compose the notice for one capped-out narrative.
 *
 * Deliberately plain: a person opening the bell should understand what happened
 * and what to do without knowing what "grounding" means internally.
 */
export function buildCapoutNotice(row: CapoutNarrativeRow): CapoutNotice {
  const institution = (row.institution_name ?? '').trim() || 'this institution';
  const tokens = readUngroundedTokens(row.ungrounded_tokens);
  const totalTokens = countUngroundedTokens(row.ungrounded_tokens);
  const attempts = Math.max(1, Number(row.attempt_count) || 1);
  const attemptWord = attempts === 1 ? 'once' : `${attempts} times`;
  const metricLabel = (row.metric_name ?? '').trim();

  const title = `Needs a human: ${BODY_LABEL} ${row.metric_code} narrative — ${institution}`;

  const paragraphs: string[] = [
    `The AI drafted the ${BODY_LABEL} ${row.metric_code} narrative` +
      (metricLabel ? ` (${metricLabel})` : '') +
      ` for ${institution}, ${row.period_label}, ${attemptWord}. ` +
      `Each time, the evidence check found wording it could not trace back to the evidence cited for this metric, ` +
      `so the drafter has stopped retrying this one.`,

    `This does not mean the draft is wrong. The check blocks a draft whenever a figure or a claim cannot be matched ` +
      `to the evidence on file — which can mean the AI made the figure up, or that the evidence supporting a true ` +
      `statement simply has not been filed yet. Deciding which it is needs a person.`,
  ];

  if (tokens.length > 0) {
    const more = totalTokens > tokens.length ? ` (and ${totalTokens - tokens.length} more)` : '';
    paragraphs.push(`Could not be traced: ${tokens.join(', ')}${more}.`);
  }

  paragraphs.push(
    `Open the draft, compare the flagged wording against the cited evidence, then either file the missing evidence ` +
      `or rewrite those lines yourself. Until someone does, this narrative stays blocked and will not be submitted.`,
  );

  paragraphs.push(routingSentence(row, institution));

  return {
    title,
    body: paragraphs.join('\n\n'),
    url: narrativeDeepLink(row.narrative_id),
    idempotencyKey: capoutIdempotencyKey(row.narrative_id),
    metadata: {
      narrative_id: row.narrative_id,
      institution_id: row.institution_id,
      body_code: BODY_LABEL,
      metric_code: row.metric_code,
      period_label: row.period_label,
      attempt_count: attempts,
      max_attempts: row.max_attempts,
      recipient_kind: row.recipient_kind,
      ungrounded_token_count: totalTokens,
    },
  };
}
