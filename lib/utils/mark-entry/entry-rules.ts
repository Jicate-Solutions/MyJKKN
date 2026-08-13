/**
 * Question-wise CIA entry rules.
 *
 * Pure functions, no I/O — the same module runs in the grid (to disable cells and
 * show inline errors) and in the API route (to reject a stale tab or a direct
 * API call). COE re-validates on its side too; this is the mirror, not the
 * authority.
 *
 * Three rules, all from the COE port spec §2:
 *   1. A question's mark cannot exceed its own `marks`.
 *   2. Only ONE branch of an OR pair may be answered.
 *   3. A part's "answer any N" limit is counted in GROUPS, not questions —
 *      an OR pair is one answer.
 *
 * Deliberately NOT a rule: `sum(all question marks) > component max`. With choice
 * questions a paper totalling 55 can feed a 30-mark component, so that comparison
 * is normal. What IS checked is the learner's actual sum against the component
 * max, which the answer-any-N limit keeps in range.
 */

import type {
  AttainmentSummary,
  EntryPart,
  EntryQuestion,
  LearnerEntry,
  LockReason,
} from '@/types/mark-entry';
import type { IaPaperQuestion, IaTemplatePart } from '@/types/ia-question-paper';

/** `${part_label}|${question_number}` — the OR-pair identity. */
export function choiceGroupOf(partLabel: string, questionNumber: number): string {
  return `${partLabel}|${questionNumber}`;
}

/**
 * Reshapes a COE paper detail into the entry shape.
 *
 * This is COE gap #2 closed client-side: `/api/v1/ia/question-papers/{id}`
 * returns `questions` and `template_parts` but not `choice_group` /
 * `group_count` / a normalised `num_to_answer`, all of which are derivable from
 * what it does return. If COE later exposes `?for=mark-entry`, swap this for the
 * server-computed payload — the output shape is identical by design.
 */
export function buildEntryPaper(
  questions: IaPaperQuestion[],
  templateParts: IaTemplatePart[]
): { questions: EntryQuestion[]; parts: EntryPart[]; questionsTotal: number } {
  const sorted = [...(questions ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );

  const entryQuestions: EntryQuestion[] = sorted.map((q) => {
    const partLabel = q.part_label ?? '—';
    return {
      id: q.id,
      label: `${q.question_number}${q.sub_label ?? ''}`,
      part_label: partLabel,
      question_number: q.question_number,
      sub_label: q.sub_label,
      choice_group: choiceGroupOf(partLabel, q.question_number),
      marks: Number(q.marks ?? 0),
      is_choice_alternative: !!q.is_choice_alternative,
      co_code: q.co_code,
      k_level: q.k_level,
      question_text: q.question_text,
      display_order: q.display_order ?? 0,
    };
  });

  // Parts in the order the questions introduce them — the paper's own order, not
  // the template's, so the colour sequence matches what the reader sees.
  const partOrder: string[] = [];
  const groupsByPart = new Map<string, Set<string>>();
  for (const q of entryQuestions) {
    if (!groupsByPart.has(q.part_label)) {
      groupsByPart.set(q.part_label, new Set());
      partOrder.push(q.part_label);
    }
    groupsByPart.get(q.part_label)!.add(q.choice_group);
  }

  const templateByLabel = new Map<string, IaTemplatePart>();
  for (const p of templateParts ?? []) templateByLabel.set(p.part_label, p);

  const parts: EntryPart[] = partOrder.map((label) => {
    const tpl = templateByLabel.get(label);
    const groupCount = groupsByPart.get(label)!.size;
    const raw = Number(tpl?.num_to_answer ?? 0);
    // A restriction only binds when it is a real one. num_to_answer of 0, null,
    // or >= num_questions means "answer all" — recording it as a limit would
    // wrongly lock the last cell of an unrestricted part.
    const numQuestions = Number(tpl?.num_questions ?? groupCount);
    const restricted = raw > 0 && raw < numQuestions;
    return { part_label: label, group_count: groupCount, num_to_answer: restricted ? raw : null };
  });

  const questionsTotal = entryQuestions.reduce((sum, q) => sum + q.marks, 0);
  return { questions: entryQuestions, parts, questionsTotal };
}

/** Distinct choice groups in a part that currently hold a mark. */
function answeredGroups(
  partLabel: string,
  questions: EntryQuestion[],
  marks: Record<string, number>
): Set<string> {
  const groups = new Set<string>();
  for (const q of questions) {
    if (q.part_label !== partLabel) continue;
    if (marks[q.id] != null) groups.add(q.choice_group);
  }
  return groups;
}

/**
 * Why (if at all) a cell is locked for one learner.
 *
 * A question that ALREADY holds a mark is never locked — otherwise a learner's
 * answer could not be cleared to switch to the other branch of an OR pair, and
 * the grid would be a one-way door.
 */
export function lockReasonFor(
  question: EntryQuestion,
  questions: EntryQuestion[],
  parts: EntryPart[],
  marks: Record<string, number>
): LockReason {
  if (marks[question.id] != null) return null;

  const siblingAnswered = questions.some(
    (q) =>
      q.id !== question.id &&
      q.choice_group === question.choice_group &&
      marks[q.id] != null
  );
  if (siblingAnswered) return 'or-sibling';

  const part = parts.find((p) => p.part_label === question.part_label);
  if (part?.num_to_answer != null) {
    const answered = answeredGroups(question.part_label, questions, marks);
    // Groups already at the limit — but only lock groups that aren't themselves
    // one of the answered ones (that case is caught by the marks[id] check above
    // for this question, and by or-sibling for its partner).
    if (!answered.has(question.choice_group) && answered.size >= part.num_to_answer) {
      return 'answer-limit';
    }
  }
  return null;
}

/** The learner's component mark — always the plain sum of what was entered. */
export function sumMarks(marks: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(marks)) total += Number(v) || 0;
  return total;
}

