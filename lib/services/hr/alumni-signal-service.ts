/**
 * AlumniSignalService — R4.3 (extended T8.5)
 *
 * Looks up a candidate email against JKKN history records and
 * returns a structured payload for the "JKKN History" panel on
 * the recruitment candidate detail page AND a compact line on
 * approvals queue rows.
 *
 * Service is category-agnostic: any candidate (faculty / non-teaching /
 * medical / contract / senior leadership) gets the same lookup. T8.5
 * extends signal coverage so internal-transfer + boomerang-staff hires
 * surface even when the candidate was never a learner-alumnus.
 *
 * Lookup chain (all silent-fail per source):
 *   email → profiles (email) → user_id + learner_id
 *   learner_id → alumni_outcomes               (graduation_year, course_name)
 *   user_id    → lc_members + lc_positions + lc_terms  (council role)
 *   member_id  → lc_committee_members          (committee count)  [T8.5]
 *   user_id    → lc_event_participants         (events attended)  [T8.5]
 *   email      → sh_builders                   (projects_completed)
 *   user_id    → bug_reports                   (reporter count)
 *   email      → staff                         (tenure + designation) [T8.5]
 *
 * Any sub-table miss is silent — the field is simply omitted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface AlumniCouncilRole {
  position_title: string;
  term_name: string;
}

/** [T8.5] Tenure record from `staff` table — surfaces re-hires + internal transfers. */
export interface AlumniStaffTenure {
  /** Years between date_of_joining and (date today, or last update if inactive). */
  years: number;
  /** designation column, may be null. */
  designation: string | null;
  /** Whether the staff record is still active (is_active or status='active'). */
  still_active: boolean;
}

