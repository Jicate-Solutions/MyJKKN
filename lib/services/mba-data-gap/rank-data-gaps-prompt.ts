/**
 * MBA Data-Gap ranking — the prompt builder (pure, no I/O).
 * ============================================================================
 *
 * Extracted from app/api/cron/rank-data-gaps/route.ts so the ranking prompt is
 * unit-testable. The route keeps all I/O (collect/submit, DB reads, enqueue);
 * this module is a pure function of its inputs.
 *
 * Phase 4 (feed-forward / explore wire — the moat hop): the prompt now carries a
 * per-area TRACK RECORD alongside the frequency signal it already carried. A
 * closed gap is measured (did the new data produce an APPLIED improvement?), and
 * that measured hit-rate feeds the NEXT ranking — the edge that turns a backlog
 * into a self-improving loop (mirrors the SCF loop). The weighting is
 * explore/exploit:
 *   - PROVEN areas (high hit-rate) rank UP  — acting there has paid off (exploit).
 *   - UNPROVEN areas (0 accepted gaps yet)  rank UP — a fair shot so the
 *     institution learns whether they pay off (explore). This is what lights up
 *     the dark departments; never bury an area just because it is untried.
 *   - Only areas TRIED REPEATEDLY with a low hit-rate rank DOWN.
 */

export const GAP_CLASSES = [
  'type_a_surface',
  'type_b_capture',
  'uncertain',
] as const;
export type GapClass = (typeof GAP_CLASSES)[number];

export interface RankableGap {
  id: string;
  institution_id: string | null;
  area_id: string;
  gap_type: string;
  title: string;
  what_missing: string | null;
  what_analysis: string | null;
  what_decision: string | null;
}

/**
 * One area's measured track record — mirrors fn_mba_gap_area_hit_rate exactly,
 * but the cron computes it inline from mba_data_gaps (service-role read) so the
 * loop does NOT depend on that RPC's grant. Task 4 gates the RPC to managers;
 * computing here keeps the ranker working regardless.
 */
export interface AreaTrackRecord {
  accepted: number;
  produced: number;
  hit_rate_pct: number | null;
}

// Why the filer thinks the data is missing → a short phrase for the prompt.
export const GAP_TYPE_HINT: Record<string, string> = {
  not_captured: 'filer believes it is not recorded anywhere',
  not_surfaced: 'filer believes it is recorded but has no view/report',
  unsure: 'filer is unsure whether it is recorded',
};

/**
 * The explore/exploit signal for one area, in one line. An area with no measured
 * track record (undefined, or 0 accepted gaps) reads as UNPROVEN and is told to
 * explore — so a never-tried department is nudged up, not buried.
 */
export function areaTrackRecordLine(track: AreaTrackRecord | undefined): string {
  if (!track || track.accepted === 0) {
    return 'no accepted gaps here yet — UNPROVEN (give it a fair shot: explore)';
  }
  const pct = track.hit_rate_pct ?? 0;
  return `${track.produced} of ${track.accepted} accepted gaps in this area led to an applied improvement (${pct}% hit-rate)`;
}

export function buildRankingPrompt(
  gaps: RankableGap[],
  areaLabel: Map<string, string>,
  areaFreq: Map<string, number>,
  areaTrack: Map<string, AreaTrackRecord>,
): string {
  const blocks = gaps
    .map((g, i) => {
      const label = areaLabel.get(g.area_id) ?? 'Department';
      const freq = areaFreq.get(g.area_id) ?? 1;
      const track = areaTrackRecordLine(areaTrack.get(g.area_id));
      return `[${i + 1}] gap_id: ${g.id}
    Title: ${g.title}
    Department / area: ${label}
    Different people blocked on this area (frequency signal): ${freq}
    Track record for this area (explore/exploit signal): ${track}
    Filer's read on why it is missing: ${GAP_TYPE_HINT[g.gap_type] ?? g.gap_type}
    What data is missing: ${g.what_missing?.trim() || '(not stated)'}
    What analysis it would enable: ${g.what_analysis?.trim() || '(not stated)'}
    What decision it would inform: ${g.what_decision?.trim() || '(not stated)'}`;
    })
    .join('\n\n');

  return `You are a prioritisation assistant for an Indian higher-education institution's Improvement Board. Below are DATA GAPS filed by management learners (Associates): each names data the institution is not analysing, what analysis it would enable, and what decision it would inform.

For EVERY gap assign:
- rank: unique integer 1..N, where 1 = highest priority to act on.
- value: integer 1-5 (5 = would inform the most important decisions).
- feasibility: integer 1-5 (5 = easiest to surface or capture).
- gap_class: EXACTLY one of:
    "type_a_surface" — the data almost certainly ALREADY EXISTS in a campus system (attendance, fees, LMS, admissions, HR, exams, etc.) and just needs a view or report to be surfaced.
    "type_b_capture" — the institution genuinely DOES NOT record this yet, so a new capture/form/field would have to be built first.
    "uncertain" — it is unclear from what was filed whether the data already exists.
- reason: ONE short sentence (max 200 characters) on why it sits where it does and why that class.

Prioritise gaps that would inform important decisions, are feasible to act on, and recur across many people (a higher frequency signal means more DIFFERENT Associates are blocked on this area, not one person filing repeatedly).

Track record (explore/exploit) — each gap shows whether past ACCEPTED gaps in its area went on to produce a real applied improvement:
- Rank UP areas with a PROVEN track record (a high hit-rate): acting on them has paid off before (exploit).
- Rank UP areas that are UNPROVEN (no accepted gaps yet): they deserve a fair shot so the institution learns whether they pay off (explore). Never bury a department just because it is new or untried — an unproven area should rank ABOVE an area that has been tried repeatedly and rarely produced an improvement.
- Rank DOWN only areas that have been TRIED REPEATEDLY and still rarely produced an improvement (many accepted, low hit-rate).

Use ONLY the information given; do not invent facts. Include EVERY gap_id exactly once and use the EXACT gap_id strings shown.

Return ONLY valid JSON (no markdown, no code fences, no commentary), exactly:
{ "rankings": [ { "gap_id": "<uuid>", "rank": <int>, "value": <int>, "feasibility": <int>, "gap_class": "type_a_surface|type_b_capture|uncertain", "reason": "..." } ] }

DATA GAPS:
${blocks}

Return the JSON now.`;
}
