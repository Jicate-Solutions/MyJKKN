import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelGatePass,
  CreateHostelGatePassDTO,
  GatePassStatus,
} from '@/types/campus-living';

/**
 * The two statuses the request workflow runs on.
 *
 * They are absent from `GatePassStatus` and from the generated Supabase types
 * because `gate_pass_status_enum` did not carry them: the live type was
 * exactly issued | active | returned | overdue | cancelled, so every
 * `status: 'requested'` insert died on 22P02 and the Pending tab filtered on a
 * value no row could ever hold. Migration
 * `20260907020000_gate_pass_request_workflow.sql` adds both labels.
 *
 * Declared here, once, so the `as any` casts below have a single documented
 * reason rather than being scattered lore — and so the test suite can assert
 * these exact strings against the enum the migration builds.
 */
export const GATE_PASS_REQUESTED = 'requested';
export const GATE_PASS_REJECTED = 'rejected';

export class GatePassService {
  // ── List gate passes ──────────────────────────────────────────────
  static async getGatePasses(
    institutionId: string | undefined,
    filters?: { status?: GatePassStatus; learner_id?: string; date?: string },
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_gate_passes')
        // No block embed: hostel_gate_passes has NO block_id column (see the
        // table DDL in 20260222000015). Asking PostgREST to embed on it fails
        // the WHOLE query with PGRST200, so the list page errored on every
        // load — invisible only because the table is still empty.
        .select('*, learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)', { count: 'exact' });

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.status) query = query.eq('status', filters.status as any);
      if (filters?.learner_id) query = query.eq('learner_id', filters.learner_id);
      if (filters?.date) {
        query = query.gte('created_at', `${filters.date}T00:00:00`)
                     .lte('created_at', `${filters.date}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate passes', error);
        throw error;
      }
      return { data: (data ?? []) as unknown as HostelGatePass[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePasses', error);
      throw error;
    }
  }

  // ── Single gate pass ──────────────────────────────────────────────
  static async getGatePass(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      // The learner embed is the same one getGatePasses uses and is the only
      // embed this table supports (see the note there: it has no block_id, so
      // a block embed fails the whole query with PGRST200). The detail page
      // needs it — without it, `pass.learner` is undefined and the page reads
      // a name off nothing.
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select(
          '*, hostel_leave_requests(*), learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)'
        )
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate pass', error);
        throw error;
      }
      return data as (HostelGatePass & { hostel_leave_requests: unknown }) | null;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePass', error);
      throw error;
    }
  }

  // ── Get gate pass by QR code ──────────────────────────────────────
  static async getGatePassByQR(qrCode: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('qr_code', qrCode)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate pass by QR', error);
        throw error;
      }
      return data as HostelGatePass | null;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePassByQR', error);
      throw error;
    }
  }

  // ── Get gate pass by pass number ──────────────────────────────────
  static async getGatePassByNumber(passNumber: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('pass_number', passNumber)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch gate pass by number', error);
        throw error;
      }
      return data as HostelGatePass | null;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getGatePassByNumber', error);
      throw error;
    }
  }

  /**
   * Resolve whatever id the caller has into the id `hostel_gate_passes`
   * will actually accept.
   *
   * `hostel_gate_passes.learner_id` is FOREIGN KEY ... REFERENCES profiles(id).
   * But every resident picker in this module reads `v_learner_hostelites`,
   * whose `id` is a `learners_profiles.id`. Those two id spaces are DISJOINT —
   * sampling 200 rows of the view found 200 matches in learners_profiles and
   * ZERO in profiles. Passing the picker's value straight through is therefore
   * a guaranteed 23503, which is the same defect that kept
   * `mess_meal_records` empty until 20260903020000's companion fix.
   *
   * Resolution order mirrors lib/services/campus-living/mess-scan-resolver.ts
   * so the module has ONE rule, not two:
   *   1. treat it as learners_profiles.id → the profiles row that links to it
   *   2. fall back to it already BEING a profiles.id (a team member's pass)
   *   3. otherwise refuse, loudly and by name
   *
   * Step 3 is not theoretical: of 698 hostel residents, 697 have a profiles
   * row and one does not. That person must be told they cannot be issued a
   * pass and why — never handed a silent failure.
   */
  private static async resolveLearnerProfileId(rawId: string): Promise<string> {
    const supabase = createClientSupabaseClient();

    const { data: viaLearner, error: viaLearnerError } = await supabase
      .from('profiles')
      .select('id')
      .eq('learner_id', rawId)
      .maybeSingle();

    if (viaLearnerError) {
      logger.error('campus-living/gate-pass', 'Failed resolving learner to profile', viaLearnerError);
      throw viaLearnerError;
    }
    if (viaLearner?.id) return viaLearner.id as string;

    const { data: asProfile, error: asProfileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', rawId)
      .maybeSingle();

    if (asProfileError) {
      logger.error('campus-living/gate-pass', 'Failed checking id as profile', asProfileError);
      throw asProfileError;
    }
    if (asProfile?.id) return asProfile.id as string;

    throw new Error(
      'This resident has no login profile yet, so a gate pass cannot be issued ' +
        'in their name. Ask the office to complete their profile first.',
    );
  }

  // ── Generate gate pass with QR ────────────────────────────────────
  static async generateGatePass(payload: CreateHostelGatePassDTO) {
    try {
      const supabase = createClientSupabaseClient();

      // See resolveLearnerProfileId: the picker hands us a learners_profiles.id
      // but the column is FK'd to profiles(id).
      const learnerProfileId = payload.learner_id
        ? await GatePassService.resolveLearnerProfileId(payload.learner_id as string)
        : payload.learner_id;

      // Generate unique pass number and QR code if not provided
      const passPayload = {
        ...payload,
        learner_id: learnerProfileId,
        pass_number: payload.pass_number || `GP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        qr_code: payload.qr_code || `QR-${crypto.randomUUID()}`,
        status: payload.status || 'issued',
      };

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .insert(passPayload as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to generate gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in generateGatePass', error);
      throw error;
    }
  }

