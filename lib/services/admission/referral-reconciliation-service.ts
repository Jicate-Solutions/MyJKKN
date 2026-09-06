// lib/services/admission/referral-reconciliation-service.ts
// ============================================================================
// Referral Reconciliation Service (2026-08-10)
//
// The read/write layer for the Registrar's independent check on agency referral
// credits. Today a credit is created and then verified by the same person about
// 94% of the time; this service backs the office that breaks that loop.
//
// The Registrar meets an agency, types in the agency's OWN list, and
// fn_reconcile_referral_session compares it against the credits the platform
// already holds. Three buckets come back. The one that matters is
// credited_not_claimed — a credit the agency itself will not own.
//
// NOTHING HERE PAYS, GENERATES OR APPROVES ANYTHING. Freezing a pair is a human
// act routed through an admin-only function; this service exposes it, it never
// performs it on its own. consultant-service.ts is deliberately untouched.
//
// Companion migration: supabase/migrations/20260818040000_referral_reconciliation_and_pair_scoring.sql
// Companion UI:        app/(routes)/admission/consultants/reconciliation/page.tsx
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationStatus = 'draft' | 'submitted';

export type ReconciliationBucket =
  | 'agreed'
  | 'credited_not_claimed'
  | 'claimed_not_credited';

/** What the Registrar recorded after asking the agency about a specific row. */
export type EvidenceStatus =
  | 'agency_confirmed'
  | 'agency_does_not_recognise'
  | 'agency_has_dated_proof';

export type ClaimSource = 'agency' | 'system';

export type PairRiskLevel = 'normal' | 'watch' | 'red';

export interface ReconciliationSession {
  id: string;
  consultant_id: string;
  academic_year: number;
  conducted_by: string | null;
  conducted_at: string;
  notes: string | null;
  status: ReconciliationStatus;
  created_at: string;
  updated_at: string;
  consultant?: { id: string; name: string | null } | null;
}

export interface ReconciliationClaim {
  id: string;
  session_id: string;
  claimed_name: string | null;
  claimed_phone: string | null;
  matched_learner_id: string | null;
  match_confidence: string | null;
  bucket: ReconciliationBucket | null;
  evidence_note: string | null;
  has_dated_proof: boolean;
  evidence_status: EvidenceStatus | null;
  source: ClaimSource;
  created_at: string;
  updated_at: string;
}

export interface ReconcileSummary {
  session_id: string;
  consultant_id: string;
  academic_year: number;
  credited_by_platform: number;
  claimed_by_agency: number;
  agreed: number;
  credited_not_claimed: number;
  claimed_not_credited: number;
  unmatched_claims: number;
}

export interface PairScore {
  id: string;
  team_member_id: string;
  consultant_id: string;
  credits_total: number;
  credits_confirmed: number;
  credits_disputed: number;
  risk_level: PairRiskLevel;
  frozen: boolean;
  frozen_at: string | null;
  frozen_by: string | null;
  frozen_reason: string | null;
  updated_at: string;
  team_member?: { id: string; full_name: string | null; email: string | null } | null;
}

export interface ConsultantOption {
  id: string;
  name: string | null;
}

export interface TeamMemberOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** A single row the Registrar typed in from the agency's list. */
export interface ClaimInput {
  claimed_name: string;
  claimed_phone: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ReferralReconciliationService = {
  // -- agencies + team members (pickers) -------------------------------------

  async getConsultants(): Promise<ConsultantOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('education_consultants')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ConsultantOption[];
  },

  async getTeamMembers(): Promise<TeamMemberOption[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as TeamMemberOption[];
  },

  // -- sessions --------------------------------------------------------------

  async getSessions(consultantId?: string, academicYear?: number): Promise<ReconciliationSession[]> {
    const supabase = createClientSupabaseClient();
    let q = (supabase as any)
      .from('referral_reconciliation_sessions')
      .select('*, consultant:education_consultants(id, name)')
      .order('conducted_at', { ascending: false })
      .limit(100);
    if (consultantId) q = q.eq('consultant_id', consultantId);
    if (academicYear) q = q.eq('academic_year', academicYear);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ReconciliationSession[];
  },

  async createSession(input: {
    consultant_id: string;
    academic_year: number;
    notes?: string | null;
  }): Promise<ReconciliationSession> {
    const supabase = createClientSupabaseClient();
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('referral_reconciliation_sessions')
      .insert({
        consultant_id: input.consultant_id,
        academic_year: input.academic_year,
        notes: input.notes ?? null,
        conducted_by: auth?.user?.id ?? null,
        status: 'draft',
      })
      .select('*, consultant:education_consultants(id, name)')
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as ReconciliationSession;
  },

