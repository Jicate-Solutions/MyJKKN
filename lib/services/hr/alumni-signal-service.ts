/**
 * AlumniSignalService — R4.3
 *
 * Looks up a candidate email against JKKN alumni records and
 * returns a structured payload for the "JKKN History" panel on
 * the recruitment candidate detail page.
 *
 * Lookup chain:
 *   email → profiles (email) → user_id + learner_id
 *   learner_id → alumni_outcomes  (graduation_year, course_name, program_id)
 *   user_id    → lc_members + lc_positions + lc_terms  (council role)
 *   email      → sh_builders (projects_completed)
 *   user_id    → bug_reports count (reporter_user_id)
 *
 * Any sub-table miss is silent — the field is simply omitted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface AlumniCouncilRole {
  position_title: string;
  term_name: string;
}

export interface AlumniSignalPayload {
  /** Academic record */
  graduation_year: number;
  course_name: string | null;
  /** Optional sub-fields — omitted when missing */
  council_role?: AlumniCouncilRole;
  sh_contributions?: number;
  bug_reports_filed?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AlumniSignalService {
  /**
   * Look up alumni signal data by candidate email.
   * Returns null if no alumni record exists for this email.
   */
  static async lookupByEmail(
    supabase: SupabaseClient,
    email: string
  ): Promise<AlumniSignalPayload | null> {
    // Step 1 — resolve profile by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, learner_id')
      .eq('email', email)
      .maybeSingle();

    if (profileError || !profile) return null;

    const { id: userId, learner_id: learnerId } = profile as {
      id: string;
      learner_id: string | null;
    };

    // Step 2 — check alumni_outcomes by learner_id
    if (!learnerId) return null;

    const { data: alumniRow, error: alumniError } = await supabase
      .from('alumni_outcomes')
      .select('graduation_year, course_name')
      .eq('learner_id', learnerId)
      .order('graduation_year', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alumniError || !alumniRow) return null;

    const payload: AlumniSignalPayload = {
      graduation_year: (alumniRow as { graduation_year: number; course_name: string | null })
        .graduation_year,
      course_name: (alumniRow as { graduation_year: number; course_name: string | null })
        .course_name ?? null,
    };

    // Step 3 — council role (silent fail if lc_members / lc_positions / lc_terms absent)
    try {
      const { data: memberRows } = await supabase
        .from('lc_members')
        .select('position_id, term_id')
        .eq('user_id', userId)
        .limit(1);

      if (memberRows && memberRows.length > 0) {
        const member = memberRows[0] as { position_id: string; term_id: string };

        const [{ data: posRow }, { data: termRow }] = await Promise.all([
          supabase
            .from('lc_positions')
            .select('title')
            .eq('id', member.position_id)
            .maybeSingle(),
          supabase
            .from('lc_terms')
            .select('name')
            .eq('id', member.term_id)
            .maybeSingle(),
        ]);

        if (posRow && termRow) {
          payload.council_role = {
            position_title: (posRow as { title: string }).title,
            term_name: (termRow as { name: string }).name,
          };
        }
      }
    } catch {
      // lc tables may not exist in all environments — silent skip
    }

    // Step 4 — Solutions Hub builder record (silent fail)
    try {
      const { data: builderRow } = await supabase
        .from('sh_builders')
        .select('projects_completed')
        .eq('email', email)
        .maybeSingle();

      if (builderRow) {
        const completed = (builderRow as { projects_completed: number | null })
          .projects_completed;
        if (completed !== null && completed > 0) {
          payload.sh_contributions = completed;
        }
      }
    } catch {
      // sh tables may not be accessible — silent skip
    }

    // Step 5 — bug reports count (silent fail)
    try {
      const { count } = await supabase
        .from('bug_reports')
        .select('id', { count: 'exact', head: true })
        .eq('reporter_user_id', userId);

      if (count !== null && count > 0) {
        payload.bug_reports_filed = count;
      }
    } catch {
      // bug_reports may not be accessible — silent skip
    }

    return payload;
  }
}
