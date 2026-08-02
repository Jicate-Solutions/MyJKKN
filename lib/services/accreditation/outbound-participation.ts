// lib/services/accreditation/outbound-participation.ts
// ============================================================================
// Outbound learner participation — the half of the sports and cultural evidence
// that hosting an event can never show.
//
// WHY THIS EXISTS
// The CAC sports and cultural metrics are computed from `events` joined to
// `events_registrations`: what the cluster HOSTS. A learner who travels to a
// state-level tournament and places therefore earns the institution nothing,
// because no `events` row was ever created for someone else's tournament. The
// participation is real, recorded, and structurally invisible. This module is
// the read that makes it countable.
//
// WHERE OUTBOUND PARTICIPATION ACTUALLY LIVES
// `health_sports_achievements` — one row per award a learner entered at
// /health/achievements, or that the tournament finaliser wrote for them
// (fn_award_achievements). It carries `event_level`, a `category`
// (sports / academic / cultural / other, widened 2026-07-26) and a `verified`
// flag, and it has NO institution column: the institution is resolved through
// the learner's profile, exactly as the NAAC evidence fan-out trigger
// (emit_learner_achievement_evidence) already does.
//
// WHY "ABOVE THE INSTITUTION" IS THE FILTER AND NOT `verified`
// `intra_college` is the only level that is inside the institution, and an
// in-house meet is already a hosted `events` row — counting it here would
// report one activity twice. Every other level is somewhere the learner had to
// travel to, so all of them are outbound. `district` is included for that
// reason and not merely because it is on the list.
//
// WHY VERIFIED AND UNVERIFIED ARE KEPT APART RATHER THAN SUMMED
// Rows are self-entered by default. Verification is an IQAC act, and the
// evidence fan-out only emits for `verified = true` — an unverified row is a
// claim, not evidence. A single total would let a claim be read as a finding.
// Both counts are returned; neither is added to the other.
//
// HONEST STATE, 2026-07-30
// `health_sports_achievements` held exactly ONE row platform-wide: an
// inter_college badminton silver, category 'sports', verified = false. So this
// read is a real path over an effectively empty source. It stops participation
// from being invisible; it does not yet show broad participation, and nothing
// here should be read as claiming it does.
//
// A WARNING FOR WHOEVER WIRES THIS TO A SCREEN
// A denied row-level read on this table returns 200 with an empty array, not an
// error — indistinguishable from "there is genuinely nothing". That is why the
// read returns a discriminated result and why `describeOutboundParticipation`
// has no zero wording: rendering an empty read as "none recorded" would
// manufacture a measured-empty claim out of a permission the viewer lacks,
// which is the one mistake the CAC page exists to avoid. Prefer surfacing this
// through a permission-gated SECURITY DEFINER read (which raises 42501 on
// denial) over a direct table read from the browser.
//
// Pure except for `readOutboundParticipation`, which takes its data source as
// an argument so the shaping is testable without a database.
// ============================================================================

/**
 * Levels that put the learner outside their own institution.
 *
 * Deliberately NOT derived from SportLevel by exclusion: an added level should
 * make someone decide whether it is outbound, not inherit an answer.
 */
export const OUTBOUND_EVENT_LEVELS = [
  'inter_college',
  'district',
  'state',
  'national',
  'international',
] as const;

export type OutboundEventLevel = (typeof OUTBOUND_EVENT_LEVELS)[number];

/** The one level that is inside the institution, and so is never outbound. */
export const INTERNAL_EVENT_LEVEL = 'intra_college';

/**
 * The date the source was last counted by hand. Stamped so a reader knows the
 * observation below is dated rather than live.
 */
export const OUTBOUND_OBSERVED_ON = '2026-07-30';

export function isOutboundLevel(
  level: string | null | undefined,
): level is OutboundEventLevel {
  if (!level) return false;
  const normalised = level.trim().toLowerCase();
  return (OUTBOUND_EVENT_LEVELS as readonly string[]).includes(normalised);
}

/** One achievement, after the learner's institution has been resolved. */
export interface OutboundAchievementRow {
  learnerId: string;
  eventLevel: string;
  category: string;
  verified: boolean;
  /** null when the learner has no institution on file — kept, never dropped. */
  institutionId: string | null;
}

/**
 * What one institution has outbound, in one category.
 *
 * `verified` and `awaitingVerification` are counts of rows; `learners` counts
 * distinct people, because ten awards to one learner is not ten learners
 * participating and the difference is the whole point of the metric.
 */
export interface OutboundParticipationSummary {
  institutionId: string | null;
  category: string;
  verified: number;
  awaitingVerification: number;
  learners: number;
  levels: OutboundEventLevel[];
}

/**
 * The shape PostgREST returns for the embedded learner profile.
 *
 * A to-one embed comes back as an object, but the same relationship returns an
 * array when PostgREST cannot prove it is to-one — and this table has several
 * FK paths to views over `learners_profiles`. Both shapes are handled because
 * guessing wrong drops every row silently.
 */
type EmbeddedProfile =
  | { institution_id?: string | null }
  | Array<{ institution_id?: string | null }>
  | null
  | undefined;

interface RawAchievement {
  learner_id?: string | null;
  event_level?: string | null;
  category?: string | null;
  verified?: boolean | null;
  learners_profiles?: EmbeddedProfile;
}

