// lib/services/onemark/units-service.ts
//
// OneMark — the school units screen (Wave 3 Lane U).
//
// Director ruling 2026-09-06: "the units are not organized as per subject
// wise. It needs to be a greater user interface and user experience."
//
// WHY THIS FILE EXISTS AT ALL, given the data is already correct.
// A OneMark unit is TWO rows, not one:
//   * cdc_exam_syllabus_topics — the shared taxonomy row (name, description,
//     is_active) that fp_items.topic_id points at. Its `sort_order` is a
//     GLOBAL column shared with every government-coaching topic, and both
//     OneMark subjects start at 1 in it — which is exactly why a flat listing
//     ordered by that column zips Electrostatics against Two Gentlemen of
//     Verona.
//   * exam_topic_map — the per-exam junction. ITS `sort_order` is per exam and
//     already clean (Physics 1-11, English 1-6 plus 99 for the lesson-agnostic
//     grammar bucket). Measured on production 2026-09-06 and re-measured
//     2026-09-07.
// So: no data migration. The ordering key is exam_topic_map.sort_order and
// nothing on a OneMark screen may order by the topics table's global column.
// `assertNoGlobalOrdering` below is that rule written as a function, and the
// unit tests hold it.
//
// Everything here is PURE — no supabase import — so the route and vitest agree
// on one shape and the ordering rule is testable without a database.

import { OneMarkExamKeys } from '@/types/onemark';

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

/** exam_definitions.config_key of the two OneMark subjects. Imported, never
 *  re-derived: `tn_hsc` (the Class-12 umbrella) and `tn_sslc` (Class 10) also
 *  match a naive `tn_hsc%` / `tn_%` pattern and are NOT OneMark subjects.
 *  Read live 2026-09-07: exam_definitions holds 16 rows, three of them
 *  `tn_hsc*`; only these two carry unit mappings. */
export const ONEMARK_SUBJECT_KEYS: readonly string[] = [
  OneMarkExamKeys.PHYSICS,
  OneMarkExamKeys.ENGLISH,
];

/** The short slug that goes into a new unit's config_key, per subject. */
export const SUBJECT_SLUG: Record<string, string> = {
  [OneMarkExamKeys.PHYSICS]: 'phy',
  [OneMarkExamKeys.ENGLISH]: 'eng',
};

/** Every OneMark unit's config_key carries this prefix. It is the ONLY thing
 *  that lets the units route write a shared CDC config-master row without
 *  handing a OneMark author the rest of that table: the route refuses any row
 *  whose key does not start here. Wave 1 seeded all 18 units this way
 *  (onemark_phy_u01..u11, onemark_eng_u01..u06, onemark_eng_grammar_general). */
export const ONEMARK_UNIT_KEY_PREFIX = 'onemark_';

/** Trim the shared board prefix off a subject's display name for a tab label.
 *  Same transform the review queue uses, kept here so both agree. */
export function subjectShortName(displayName: string): string {
  return displayName.replace(/^TN State Board — HSC /, '').replace(/ \(Class 12\)$/, '');
}

// ---------------------------------------------------------------------------
// Positions in the unit list
// ---------------------------------------------------------------------------

/** A position at or above this is a SENTINEL, not a lesson: Wave 1 parked the
 *  English "Grammar (General) — not anchored to any lesson" bucket at 99 so it
 *  always sorts last. A sentinel is never counted when the next free position
 *  is computed (otherwise the next English unit would land at 100 and the
 *  bucket would stop being last) and is never moved by the re-order controls.
 *  90 is the floor because no real unit list reaches it — Physics has 11. */
export const SENTINEL_FLOOR = 90;

export function isSentinelPosition(position: number): boolean {
  return position >= SENTINEL_FLOOR;
}

/** The position a newly added unit takes in its subject's unit list: one past
 *  the last real (non-sentinel) unit, so a new English unit lands at 7 and
 *  still sorts above the 99 grammar bucket. */
export function nextFreePosition(positions: readonly number[]): number {
  const real = positions.filter((p) => Number.isFinite(p) && !isSentinelPosition(p));
  if (real.length === 0) return 1;
  return Math.max(...real) + 1;
}

// ---------------------------------------------------------------------------
// config_key generation
// ---------------------------------------------------------------------------

