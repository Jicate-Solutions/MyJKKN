// lib/services/accreditation/stakeholder-survey-service.ts
// ============================================================================
// Employer + alumni course feedback cycles — the EXTERNAL half of NAAC 1.2.
//
// Plain CRUD over the browser (RLS-scoped) client, exactly like
// collaboration-service.ts: the evidence wiring lives entirely in the DB
// (migration 20260726181500_stakeholder_course_feedback_surveys.sql), so a
// closed cycle with >= 1 response emits its NAAC 1.2 row by trigger with no
// application code involved.
//
// Reads need 'accreditation.naac.surveys.stakeholder.view', writes need
// '...stakeholder.manage' — both enforced by RLS; the page mirrors them for UX.
//
// ONE thing deliberately does NOT live here: building the recipient roster.
// That has to read learners_profiles / cdc_recruiters, and an IQAC coordinator
// who legitimately owns this cycle may hold no learner-data permission at all —
// under RLS the browser client would return zero rows and the roster would look
// "built but empty" instead of failing. So the roster is built by
// POST /api/accreditation/stakeholder-surveys/[id]/build-roster, which checks
// the caller's permission and institution scope and THEN does the privileged
// read scoped to that one cycle's institution.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StakeholderAudience,
  StakeholderInviteRow,
  StakeholderSurveyRow,
  StakeholderSurveyStatus,
} from '@/types/accreditation/stakeholder-survey';
import { QUESTION_SETS, AUDIENCE_TITLES } from '@/types/accreditation/stakeholder-survey';

export interface CreateCycleInput {
  institution_id: string;
  audience: StakeholderAudience;
  academic_year: string;
  opens_at: string | null;
  closes_at: string | null;
}

/** Free text lives here, behind the permissioned admin view — never in evidence. */
export interface FreeTextEntry {
  submitted_at: string;
  text: string;
}

export interface CycleTally {
  invited: number;
  responded: number;
}

export class StakeholderSurveyService {
  private static supabase = createClientSupabaseClient();

  static async list(institutionId: string): Promise<StakeholderSurveyRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_stakeholder_surveys')
      .select('*')
      .eq('institution_id', institutionId)
      .order('academic_year', { ascending: false })
      .order('audience', { ascending: true });
    if (error) throw error;
    return (data ?? []) as StakeholderSurveyRow[];
  }

  /** Question set is snapshotted at creation so later re-wording cannot alter answered cycles. */
  static async create(input: CreateCycleInput): Promise<StakeholderSurveyRow> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_stakeholder_surveys')
      .insert({
        institution_id: input.institution_id,
        audience: input.audience,
        academic_year: input.academic_year,
        title: AUDIENCE_TITLES[input.audience],
        questions: QUESTION_SETS[input.audience],
        status: 'draft',
        opens_at: input.opens_at,
        closes_at: input.closes_at,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as StakeholderSurveyRow;
  }

  static async setStatus(id: string, status: StakeholderSurveyStatus): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('accreditation_stakeholder_surveys')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  }

  static async remove(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('accreditation_stakeholder_surveys')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /** The chase list. responded_at null = still to chase. */
  static async listInvites(surveyId: string): Promise<StakeholderInviteRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('accreditation_stakeholder_invites')
      .select('*')
      .eq('survey_id', surveyId)
      .order('responded_at', { ascending: true, nullsFirst: false })
      .order('invited_email', { ascending: true });
    if (error) throw error;
    return (data ?? []) as StakeholderInviteRow[];
  }

  static async tally(surveyId: string): Promise<CycleTally> {
    const invited = await (this.supabase as any)
      .from('accreditation_stakeholder_invites')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', surveyId);
    if (invited.error) throw invited.error;

    const responded = await (this.supabase as any)
      .from('accreditation_stakeholder_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', surveyId);
    if (responded.error) throw responded.error;

    return { invited: invited.count ?? 0, responded: responded.count ?? 0 };
  }

  /**
   * Free-text answers for one cycle, with no link back to who wrote them.
   * Deliberately drops invite_id: whoever reads the comments does not need the
   * roster join, and evidence metadata never sees this at all.
   */
  static async listFreeText(surveyId: string, textKeys: string[]): Promise<FreeTextEntry[]> {
    if (textKeys.length === 0) return [];
    const { data, error } = await (this.supabase as any)
      .from('accreditation_stakeholder_responses')
      .select('answers, submitted_at')
      .eq('survey_id', surveyId)
      .order('submitted_at', { ascending: false });
    if (error) throw error;

    const out: FreeTextEntry[] = [];
    for (const row of (data ?? []) as { answers: Record<string, unknown>; submitted_at: string }[]) {
      for (const k of textKeys) {
        const v = row.answers?.[k];
        if (typeof v === 'string' && v.trim() !== '') {
          out.push({ submitted_at: row.submitted_at, text: v.trim() });
        }
      }
    }
    return out;
  }

  /** Privacy lever: removing the invite anonymises its answers, count survives. */
  static async removeInvite(inviteId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('accreditation_stakeholder_invites')
      .delete()
      .eq('id', inviteId);
    if (error) throw error;
  }
}

/** Public link a recipient opens. Same origin as the app. */
export function stakeholderSurveyUrl(token: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/stakeholder-survey/${token}`;
}