  /**
   * Mark the session submitted. This is a bookkeeping flag on the meeting —
   * it releases nothing and pays nothing.
   */
  async submitSession(sessionId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('referral_reconciliation_sessions')
      .update({ status: 'submitted', updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw new Error(error.message);
  },

  // -- claims ----------------------------------------------------------------

  async getClaims(sessionId: string): Promise<ReconciliationClaim[]> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('referral_reconciliation_claims')
      .select('*')
      .eq('session_id', sessionId)
      .order('bucket', { ascending: true })
      .order('claimed_name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ReconciliationClaim[];
  },

  /**
   * Add the agency's own rows. Blank rows are dropped rather than stored, so a
   * half-filled paste box cannot invent a claim nobody made.
   */
  async addClaims(sessionId: string, rows: ClaimInput[]): Promise<number> {
    const clean = rows
      .map((r) => ({
        claimed_name: (r.claimed_name || '').trim(),
        claimed_phone: (r.claimed_phone || '').trim(),
      }))
      .filter((r) => r.claimed_name || r.claimed_phone);
    if (clean.length === 0) return 0;

    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any).from('referral_reconciliation_claims').insert(
      clean.map((r) => ({
        session_id: sessionId,
        claimed_name: r.claimed_name || null,
        claimed_phone: r.claimed_phone || null,
        source: 'agency' as const,
      })),
    );
    if (error) throw new Error(error.message);
    return clean.length;
  },

  async deleteClaim(claimId: string): Promise<void> {
    const supabase = createClientSupabaseClient();
    const { error } = await (supabase as any)
      .from('referral_reconciliation_claims')
      .delete()
      .eq('id', claimId)
      .eq('source', 'agency'); // system rows are rebuilt by reconcile, never hand-deleted
    if (error) throw new Error(error.message);
  },

  /** Record what the agency said about one row. */
  async setEvidence(
    claimId: string,
    input: { evidence_status?: EvidenceStatus | null; evidence_note?: string | null; has_dated_proof?: boolean },
  ): Promise<void> {
    const supabase = createClientSupabaseClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.evidence_status !== undefined) patch.evidence_status = input.evidence_status;
    if (input.evidence_note !== undefined) patch.evidence_note = input.evidence_note;
    if (input.has_dated_proof !== undefined) patch.has_dated_proof = input.has_dated_proof;

    // "Dated proof" is the strongest thing an agency can offer, so selecting it
    // also sets the boolean the score reads — one action, not two the Registrar
    // has to remember to keep in step.
    if (input.evidence_status === 'agency_has_dated_proof' && input.has_dated_proof === undefined) {
      patch.has_dated_proof = true;
    }

    const { error } = await (supabase as any)
      .from('referral_reconciliation_claims')
      .update(patch)
      .eq('id', claimId);
    if (error) throw new Error(error.message);
  },

  // -- the loop --------------------------------------------------------------

  /** Compare the agency's list against the platform's credits. Writes buckets only. */
  async reconcile(sessionId: string): Promise<ReconcileSummary> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_reconcile_referral_session', {
      p_session_id: sessionId,
    });
    if (error) throw new Error(error.message);
    return data as unknown as ReconcileSummary;
  },

  async getPairScores(consultantId?: string): Promise<PairScore[]> {
    const supabase = createClientSupabaseClient();
    let q = (supabase as any)
      .from('referral_pair_scores')
      .select('*, team_member:profiles!referral_pair_scores_team_member_id_fkey(id, full_name, email)')
      .order('credits_disputed', { ascending: false })
      .limit(200);
    if (consultantId) q = q.eq('consultant_id', consultantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PairScore[];
  },

  async recomputePairScore(teamMemberId: string, consultantId: string): Promise<PairScore> {
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_recompute_referral_pair_score', {
      p_team_member_id: teamMemberId,
      p_consultant_id: consultantId,
    });
    if (error) throw new Error(error.message);
    return data as unknown as PairScore;
  },

  /**
   * Freeze or unfreeze a (team member, agency) pair. Administrator only, reason
   * mandatory — both enforced in the database, not just here. The flag is
   * recorded and shown; no payout path reads it yet.
   */
  async setPairFreeze(
    teamMemberId: string,
    consultantId: string,
    frozen: boolean,
    reason: string,
  ): Promise<PairScore> {
    if (!reason || !reason.trim()) {
      throw new Error('A reason is required to freeze or unfreeze a pair');
    }
    const supabase = createClientSupabaseClient();
    const { data, error } = await (supabase as any).rpc('fn_set_referral_pair_freeze', {
      p_team_member_id: teamMemberId,
      p_consultant_id: consultantId,
      p_frozen: frozen,
      p_reason: reason.trim(),
    });
    if (error) throw new Error(error.message);
    return data as unknown as PairScore;
  },
};

// ---------------------------------------------------------------------------
// Paste parsing — the Registrar usually has the agency's list in a message or a
// sheet, not typed row by row. Accepts "Name, Phone" / "Name<TAB>Phone" / a bare
// name, one per line. Kept here (not in the page) so the rules are testable.
// ---------------------------------------------------------------------------

export function parsePastedClaims(text: string): ClaimInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,|;|\s{2,}/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return null;
      // A part that is mostly digits is the phone, wherever it sits on the line.
      const phoneIdx = parts.findIndex((p) => (p.replace(/\D/g, '').length >= 10));
      if (phoneIdx === -1) return { claimed_name: parts.join(' '), claimed_phone: '' };
      const phone = parts[phoneIdx];
      const name = parts.filter((_, i) => i !== phoneIdx).join(' ');
      return { claimed_name: name, claimed_phone: phone };
    })
    .filter((r): r is ClaimInput => r !== null && Boolean(r.claimed_name || r.claimed_phone));
}