function institutionOf(embed: EmbeddedProfile): string | null {
  if (!embed) return null;
  const first = Array.isArray(embed) ? embed[0] : embed;
  return first?.institution_id ?? null;
}

/**
 * Raw rows to typed rows, keeping only outbound levels.
 *
 * A row with no learner id is dropped — it cannot be attributed to anyone, so
 * counting it would inflate the learner count with a ghost.
 */
export function normaliseAchievementRows(
  raw: readonly unknown[],
): OutboundAchievementRow[] {
  const rows: OutboundAchievementRow[] = [];
  for (const item of raw) {
    const row = (item ?? {}) as RawAchievement;
    if (!row.learner_id || !isOutboundLevel(row.event_level)) continue;
    rows.push({
      learnerId: row.learner_id,
      eventLevel: String(row.event_level).trim().toLowerCase(),
      category: (row.category ?? 'sports').trim().toLowerCase(),
      verified: row.verified === true,
      institutionId: institutionOf(row.learners_profiles),
    });
  }
  return rows;
}

/** Key an institution-and-category pair. `null` institution keeps its own row. */
function summaryKey(institutionId: string | null, category: string): string {
  return `${institutionId ?? '__no_institution__'}::${category}`;
}

/**
 * Group rows by institution and category.
 *
 * Rows whose learner has no institution on file are grouped under a null
 * institution rather than discarded: they are participation that happened, and
 * the missing profile link is a data gap someone should see.
 */
export function summariseOutboundParticipation(
  rows: readonly OutboundAchievementRow[],
): Map<string, OutboundParticipationSummary> {
  const learners = new Map<string, Set<string>>();
  const levels = new Map<string, Set<OutboundEventLevel>>();
  const out = new Map<string, OutboundParticipationSummary>();

  for (const row of rows) {
    const key = summaryKey(row.institutionId, row.category);
    let summary = out.get(key);
    if (!summary) {
      summary = {
        institutionId: row.institutionId,
        category: row.category,
        verified: 0,
        awaitingVerification: 0,
        learners: 0,
        levels: [],
      };
      out.set(key, summary);
      learners.set(key, new Set());
      levels.set(key, new Set());
    }
    if (row.verified) summary.verified += 1;
    else summary.awaitingVerification += 1;
    learners.get(key)!.add(row.learnerId);
    if (isOutboundLevel(row.eventLevel)) levels.get(key)!.add(row.eventLevel);
  }

  for (const [key, summary] of out) {
    summary.learners = learners.get(key)!.size;
    // Reported in the declared order so two institutions with the same set read
    // the same way, rather than in whichever order rows happened to arrive.
    summary.levels = OUTBOUND_EVENT_LEVELS.filter((l) =>
      levels.get(key)!.has(l),
    );
  }
  return out;
}

/** One institution's outbound summary for one category, or undefined. */
export function outboundFor(
  summaries: Map<string, OutboundParticipationSummary>,
  institutionId: string,
  category: string,
): OutboundParticipationSummary | undefined {
  return summaries.get(summaryKey(institutionId, category));
}

/**
 * The line a screen can print beside a hosted-event count.
 *
 * Returns null when there is nothing to say, rather than a zero sentence. An
 * absent summary means either "nothing recorded" or "this reader may not read
 * that table", and the two are indistinguishable from here — so this function
 * declines to characterise it and leaves the wording to the caller, which knows
 * whether its read was permitted.
 */
export function describeOutboundParticipation(
  summary: OutboundParticipationSummary | undefined,
): string | null {
  if (!summary) return null;
  const total = summary.verified + summary.awaitingVerification;
  if (total === 0) return null;

  const people = `${summary.learners} learner${summary.learners === 1 ? '' : 's'}`;
  const parts = [`${total} outbound (${people})`];
  if (summary.verified > 0) parts.push(`${summary.verified} verified`);
  if (summary.awaitingVerification > 0) {
    parts.push(`${summary.awaitingVerification} awaiting verification`);
  }
  if (summary.levels.length > 0) parts.push(summary.levels.join(', '));
  return parts.join(' · ');
}

/** Either the rows, or why there are none — never an ambiguous empty array. */
export type OutboundReadResult =
  | { ok: true; rows: OutboundAchievementRow[] }
  | { ok: false; message: string };

/**
 * The minimum of a PostgREST client this read needs.
 *
 * Declared structurally rather than importing the generated Database types: the
 * generated types do not yet carry the `category` column that migration
 * 20260726114500 added and production has, so a typed client would reject a
 * column that exists.
 */
export interface OutboundAchievementSource {
  from(table: string): {
    select(columns: string): {
      in(
        column: string,
        values: readonly string[],
      ): PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/** The columns read. The learner's identity is never selected — only the id. */
const OUTBOUND_SELECT =
  'learner_id, event_level, category, verified, learners_profiles(institution_id)';

/**
 * Read outbound achievements at levels above the institution.
 *
 * The level filter is applied in the query rather than after it, so an
 * institution's own intra-college meets are never transferred over the wire and
 * cannot be double-counted against the hosted-event total by a later caller.
 */
export async function readOutboundParticipation(
  source: OutboundAchievementSource,
): Promise<OutboundReadResult> {
  const { data, error } = await source
    .from('health_sports_achievements')
    .select(OUTBOUND_SELECT)
    .in('event_level', OUTBOUND_EVENT_LEVELS);

  if (error) return { ok: false, message: error.message };
  return { ok: true, rows: normaliseAchievementRows(data ?? []) };
}
