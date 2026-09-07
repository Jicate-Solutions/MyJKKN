// File: lib/services/onemark/sources-draw.ts
//
// OneMark — "draw my practice from these sources only".
//
// Director ruling (c) of 2026-09-06: a learner may pick sources in practice and
// in vault review, not only a Senior Learner building a paper. Three things have
// to happen when they do, and all three are decided here so that the route that
// performs them (POST /api/foundation/onemark/attempts — LANE L's file) stays a
// few lines longer rather than a few rules cleverer:
//
//   1. the practice pool is narrowed to the ticked sources;
//   2. the vault draw goes to `fn_onemark_vault_draw`'s FOUR-argument overload
//      instead of the three-argument one (Lane S3 item 9);
//   3. what was ticked is written onto `fp_attempts.config.source_keys`, because
//      `fn_onemark_source_analytics` reads it back to know what a learner asked
//      for — a sitting that does not record its filter is a sitting the evidence
//      screen cannot use.
//
// TWO TRAPS THIS FILE EXISTS TO AVOID
//   · Ticking nothing must mean EVERY source, never an empty sitting. A bare
//     `.in('source_key', [])` returns zero rows and looks exactly like a bank
//     with no questions in it.
//   · A non-empty filter EXCLUDES questions whose origin was never recorded.
//     That is deliberate and matches the 4-argument RPC's own comment: "not
//     recorded" is not one of the sources a learner picked. With 126 questions
//     and no origin on any of them (production, 2026-09-07), a tick today
//     narrows to nothing — which is why the caller must say so out loud instead
//     of serving a silent short draw.
//
// Pure functions only. Unit-tested in __tests__/onemark/sources-draw.test.ts.

import { normalizeSourceKeys } from './sources-service';

/** What a sitting recorded about the sources it was drawn from. */
export interface AttemptSourceConfig {
  /** Absent or empty = every source. */
  source_keys?: string[];
  [key: string]: unknown;
}

/** Read `source_keys` off a request body, keeping only keys that exist.
 *  An unknown key is DROPPED rather than refused: a stale chip in an old tab
 *  should narrow to what is real, not fail the sitting. Ticking every source
 *  normalises back to the empty list, so what gets stored says "all" the same
 *  way whether the person ticked all or ticked none. */
export function requestedSourceKeys(body: unknown, knownKeys: readonly string[]): string[] {
  if (!body || typeof body !== 'object') return [];
  return normalizeSourceKeys((body as Record<string, unknown>).source_keys, knownKeys);
}

/** The keys to hand PostgREST's `.in('source_key', …)`, or null for no filter.
 *  Null is the whole point: the caller must skip the `.in()` entirely rather
 *  than pass an empty array. */
export function practiceSourceFilter(keys: readonly string[]): string[] | null {
  return keys.length === 0 ? null : [...keys];
}

/** The argument object for `fn_onemark_vault_draw`. With no filter this is the
 *  live THREE-argument call Lane V already makes, untouched; with a filter it
 *  is Lane S3's four-argument overload. Both are gated identically by
 *  `fn_fp_can_view_student`. */
export function vaultDrawArgs(input: {
  studentId: string;
  examDefinitionId: string;
  count: number;
  sourceKeys: readonly string[];
}): Record<string, unknown> {
  const base = {
    p_student_id: input.studentId,
    p_exam_definition_id: input.examDefinitionId,
    p_count: input.count,
  };
  if (input.sourceKeys.length === 0) return base;
  return { ...base, p_source_keys: [...input.sourceKeys] };
}

/** True when the call above will hit the four-argument overload — which does not
 *  exist until Lane S3's migration is applied. A caller uses this to decide
 *  whether a "could not find the function" error means "vault review is off" or
 *  "filtering by source is not switched on yet", two very different sentences. */
export function usesSourceOverload(sourceKeys: readonly string[]): boolean {
  return sourceKeys.length > 0;
}

/** Merge the chosen keys into the sitting's config. An empty choice REMOVES the
 *  key rather than storing `[]`, so "every source" reads the same in the row as
 *  it does in every sitting recorded before this feature existed. */
export function withSourceConfig(
  existing: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): AttemptSourceConfig {
  const out: AttemptSourceConfig = { ...(existing ?? {}) };
  if (keys.length === 0) {
    delete out.source_keys;
    return out;
  }
  out.source_keys = [...keys];
  return out;
}

/** Read the filter back off a stored sitting, for a review screen that wants to
 *  say what this sitting was drawn from. Anything malformed reads as "all". */
export function sourceKeysFromConfig(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const raw = (config as Record<string, unknown>).source_keys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === 'string' && k !== '');
}

/** The sentence a learner sees when their tick left too few questions. Said out
 *  loud, with the filter named, because a short draw with no explanation reads
 *  as a broken bank (decision 11's idiom: show the real number). */
export function shortDrawMessage(input: {
  requested: number;
  served: number;
  sourceLabels: readonly string[];
}): string | null {
  if (input.served >= input.requested || input.sourceLabels.length === 0) return null;
  const list =
    input.sourceLabels.length === 1
      ? input.sourceLabels[0]
      : `${input.sourceLabels.slice(0, -1).join(', ')} and ${input.sourceLabels[input.sourceLabels.length - 1]}`;
  if (input.served === 0) {
    return `No questions are available from ${list} yet. Untick it to draw from every source.`;
  }
  return `Only ${input.served} of the ${input.requested} questions you asked for are available from ${list}. You have been given those — never questions from somewhere else.`;
}