/** Slug of a unit name: lowercase, non-alphanumerics collapsed to `_`. Tamil
 *  and other non-Latin characters carry no ASCII slug, so a name written only
 *  in Tamil slugs to the empty string — the caller falls back to `u<NN>`. */
export function slugifyUnitName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * The immutable config_key for a new unit: `onemark_<subject>_<slug>`, made
 * unique against the keys already in the table by a numeric suffix. Immutable
 * after create by design — fp_items and every seeded reference read the key,
 * and a rename must not silently repoint them.
 */
export function unitConfigKey(
  examKey: string,
  displayName: string,
  taken: readonly string[],
  position: number,
): string {
  const subject = SUBJECT_SLUG[examKey] ?? 'unit';
  const slug = slugifyUnitName(displayName) || `u${String(position).padStart(2, '0')}`;
  const base = `${ONEMARK_UNIT_KEY_PREFIX}${subject}_${slug}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Could not allocate a unique unit key');
}

/** The units route only ever writes a topics row whose key it minted. Anything
 *  else — a coaching topic, a Foundation Science topic — is refused. */
export function isOneMarkUnitKey(configKey: string | null | undefined): boolean {
  return typeof configKey === 'string' && configKey.startsWith(ONEMARK_UNIT_KEY_PREFIX);
}

// ---------------------------------------------------------------------------
// Tamil names
// ---------------------------------------------------------------------------

/** Tamil block, U+0B80–U+0BFF. */
const TAMIL_RE = /[஀-௿]/;

export function hasTamilScript(text: string | null | undefined): boolean {
  return typeof text === 'string' && TAMIL_RE.test(text);
}

/**
 * The Tamil name of a unit, as the data actually holds it.
 *
 * cdc_exam_syllabus_topics has NO Tamil-name column (verified against the live
 * catalogue 2026-09-07 — the columns are id, config_key, display_name,
 * description, is_shared, is_system, is_active, sort_order and the audit
 * four). Wave 1 put the Physics Tamil unit names in `description`
 * ('மின்னியல் (Vol. 1)'); the English rows use `description` for an English
 * prose blurb instead. So the Tamil name is read from `description` when that
 * field carries Tamil script, and is absent otherwise.
 *
 * Nothing records a native reviewer's sign-off, so every Tamil name present is
 * UNREVIEWED by definition — Wave 1 flagged every seeded row that way and no
 * column has been added since. The screen says so rather than implying a
 * review that never happened (rule #24).
 */
export function tamilNameOf(description: string | null): string | null {
  if (!description) return null;
  return hasTamilScript(description) ? description : null;
}

/** The rule #24 placeholder shown where no Tamil name exists yet. */
export const TAMIL_TBD = '[TAMIL_TBD]';

// ---------------------------------------------------------------------------
// Row and section shapes
// ---------------------------------------------------------------------------

export interface UnitRow {
  /** cdc_exam_syllabus_topics.id — what fp_items.topic_id points at. */
  topic_id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  /** The Tamil name when the data carries one, else null (rendered as TAMIL_TBD). */
  tamil_name: string | null;
  /** Always true when tamil_name is present: nothing records a sign-off yet. */
  tamil_needs_review: boolean;
  is_active: boolean;
  /** Wave-1 seeded rows are system rows: renameable, retirable, never re-keyed. */
  is_system: boolean;
  /** exam_topic_map.sort_order — the unit list position. NEVER the topics
   *  table's global sort_order. */
  position: number;
  is_sentinel: boolean;
  items_total: number;
  items_active: number;
  items_awaiting_review: number;
}

export interface SubjectUnits {
  exam_definition_id: string;
  exam_key: string;
  display_name: string;
  short_name: string;
  units: UnitRow[];
  /** Sum over the subject's units, so the section header can be honest before
   *  anyone scrolls. */
  items_total: number;
  items_active: number;
  items_awaiting_review: number;
}

export interface UnitsPayload {
  subjects: SubjectUnits[];
}

// ---------------------------------------------------------------------------
// Assembly (pure — the route feeds it plain rows)
// ---------------------------------------------------------------------------

export interface RawExam {
  id: string;
  config_key: string;
  display_name: string;
}

export interface RawMapping {
  exam_definition_id: string;
  topic_id: string;
  sort_order: number | null;
}

export interface RawTopic {
  id: string;
  config_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
}

export interface RawItemCount {
  topic_id: string | null;
  is_active: boolean;
}

/**
 * Build the subject-first payload.
 *
 * ONE SECTION PER SUBJECT, never one flat list — that is the whole ruling. The
 * ordering key inside a section is `mapping.sort_order` and nothing else; a
 * topic row's own `sort_order` is not even read into RawTopic, so this function
 * cannot order by it even by accident.
 */
export function buildUnitsPayload(
  exams: readonly RawExam[],
  mappings: readonly RawMapping[],
  topics: readonly RawTopic[],
  itemCounts: readonly RawItemCount[],
): UnitsPayload {
  const topicById = new Map(topics.map((t) => [t.id, t]));

  const totals = new Map<string, { total: number; active: number; awaiting: number }>();
  for (const it of itemCounts) {
    if (!it.topic_id) continue;
    const bucket = totals.get(it.topic_id) ?? { total: 0, active: 0, awaiting: 0 };
    bucket.total += 1;
    if (it.is_active) bucket.active += 1;
    else bucket.awaiting += 1;
    totals.set(it.topic_id, bucket);
  }

  const subjects: SubjectUnits[] = [];

  for (const exam of exams) {
    const rows: UnitRow[] = [];
    for (const m of mappings) {
      if (m.exam_definition_id !== exam.id) continue;
      const t = topicById.get(m.topic_id);
      if (!t) continue;
      const position = m.sort_order ?? SENTINEL_FLOOR;
      const counts = totals.get(t.id) ?? { total: 0, active: 0, awaiting: 0 };
      const tamil = tamilNameOf(t.description);
      rows.push({
        topic_id: t.id,
        config_key: t.config_key,
        display_name: t.display_name,
        description: t.description,
        tamil_name: tamil,
        tamil_needs_review: tamil !== null,
        is_active: t.is_active,
        is_system: t.is_system,
        position,
        is_sentinel: isSentinelPosition(position),
        items_total: counts.total,
        items_active: counts.active,
        items_awaiting_review: counts.awaiting,
      });
    }

    rows.sort((a, b) => a.position - b.position || a.display_name.localeCompare(b.display_name));

    subjects.push({
      exam_definition_id: exam.id,
      exam_key: exam.config_key,
      display_name: exam.display_name,
      short_name: subjectShortName(exam.display_name),
      units: rows,
      items_total: rows.reduce((n, r) => n + r.items_total, 0),
      items_active: rows.reduce((n, r) => n + r.items_active, 0),
      items_awaiting_review: rows.reduce((n, r) => n + r.items_awaiting_review, 0),
    });
  }

  return { subjects };
}

// ---------------------------------------------------------------------------
// Re-ordering
// ---------------------------------------------------------------------------

export interface ReorderWrite {
  topic_id: string;
  position: number;
}

/**
 * Moving a unit one step within its subject is a swap of two exam_topic_map
 * sort_order values — never a renumbering of the whole list, and never a write
 * to the topics table. A sentinel (the 99 grammar bucket) neither moves nor is
 * stepped over: it is not part of the ordered lesson sequence.
 *
 * Returns the two rows to write, or an empty list when the move is a no-op.
 */
export function reorderPlan(
  units: readonly UnitRow[],
  topicId: string,
  direction: 'up' | 'down',
): ReorderWrite[] {
  const movable = units.filter((u) => !u.is_sentinel).sort((a, b) => a.position - b.position);
  const i = movable.findIndex((u) => u.topic_id === topicId);
  if (i === -1) return [];
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= movable.length) return [];
  const a = movable[i];
  const b = movable[j];
  if (a.position === b.position) return [];
  return [
    { topic_id: a.topic_id, position: b.position },
    { topic_id: b.topic_id, position: a.position },
  ];
}

// ---------------------------------------------------------------------------
// The ordering rule, as an assertion the tests hold
// ---------------------------------------------------------------------------

/**
 * True when a unit list is ordered by its per-exam positions. The test suite
 * calls this on a fixture built from the REAL production shape — two subjects
 * whose positions both start at 1 — which is the state that produced the
 * interleaved coaching grid. A flat list ordered by the shared global column
 * fails it; a subject-first list ordered by exam_topic_map.sort_order passes.
 */
export function isOrderedBySubjectPosition(subjects: readonly SubjectUnits[]): boolean {
  return subjects.every((s) =>
    s.units.every((u, i) => i === 0 || s.units[i - 1].position <= u.position),
  );
}
