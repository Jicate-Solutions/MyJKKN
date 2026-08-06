/**
 * MBA case studies — service layer (browser client).
 * ============================================================================
 *
 * The written record of an improvement that was actually made: an associate
 * goes and looks, files an idea, the idea is applied, its value is confirmed —
 * and only then may a case study be written about it. The case is the artefact
 * the learner can show an employer, so authorship is theirs and the byline is
 * theirs (Director ruling, 2026-08-02).
 *
 * WRITES ARE RPC CALLS, NEVER TABLE MUTATIONS. Nothing in this file calls
 * `.insert()`, `.update()` or `.delete()` on `ss_case_studies`; every mutation
 * is one of four RPC calls, mirroring how `gemba_observations` does it:
 *
 *   fn_case_study_start(p_idea_id)
 *   fn_case_study_save(...)
 *   fn_case_study_submit(p_case_id)
 *   fn_case_study_grade(...)
 *
 * DEPENDENCY, stated once here instead of re-asserted at each call site: those
 * four functions, and six of the columns this screen reads, are created by
 * migration `20260809010000` in sibling PR #2759. That PR is open, and merging
 * it does not apply the migration either — migrations in this repo are applied
 * by hand as a separate deliberate act. So wherever this file says what one of
 * those functions enforces (eligibility, author-only, `improvement.board.
 * manage`), read it as a description of that migration's CONTRACT, not as a
 * statement about anything running today.
 *
 * This layer deliberately does NOT re-implement those checks. It may hide a
 * control the server would refuse (so nobody is handed a form that bounces),
 * but it never decides. A client-side eligibility test that disagreed with the
 * RPC would be a second source of truth, and the wrong one.
 *
 * READS ARE NARROWED HERE, IN THIS FILE. The `.eq()` filters below are the only
 * narrowing this code performs, and the permission check on the screen is the
 * only gate in front of them. Do not weaken either on the belief that the
 * database narrows these reads too: any row-level narrowing of
 * `ss_case_studies` arrives with the same unapplied `20260809010000`.
 *
 * And do not look for the current policy set in this comment, or in any other
 * comment in this file — it is deliberately not written down here. Three
 * successive revisions of this file each described the live policies in prose
 * and each was wrong within days, because prose does not move when the database
 * does. `pg_policy` is the record. This file is not.
 *
 * DEGRADING HONESTLY. Until `20260809010000` is applied, every query here fails
 * with a missing-object error rather than returning empty — which is the good
 * case, because "no rows" and "no feature" must never look alike.
 * `isMissingObject()` separates the two so the screen can say which one it is
 * instead of rendering a blank page or leaking a raw 500.
 *
 * The `ss_*` tables are not in the generated `types/supabase.ts`, so queries
 * cast through `(supabase as any)` — the same pattern the sibling improvement
 * services use for un-typed tables. Row shapes are typed here instead.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

const MODULE = 'improvement/case-studies';

/** `public.ss_case_study_status`. The existing enum — no values were added. */
export type CaseStudyStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'published'
  | 'archived';

/** The AI drafter's signature this screen looks for in `generated_by`.
 *  `fn_case_study_start` is specified to write it (`20260809010000` contract —
 *  see the file header); this constant is only the value compared against. */
export const AI_DRAFT_MARKER = 'mba.draft_case_study';