export interface AlumniSignalPayload {
  /** Academic record */
  graduation_year: number;
  course_name: string | null;
  /** Optional sub-fields — omitted when missing */
  council_role?: AlumniCouncilRole;
  sh_contributions?: number;
  bug_reports_filed?: number;
  /** [T8.5] Number of LC committees the user is/was a member of. */
  lc_committee_count?: number;
  /** [T8.5] Number of LC events the user was registered/attended. */
  lc_events_attended?: number;
  /** [T8.5] Staff tenure record — surfaces former / current JKKN staff. */
  staff_tenure?: AlumniStaffTenure;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class AlumniSignalService {
  /**
   * Look up alumni signal data by candidate email.
   * Returns null only when the candidate has NO match across any
   * JKKN history surface (no learner-alumni record AND no staff record).
   *
   * Backward-compat: existing callers that destructure
   * { graduation_year, course_name } continue to work because those
   * remain required fields. When only a staff_tenure match is found,
   * graduation_year defaults to 0 and course_name to null.
   */
  static async lookupByEmail(
    supabase: SupabaseClient,
    email: string
  ): Promise<AlumniSignalPayload | null> {
    // Step 1 — resolve profile by email (may be null for ex-staff w/o profile)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, learner_id')
      .eq('email', email)
      .maybeSingle();

    const userId: string | null = !profileError && profile
      ? (profile as { id: string; learner_id: string | null }).id
      : null;
    const learnerId: string | null = !profileError && profile
      ? (profile as { id: string; learner_id: string | null }).learner_id
      : null;

    // Step 2 — academic record via alumni_outcomes (only when learner_id resolved)
    let academic: { graduation_year: number; course_name: string | null } | null = null;
    if (learnerId) {
      const { data: alumniRow } = await supabase
        .from('alumni_outcomes')
        .select('graduation_year, course_name')
        .eq('learner_id', learnerId)
        .order('graduation_year', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (alumniRow) {
        academic = {
          graduation_year: (alumniRow as { graduation_year: number; course_name: string | null })
            .graduation_year,
          course_name: (alumniRow as { graduation_year: number; course_name: string | null })
            .course_name ?? null,
        };
      }
    }

    // Step 3 — staff tenure (silent fail) — independent of learner record
    let staffTenure: AlumniStaffTenure | undefined;
    try {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('date_of_joining, designation, is_active, status, updated_at')
        .eq('email', email)
        .order('date_of_joining', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (staffRow) {
        const row = staffRow as {
          date_of_joining: string | null;
          designation: string | null;
          is_active: boolean | null;
          status: string | null;
          updated_at: string | null;
        };

        const stillActive =
          row.is_active === true ||
          (row.status ? row.status.toLowerCase() === 'active' : false);

        if (row.date_of_joining) {
          const startMs = new Date(row.date_of_joining).getTime();
          const endMs = stillActive
            ? Date.now()
            : row.updated_at
              ? new Date(row.updated_at).getTime()
              : Date.now();
          const yearsRaw = (endMs - startMs) / (365.25 * 24 * 60 * 60 * 1000);
          const years = Math.max(0, Math.round(yearsRaw * 10) / 10);

          staffTenure = {
            years,
            designation: row.designation,
            still_active: stillActive,
          };
        } else if (row.designation || stillActive) {
          // Record exists but no joining date — surface designation only.
          staffTenure = {
            years: 0,
            designation: row.designation,
            still_active: stillActive,
          };
        }
      }
    } catch {
      // staff table absent / RLS blocked — silent skip
    }

    // Early exit: if no academic AND no staff record, candidate has no JKKN history.
    // Note: profile-only candidates (signed up but never enrolled / employed)
    // also return null — matches existing UI semantics ("no panel when null").
    if (!academic && !staffTenure) {
      return null;
    }

    const payload: AlumniSignalPayload = {
      graduation_year: academic?.graduation_year ?? 0,
      course_name: academic?.course_name ?? null,
    };

    if (staffTenure) {
      payload.staff_tenure = staffTenure;
    }

    // Remaining sub-signals require user_id from profile lookup.
    if (!userId) return payload;

    // Step 4 — council role (silent fail if lc_members / lc_positions / lc_terms absent)
    let lcMemberId: string | null = null;
    try {
      const { data: memberRows } = await supabase
        .from('lc_members')
        .select('id, position_id, term_id')
        .eq('user_id', userId)
        .limit(1);

      if (memberRows && memberRows.length > 0) {
        const member = memberRows[0] as { id: string; position_id: string; term_id: string };
        lcMemberId = member.id;

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

    // Step 4b — [T8.5] LC committee count (silent fail)
    if (lcMemberId) {
      try {
        const { count } = await supabase
          .from('lc_committee_members')
          .select('id', { count: 'exact', head: true })
          .eq('member_id', lcMemberId);

        if (count !== null && count > 0) {
          payload.lc_committee_count = count;
        }
      } catch {
        // silent skip
      }
    }

    // Step 4c — [T8.5] LC events attended count (silent fail)
    try {
      const { count } = await supabase
        .from('lc_event_participants')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (count !== null && count > 0) {
        payload.lc_events_attended = count;
      }
    } catch {
      // silent skip
    }

    // Step 5 — Solutions Hub builder record (silent fail)
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

    // Step 6 — bug reports count (silent fail)
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

  /**
   * [T8.5] Bulk lookup for the approvals queue / candidates list.
   *
   * Looks up alumni signals for up to 100 emails in parallel.
   * Returns Record<email, payload | null>; emails with no match map to null.
   *
   * Cap is per-call — caller is responsible for batching when N > 100.
   */
  static async lookupByEmails(
    supabase: SupabaseClient,
    emails: string[]
  ): Promise<Record<string, AlumniSignalPayload | null>> {
    const unique = Array.from(new Set(emails.map((e) => e.toLowerCase().trim())))
      .filter(Boolean)
      .slice(0, 100);

    const entries = await Promise.all(
      unique.map(async (email) => {
        try {
          const signal = await AlumniSignalService.lookupByEmail(supabase, email);
          return [email, signal] as const;
        } catch {
          return [email, null] as const;
        }
      })
    );

    return Object.fromEntries(entries);
  }
}