/** Strips empty / non-numeric values so an unattempted question is an ABSENT key. */
export function compactMarks(marks: Record<string, number | '' | null | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(marks)) {
    if (v === '' || v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[id] = n;
  }
  return out;
}

export interface ValidationIssue {
  studentId?: string;
  registerNumber?: string;
  message: string;
}

/**
 * Validates ONE learner's marks against the paper. Returns [] when clean.
 *
 * Whole numbers are enforced because `cia_marks` component columns are INTEGER:
 * a 0.5 would round in the component total while surviving exactly in the JSONB
 * breakdown, so the sum invariant would quietly break.
 */
export function validateLearnerMarks(
  marks: Record<string, number>,
  questions: EntryQuestion[],
  parts: EntryPart[],
  componentMax: number
): string[] {
  const errors: string[] = [];
  const byId = new Map(questions.map((q) => [q.id, q]));

  for (const [id, value] of Object.entries(marks)) {
    const q = byId.get(id);
    if (!q) {
      errors.push(`Unknown question ${id} — the paper may have changed; reload before saving`);
      continue;
    }
    if (!Number.isInteger(value)) {
      errors.push(`Q${q.label} mark (${value}) must be a whole number`);
      continue;
    }
    if (value < 0) errors.push(`Q${q.label} mark cannot be negative`);
    if (value > q.marks) {
      errors.push(`Q${q.label} mark (${value}) exceeds question max (${q.marks})`);
    }
  }

  // One branch per OR pair.
  const groupHits = new Map<string, string[]>();
  for (const id of Object.keys(marks)) {
    const q = byId.get(id);
    if (!q) continue;
    const list = groupHits.get(q.choice_group) ?? [];
    list.push(q.label);
    groupHits.set(q.choice_group, list);
  }
  for (const labels of groupHits.values()) {
    if (labels.length > 1) {
      errors.push(
        `only one of ${labels.map((l) => `Q${l}`).join(' / ')} may be answered (OR choice)`
      );
    }
  }

  // Answer-any-N, counted in groups.
  for (const part of parts) {
    if (part.num_to_answer == null) continue;
    const answered = answeredGroups(part.part_label, questions, marks);
    if (answered.size > part.num_to_answer) {
      errors.push(
        `Part ${part.part_label}: ${answered.size} answered, limit is ${part.num_to_answer}`
      );
    }
  }

  const total = sumMarks(marks);
  if (componentMax > 0 && total > componentMax) {
    errors.push(`total (${total}) exceeds component max (${componentMax})`);
  }

  return errors;
}

/**
 * Class-level CO and Bloom attainment across every learner entered.
 *
 * Only ENTERED marks contribute to both numerator and denominator. That is what
 * makes the number honest under answer-any-N: a question the learner was never
 * allowed to answer must not drag their CO down, and an unattempted optional
 * question is not a zero — it is absent. A CO appearing only on optional
 * questions therefore has a smaller denominator, which is correct but worth
 * knowing when reading the bar.
 */