/** A row from `ss_case_studies`, limited to the columns this screen reads. */
export interface CaseStudy {
  id: string;
  improvement_idea_id: string | null;
  author_id: string | null;
  title: string;
  summary: string | null;
  full_content: string | null;
  key_takeaways: string[] | null;
  learning_objectives: string[] | null;
  status: CaseStudyStatus;
  published_at: string | null;
  generated_by: string | null;
  grade: number | null;
  graded_by: string | null;
  graded_at: string | null;
  grade_notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A case decorated with the names and idea title the UI shows. */
export interface CaseStudyEnriched extends CaseStudy {
  author_name: string | null;
  grader_name: string | null;
  idea_title: string | null;
}

/** An improvement idea that has cleared both eligibility tests. */
export interface EligibleIdea {
  id: string;
  title: string;
  problem: string | null;
  expected_impact: string | null;
  area_label: string | null;
  verified_at: string | null;
}

/**
 * The learner's write-up lane, counts included.
 *
 * The counts exist so an empty `eligible` list can explain ITSELF. An idea
 * becomes writable only after it was applied AND its value was confirmed, and
 * without the funnel behind it an empty list reads as "broken" rather than
 * "not yet" — which is how this platform's other features stay dark.
 */
export interface WritingLane {
  eligible: EligibleIdea[];
  /** Every idea this person has filed, whatever its status. */
  totalMine: number;
  /** Of those, how many reached `verified`. */
  verifiedMine: number;
  /** Of the verified ones, how many had their value confirmed to hold. */
  valueHoldsMine: number;
  /** Eligible ideas already written up — excluded from `eligible`. */
  alreadyWritten: number;
}

/**
 * Postgres / PostgREST codes that mean "the object is not there", as opposed to
 * "you may not see it" (RLS denial is silent — zero rows, no error) or "the RPC
 * refused you" (a raised message with its own code).
 */
const MISSING_OBJECT_CODES = new Set([
  '42703', // undefined_column   — the six new columns are not added yet
  '42P01', // undefined_table
  '42883', // undefined_function — the four RPCs are not created yet
  'PGRST202', // function not found in the schema cache
  'PGRST204', // column not found in the schema cache
]);

/**
 * Is this error "the feature is not installed" rather than a real refusal?
 *
 * Matched on the error CODE first. The text fallback is deliberately narrow:
 * a bare `does not exist` would also match a legitimate RPC message such as
 * "that idea does not exist", and misreading a business refusal as a missing
 * migration would tell the viewer to go and wait for something that already
 * shipped.
 */
export function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: unknown; message?: unknown; details?: unknown };
  if (err.code != null && MISSING_OBJECT_CODES.has(String(err.code))) return true;
  const text = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase();
  return (
    text.includes('could not find the function') ||
    text.includes('schema cache') ||
    /(?:function|column|relation)\s+\S+\s+does not exist/.test(text)
  );
}

/** Thrown when the screen asked for something the database has not got yet. */
export class CaseStudyNotInstalledError extends Error {
  constructor() {
    super(
      'The case-study tables and functions are not on this database yet. ' +
        'The change that adds them has not been applied.'
    );
    this.name = 'CaseStudyNotInstalledError';
  }
}

/** What the screen may render right now. */
export type CaseStudyAvailability = 'ready' | 'not_installed' | 'unavailable';

type ProfileLite = { id: string; full_name: string | null };

/** Every column this screen reads, six of which `20260809010000` adds (see the
 *  file header). Read together on purpose: the availability probe below then
 *  fails if ANY one of them is absent. */
const NEW_COLUMNS =
  'id, improvement_idea_id, author_id, title, summary, full_content, ' +
  'key_takeaways, learning_objectives, status, published_at, generated_by, ' +
  'grade, graded_by, graded_at, grade_notes, created_at, updated_at';