  // ── Update gate pass ──────────────────────────────────────────────
  static async updateGatePass(id: string, payload: Partial<HostelGatePass>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to update gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in updateGatePass', error);
      throw error;
    }
  }

  // ── Delete gate pass ──────────────────────────────────────────────
  static async deleteGatePass(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_gate_passes')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to delete gate pass', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in deleteGatePass', error);
      throw error;
    }
  }

  // ── Record exit (security scans out) ──────────────────────────────
  static async recordExit(id: string, securityId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          out_time: new Date().toISOString(),
          gate_security_out: securityId,
          status: 'active' as any,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to record exit', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in recordExit', error);
      throw error;
    }
  }

  // ── Record return ─────────────────────────────────────────────────
  static async recordReturn(id: string, securityId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          actual_return: new Date().toISOString(),
          gate_security_in: securityId,
          status: 'returned' as any,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to record return', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in recordReturn', error);
      throw error;
    }
  }

  // ── Get overdue passes ────────────────────────────────────────────
  static async getOverduePasses(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();

      let q = supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('status', 'active')
        .lt('expected_return', now);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch overdue passes', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getOverduePasses', error);
      throw error;
    }
  }

  // ── Mark overdue (batch update) ───────────────────────────────────
  static async markOverdue(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({ status: 'overdue' as any })
        .eq('institution_id', institutionId)
        .eq('status', 'active')
        .lt('expected_return', now)
        .select();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to mark overdue passes', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in markOverdue', error);
      throw error;
    }
  }

  // ── Active passes for a learner ───────────────────────────────────
  static async getActivePassesForLearner(learnerId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('learner_id', learnerId)
        .in('status', ['issued', 'active'])
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch active passes for learner', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getActivePassesForLearner', error);
      throw error;
    }
  }

  // ── Passes a gate scan must consider for one learner ──────────────
  // Wider than getActivePassesForLearner on purpose: that one omits
  // 'overdue', and an overdue learner is precisely the one standing at the
  // gate wanting to come back in. Returned/cancelled passes are excluded —
  // the scan screen decides from live passes only.
  static async getScannablePassesForLearner(learnerId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('learner_id', learnerId)
        .in('status', ['issued', 'active', 'overdue'])
        .order('expected_return', { ascending: true });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch scannable passes', error);
        throw error;
      }
      return (data ?? []) as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getScannablePassesForLearner', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // REQUEST WORKFLOW — Student requests, Staff approves/rejects
  // ══════════════════════════════════════════════════════════════════

  // ── Learner submits a gate pass request ─────────────────────────
  // Deliberately does NOT set pass_number, qr_code or approved_by: a pass that
  // has only been asked for has no number, no QR and no approver. Those three
  // were NOT NULL until 20260907020000 moved that guarantee onto a CHECK that
  // binds only once the pass is issued.
  static async requestGatePass(payload: {
    institution_id: string;
    learner_id: string;
    pass_type: string;
    expected_return: string;
    destination: string;
    reason: string;
    leave_request_id?: string;
  }) {
    try {
      const supabase = createClientSupabaseClient();

      // Same id-space problem the issue path hit: the column is FK'd to
      // profiles(id) while every resident picker in this module hands out a
      // learners_profiles.id. The request lane in RLS also compares
      // learner_id = auth.uid(), which is a profiles.id — so resolving here is
      // what makes the resident's own insert pass its own policy.
      const learnerProfileId = await GatePassService.resolveLearnerProfileId(
        payload.learner_id
      );

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .insert({
          institution_id: payload.institution_id,
          learner_id: learnerProfileId,
          pass_type: payload.pass_type,
          expected_return: payload.expected_return,
          destination: payload.destination.trim(),
          reason: payload.reason.trim(),
          leave_request_id: payload.leave_request_id || null,
          status: GATE_PASS_REQUESTED,
          parent_notified: false,
        } as any)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to request gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in requestGatePass', error);
      throw error;
    }
  }

  // ── Staff approves a gate pass request ──────────────────────────
  // Scoped to a row that is still pending. Without that filter, a second click
  // on a stale tab would re-issue an already-active pass a NEW pass_number and
  // a NEW qr_code, invalidating the QR the learner is carrying at the gate.
  static async approveGatePass(id: string, approverId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const passNumber = `GP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const qrCode = `QR-${crypto.randomUUID()}`;

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'issued',
          approved_by: approverId,
          pass_number: passNumber,
          qr_code: qrCode,
        } as any)
        .eq('id', id)
        .eq('status', GATE_PASS_REQUESTED as any)
        .select()
        .maybeSingle();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to approve gate pass', error);
        throw error;
      }
      if (!data) {
        // RLS denial and "somebody already decided this" both land here and
        // both must be said out loud. A silent no-op that reports success is
        // how the Approve button looked like it worked for a year.
        throw new Error(
          'This request could not be approved — it is no longer pending, or you do not have permission to approve gate passes for this institution.'
        );
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in approveGatePass', error);
      throw error;
    }
  }

  // ── Staff rejects a gate pass request ───────────────────────────
  static async rejectGatePass(id: string, rejectedBy: string, rejectionReason: string) {
    try {
      const reason = rejectionReason.trim();
      if (!reason) {
        // The learner is told their request was refused; refusing without a
        // reason gives them nothing to act on.
        throw new Error('A rejection needs a reason the learner can read.');
      }

      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: GATE_PASS_REJECTED,
          rejected_by: rejectedBy,
          rejection_reason: reason,
        } as any)
        .eq('id', id)
        .eq('status', GATE_PASS_REQUESTED as any)
        .select()
        .maybeSingle();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to reject gate pass', error);
        throw error;
      }
      if (!data) {
        throw new Error(
          'This request could not be rejected — it is no longer pending, or you do not have permission to reject gate passes for this institution.'
        );
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in rejectGatePass', error);
      throw error;
    }
  }

  // ── Student views own gate passes (all statuses) ────────────────
  static async getMyGatePasses(learnerId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*')
        .eq('learner_id', learnerId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch learner gate passes', error);
        throw error;
      }
      return data as HostelGatePass[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getMyGatePasses', error);
      throw error;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PARENT WORKFLOW — View child passes, cancel, confirm checkpoints
  // ══════════════════════════════════════════════════════════════════

  // ── Verify a gate pass belongs to this parent's child ───────────
  private static async verifyParentOwnership(
    supabase: ReturnType<typeof createClientSupabaseClient>,
    gatePassId: string,
    parentUserId: string
  ) {
    // Get the learner_id from the gate pass
    const { data: pass, error: passError } = await supabase
      .from('hostel_gate_passes')
      .select('learner_id')
      .eq('id', gatePassId)
      .maybeSingle();

    if (passError || !pass) {
      throw new Error('Gate pass not found');
    }

    // Get parent profile IDs
    const { data: parentProfiles } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_id', parentUserId);

    if (!parentProfiles || parentProfiles.length === 0) {
      throw new Error('Not authorized: no parent profile found');
    }

    // Check if any parent profile is linked to this learner
    const { data: link } = await supabase
      .from('parent_learner_links')
      .select('id')
      .in('parent_id', parentProfiles.map((p) => p.id))
      .eq('learner_id', pass.learner_id)
      .limit(1);

    if (!link || link.length === 0) {
      throw new Error('Not authorized: this gate pass does not belong to your child');
    }
  }

  // ── Parent views child's gate passes ─────────────────────────────
  static async getChildGatePasses(parentUserId: string) {
    try {
      const supabase = createClientSupabaseClient();

      // First resolve parent_profiles IDs from auth user_id (may have multiple institutions)
      const { data: parentProfiles, error: profileError } = await supabase
        .from('parent_profiles')
        .select('id')
        .eq('user_id', parentUserId);

      if (profileError) {
        logger.error('campus-living/gate-pass', 'Failed to fetch parent profiles', profileError);
        throw profileError;
      }

      if (!parentProfiles || parentProfiles.length === 0) {
        logger.warn('campus-living/gate-pass', 'No parent profile found for user', { parentUserId });
        return [];
      }

      const parentProfileIds = parentProfiles.map((p) => p.id);

      // Then get linked learner IDs from parent_learner_links
      const { data: links, error: linkError } = await supabase
        .from('parent_learner_links')
        .select('learner_id')
        .in('parent_id', parentProfileIds);

      if (linkError) {
        logger.error('campus-living/gate-pass', 'Failed to fetch parent-learner links', linkError);
        throw linkError;
      }

      if (!links || links.length === 0) return [];

      const learnerIds = links.map((l) => l.learner_id);

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .select('*, learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)')
        .in('learner_id', learnerIds)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch child gate passes', error);
        throw error;
      }
      return data as (HostelGatePass & { learner: { id: string; full_name: string; email: string } | null })[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getChildGatePasses', error);
      throw error;
    }
  }

  // ── Cancel a gate pass (by parent or student) ────────────────────
  static async cancelGatePass(id: string, cancelledBy: string, reason: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          status: 'cancelled',
          cancelled_by: cancelledBy,
          cancellation_reason: reason,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to cancel gate pass', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in cancelGatePass', error);
      throw error;
    }
  }

  // ── Parent confirms child reached home (home_visit checkpoint) ──
  static async confirmReachedHome(id: string, parentUserId: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Verify the pass belongs to a child of this parent
      await this.verifyParentOwnership(supabase, id, parentUserId);

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          reached_home_at: new Date().toISOString(),
          reached_home_confirmed_by: parentUserId,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to confirm reached home', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in confirmReachedHome', error);
      throw error;
    }
  }

  // ── Parent confirms child left home (heading back to campus) ────
  static async confirmLeftHome(id: string, parentUserId: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Verify the pass belongs to a child of this parent
      await this.verifyParentOwnership(supabase, id, parentUserId);

      const { data, error } = await supabase
        .from('hostel_gate_passes')
        .update({
          left_home_at: new Date().toISOString(),
          left_home_confirmed_by: parentUserId,
        } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to confirm left home', error);
        throw error;
      }
      return data as HostelGatePass;
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in confirmLeftHome', error);
      throw error;
    }
  }

  // ── Staff views pending requests ────────────────────────────────
  static async getPendingRequests(institutionId: string | undefined) {
    try {
      const supabase = createClientSupabaseClient();
      let q = supabase
        .from('hostel_gate_passes')
        .select('*, learner:profiles!hostel_gate_passes_learner_id_fkey(id, full_name, email)')
        .eq('status', GATE_PASS_REQUESTED as any)
        .order('created_at', { ascending: true });
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;

      if (error) {
        logger.error('campus-living/gate-pass', 'Failed to fetch pending requests', error);
        throw error;
      }
      return data as (HostelGatePass & { learner: { id: string; full_name: string; email: string } | null })[];
    } catch (error) {
      logger.error('campus-living/gate-pass', 'Unexpected error in getPendingRequests', error);
      throw error;
    }
  }
}