export function computeAttainment(
  learners: LearnerEntry[],
  questions: EntryQuestion[]
): AttainmentSummary {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const co = new Map<string, { obtained: number; max: number }>();
  const k = new Map<string, { obtained: number; max: number }>();
  let learnersEntered = 0;

  for (const learner of learners) {
    const ids = Object.keys(learner.marks);
    if (ids.length === 0) continue;
    learnersEntered++;
    for (const id of ids) {
      const q = byId.get(id);
      if (!q) continue;
      const value = Number(learner.marks[id]) || 0;
      if (q.co_code) {
        const bucket = co.get(q.co_code) ?? { obtained: 0, max: 0 };
        bucket.obtained += value;
        bucket.max += q.marks;
        co.set(q.co_code, bucket);
      }
      if (q.k_level) {
        const bucket = k.get(q.k_level) ?? { obtained: 0, max: 0 };
        bucket.obtained += value;
        bucket.max += q.marks;
        k.set(q.k_level, bucket);
      }
    }
  }

  const toBuckets = (map: Map<string, { obtained: number; max: number }>) =>
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([key, v]) => ({
        key,
        obtained: v.obtained,
        max: v.max,
        percentage: v.max > 0 ? Math.round((v.obtained / v.max) * 1000) / 10 : null,
      }));

  return {
    co: toBuckets(co),
    kLevel: toBuckets(k),
    learnersEntered,
    learnersTotal: learners.length,
  };
}

/**
 * Paper statuses marks may be entered against.
 *
 * Drafts are EXCLUDED, and this is a COE-enforced gate, not a preference: a draft
 * can still be re-authored or rebuilt from its template (`regenerate`), which
 * mints new question ids. Marks keyed against it would then point at questions
 * that no longer exist, with nothing to detect the orphaning. Filtering here
 * means the user never gets as far as typing into a grid COE would reject.
 */
export const ENTRY_ELIGIBLE_STATUSES = new Set(['submitted', 'approved', 'locked']);

export function isEntryEligible(status: string | undefined): boolean {
  return !!status && ENTRY_ELIGIBLE_STATUSES.has(status);
}

/**
 * Ranks candidate papers for a course + session + round.
 *
 * Drops, in order:
 *   - papers stamped with a DIFFERENT cia_setting_id (they belong to another
 *     assessment);
 *   - papers whose status is not entry-eligible (draft).
 *
 * Then orders: current-setting papers first, then those with no setting (the
 * normal case — the generator writes `cia_setting_id || null` and the Question
 * Papers UI never sends one), then authored before unauthored, then higher
 * status, then lowest set_number.
 */
const STATUS_RANK: Record<string, number> = {
  locked: 0,
  approved: 1,
  submitted: 2,
};

export function rankPapers<
  T extends {
    cia_setting_id?: string | null;
    status: string;
    set_number: number;
    authored?: boolean;
  },
>(papers: T[], ciaSettingId?: string): T[] {
  return papers
    .filter((p) => !p.cia_setting_id || !ciaSettingId || p.cia_setting_id === ciaSettingId)
    .filter((p) => isEntryEligible(p.status))
    .sort((a, b) => {
      const settingRank = (p: T) => (ciaSettingId && p.cia_setting_id === ciaSettingId ? 0 : 1);
      if (settingRank(a) !== settingRank(b)) return settingRank(a) - settingRank(b);
      const authoredRank = (p: T) => (p.authored === false ? 1 : 0);
      if (authoredRank(a) !== authoredRank(b)) return authoredRank(a) - authoredRank(b);
      const sa = STATUS_RANK[a.status] ?? 9;
      const sb = STATUS_RANK[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return a.set_number - b.set_number;
    });
}

/**
 * Picks the component the paper feeds.
 *
 * Default: the non-attendance component whose max equals the paper's max; else
 * the first non-attendance component. `attendance` is NEVER question-wise — it
 * is computed from periods. The caller MUST expose an override; this is a
 * convenience, not a contract.
 */
export function guessTargetComponent<T extends { code: string; max_marks: number }>(
  components: T[],
  paperMaxMarks: number
): T | undefined {
  const eligible = (components ?? []).filter((c) => c.code !== 'attendance');
  return eligible.find((c) => Number(c.max_marks) === Number(paperMaxMarks)) ?? eligible[0];
}