export class CaseStudyService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /**
   * Can this screen work at all?
   *
   * Selects the new columns with a one-row limit. A missing column answers
   * `not_installed`; an empty result answers `ready` (zero cases is a normal
   * state and must not read as a broken feature); anything else answers
   * `unavailable` so the screen says "could not load" rather than blaming a
   * migration that is in fact applied.
   */
  static async checkAvailability(): Promise<CaseStudyAvailability> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any)
      .from('ss_case_studies')
      .select(NEW_COLUMNS)
      .limit(1);

    if (!error) return 'ready';
    if (isMissingObject(error)) {
      logger.warn(MODULE, 'Case-study schema not applied yet', error);
      return 'not_installed';
    }
    logger.error(MODULE, 'Case-study availability probe failed', error);
    return 'unavailable';
  }

  /** A { id -> full_name } map for a set of profile ids (one batched read). */
  private static async fetchProfileNames(
    ids: (string | null)[]
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', unique)) as { data: ProfileLite[] | null; error: any };

    if (error) {
      logger.warn(MODULE, 'Failed to resolve names', error);
      return map;
    }
    for (const p of data || []) map.set(p.id, p.full_name);
    return map;
  }

  /** A { id -> title } map for the ideas a set of cases was written about. */
  private static async fetchIdeaTitles(
    ids: (string | null)[]
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('improvement_ideas')
      .select('id, title')
      .in('id', unique)) as {
      data: { id: string; title: string }[] | null;
      error: any;
    };
    if (error) {
      logger.warn(MODULE, 'Failed to resolve idea titles', error);
      return map;
    }
    for (const i of data || []) map.set(i.id, i.title);
    return map;
  }

  private static async enrich(rows: CaseStudy[]): Promise<CaseStudyEnriched[]> {
    if (rows.length === 0) return [];
    const [names, ideaTitles] = await Promise.all([
      this.fetchProfileNames([
        ...rows.map((r) => r.author_id),
        ...rows.map((r) => r.graded_by),
      ]),
      this.fetchIdeaTitles(rows.map((r) => r.improvement_idea_id)),
    ]);
    return rows.map((r) => ({
      ...r,
      author_name: r.author_id ? names.get(r.author_id) ?? null : null,
      grader_name: r.graded_by ? names.get(r.graded_by) ?? null : null,
      idea_title: r.improvement_idea_id
        ? ideaTitles.get(r.improvement_idea_id) ?? null
        : null,
    }));
  }

  /**
   * The caller's own cases — drafts, submitted, graded and published alike.
   *
   * THE `author_id` FILTER IS THE ONLY NARROWING IN THIS METHOD. Do not remove
   * it. It is what makes this "my cases" rather than "every case", and until
   * `20260809010000` is applied (see the file header) it is the only narrowing
   * anywhere on the path.
   *
   * It stays wanted after that apply too: the policy that migration installs
   * admits an `improvement.board.manage` holder to every case, and this lane
   * means only their own.
   */
  static async listMyCases(userId: string): Promise<CaseStudyEnriched[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('ss_case_studies')
      .select(NEW_COLUMNS)
      .eq('author_id', userId)
      .order('updated_at', { ascending: false })) as {
      data: CaseStudy[] | null;
      error: any;
    };
    if (error) {
      if (isMissingObject(error)) throw new CaseStudyNotInstalledError();
      logger.error(MODULE, 'Error loading own cases', error);
      throw new Error(error.message || 'Could not load your case studies.');
    }
    return this.enrich(data || []);
  }

  /**
   * The review queue — everything submitted and waiting for a grade.
   *
   * THIS METHOD IS NOT SELF-LIMITING. It asks for every `under_review` row and
   * narrows by nothing else. What holds the queue to graders is the caller: the
   * screen checks `improvement.board.manage` before calling this at all. Treat
   * that check as the protection itself, not as a belt-and-braces second copy
   * of a database rule.
   *
   * That stays true after `20260809010000` is applied (see the file header).
   * The policy it installs admits graders PLUS each author's own rows PLUS
   * published rows, so this query is never "graders only" on its own and the
   * permission check above it always has to stand.
   */
  static async listReviewQueue(): Promise<CaseStudyEnriched[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('ss_case_studies')
      .select(NEW_COLUMNS)
      .eq('status', 'under_review')
      .order('updated_at', { ascending: true })) as {
      data: CaseStudy[] | null;
      error: any;
    };
    if (error) {
      if (isMissingObject(error)) throw new CaseStudyNotInstalledError();
      logger.error(MODULE, 'Error loading review queue', error);
      throw new Error(error.message || 'Could not load the review queue.');
    }
    return this.enrich(data || []);
  }

  /**
   * The library — every published case.
   *
   * The `status` filter is what makes this the library, and it is NOT a privacy
   * boundary — nothing in this method is. Publishing is the act that makes a
   * case open, and `20260809010000` (see the file header) keeps it that way by
   * admitting `status = 'published'` outright. The board gate on the screen
   * decides who is SHOWN this lane, not who may read the rows, so do not
   * document this lane as narrower than the write and review lanes.
   */
  static async listPublished(): Promise<CaseStudyEnriched[]> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('ss_case_studies')
      .select(NEW_COLUMNS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })) as {
      data: CaseStudy[] | null;
      error: any;
    };
    if (error) {
      if (isMissingObject(error)) throw new CaseStudyNotInstalledError();
      logger.error(MODULE, 'Error loading published cases', error);
      throw new Error(error.message || 'Could not load the case library.');
    }
    return this.enrich(data || []);
  }

  /**
   * The caller's write-up lane: which of their own ideas may become a case, and
   * the funnel counts that explain an empty answer.
   *
   * The eligibility rule applied here — `verified` AND `value_holds` — decides
   * what to LIST, and nothing more. It mirrors the rule `fn_case_study_start`
   * is specified to enforce (see the file header: that function ships with
   * `20260809010000`, which is not applied); the RPC, not this filter, is what
   * decides whether a case may actually be started.
   */
  static async myWritingLane(userId: string): Promise<WritingLane> {
    const supabase = this.getSupabase();

    const { data: ideaRows, error: ideaError } = (await (supabase as any)
      .from('improvement_ideas')
      .select(
        'id, title, problem, expected_impact, area_id, status, value_holds, verified_at'
      )
      .eq('author_id', userId)
      .order('verified_at', { ascending: false })) as {
      data:
        | {
            id: string;
            title: string;
            problem: string | null;
            expected_impact: string | null;
            area_id: string | null;
            status: string;
            value_holds: boolean | null;
            verified_at: string | null;
          }[]
        | null;
      error: any;
    };

    if (ideaError) {
      logger.error(MODULE, 'Error loading own ideas', ideaError);
      throw new Error(ideaError.message || 'Could not load your improvement ideas.');
    }

    const ideas = ideaRows || [];
    const empty: WritingLane = {
      eligible: [],
      totalMine: 0,
      verifiedMine: 0,
      valueHoldsMine: 0,
      alreadyWritten: 0,
    };
    if (ideas.length === 0) return empty;

    const verified = ideas.filter((i) => i.status === 'verified');
    const valueHolds = verified.filter((i) => i.value_holds === true);

    // Which of those already have a case? This probe deliberately carries NO
    // author filter: the question is "has anyone written this idea up", and a
    // case another person started still means this idea is taken.
    //
    // So `alreadyWritten` is only as complete as what the caller may read. Once
    // `20260809010000` (see the file header — open in #2759, not applied) adds
    // row-level narrowing, a case a posted associate started on someone ELSE's
    // idea stops being visible to the idea's author, the count under-reports
    // for them, and the idea keeps being offered below until the RPC refuses
    // it. That consequence belongs to #2759 to handle, not to this file.
    const writtenFor = new Set<string>();
    if (valueHolds.length > 0) {
      const { data: existing, error: existingError } = (await (supabase as any)
        .from('ss_case_studies')
        .select('improvement_idea_id')
        .in(
          'improvement_idea_id',
          valueHolds.map((i) => i.id)
        )) as {
        data: { improvement_idea_id: string | null }[] | null;
        error: any;
      };
      if (existingError) {
        if (isMissingObject(existingError)) throw new CaseStudyNotInstalledError();
        logger.error(MODULE, 'Error checking existing cases', existingError);
        throw new Error(
          existingError.message || 'Could not check which ideas are written up.'
        );
      }
      for (const row of existing || []) {
        if (row.improvement_idea_id) writtenFor.add(row.improvement_idea_id);
      }
    }

    const remaining = valueHolds.filter((i) => !writtenFor.has(i.id));

    // Area labels, one batched read, only for what will actually render.
    const areaLabels = new Map<string, string>();
    const areaIds = Array.from(
      new Set(remaining.map((i) => i.area_id).filter((v): v is string => !!v))
    );
    if (areaIds.length > 0) {
      const { data: areas } = (await (supabase as any)
        .from('improvement_areas')
        .select('id, label')
        .in('id', areaIds)) as {
        data: { id: string; label: string }[] | null;
        error: any;
      };
      for (const a of areas || []) areaLabels.set(a.id, a.label);
    }

    return {
      eligible: remaining.map((i) => ({
        id: i.id,
        title: i.title,
        problem: i.problem,
        expected_impact: i.expected_impact,
        area_label: i.area_id ? areaLabels.get(i.area_id) ?? null : null,
        verified_at: i.verified_at,
      })),
      totalMine: ideas.length,
      verifiedMine: verified.length,
      valueHoldsMine: valueHolds.length,
      alreadyWritten: writtenFor.size,
    };
  }

  // --- Writes: the four RPCs, and nothing else ------------------------------

  /** Translate an RPC failure into something a reader can act on. */
  private static rpcError(action: string, error: any): Error {
    if (isMissingObject(error)) return new CaseStudyNotInstalledError();
    logger.error(MODULE, `Error during ${action}`, error);
    return new Error(error?.message || `Could not ${action}.`);
  }

  /**
   * Begin the case for one improvement idea and queue the AI first draft.
   * Returns the new case id. Eligibility (`verified` + `value_holds`) and the
   * author/posting check are the RPC's to enforce, not this call's — per the
   * contract of `20260809010000`, which the file header records as unapplied.
   */
  static async start(ideaId: string): Promise<string> {
    const supabase = this.getSupabase();
    const { data, error } = await (supabase as any).rpc('fn_case_study_start', {
      p_idea_id: ideaId,
    });
    if (error) throw this.rpcError('start this case study', error);
    return data as string;
  }

  /** Save the author's rewrite. Author-only and draft-only are the RPC's rules
   *  to apply (`20260809010000` contract; see the file header), not this
   *  call's — it passes the payload through and reports what comes back. */
  static async save(
    caseId: string,
    payload: {
      title: string;
      summary: string;
      fullContent: string;
      keyTakeaways: string[];
      learningObjectives: string[];
    }
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_case_study_save', {
      p_case_id: caseId,
      p_title: payload.title,
      p_summary: payload.summary,
      p_full_content: payload.fullContent,
      p_key_takeaways: payload.keyTakeaways,
      p_learning_objectives: payload.learningObjectives,
    });
    if (error) throw this.rpcError('save this case study', error);
  }

  /** Hand the draft over for a grade. The `draft -> under_review` move is made
   *  by the RPC, which is also what decides whether this caller may make it. */
  static async submit(caseId: string): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_case_study_submit', {
      p_case_id: caseId,
    });
    if (error) throw this.rpcError('submit this case study', error);
  }

  /**
   * Record the grade. `publish` is a separate, deliberate decision: without it
   * the case is `approved` and stays inside the programme; with it the case
   * joins the library under the author's byline.
   */
  static async grade(
    caseId: string,
    payload: { grade: number; notes: string; publish: boolean }
  ): Promise<void> {
    const supabase = this.getSupabase();
    const { error } = await (supabase as any).rpc('fn_case_study_grade', {
      p_case_id: caseId,
      p_grade: payload.grade,
      p_notes: payload.notes,
      p_publish: payload.publish,
    });
    if (error) throw this.rpcError('record this grade', error);
  }
}

/** Human label for a status, used in badges and sentences alike. */
export const CASE_STATUS_LABEL: Record<CaseStudyStatus, string> = {
  draft: 'Draft',
  under_review: 'Waiting for a grade',
  approved: 'Graded',
  published: 'Published',
  archived: 'Archived',
};

export const CASE_STATUS_BADGE_CLASS: Record<CaseStudyStatus, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  under_review:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  approved:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  published:
    'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  archived: 'bg-muted text-muted-foreground',
};

/** A textarea holds one entry per line; the column holds text[]. */
export function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function arrayToLines(value: string[] | null): string {
  return (value || []).join('\n');
}
