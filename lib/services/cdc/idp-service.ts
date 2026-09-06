// lib/services/cdc/idp-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcIdpResponse,
  CdcIdpResponseWithLearner,
  CreateIdpResponseDto,
  UpdateIdpResponseDto,
  IdpFilters,
  IdpListResponse,
} from '@/types/cdc/idp';

// The embedded learner row comes from learners_profiles, which has
// first_name / last_name but NO `name` column. Compose a display `name`
// in JS so consumers (idp list/detail pages reading learner.name) keep working.
function withLearnerDisplayName<T extends Record<string, unknown>>(row: T): T {
  const learner = row?.learner as
    | { first_name?: string | null; last_name?: string | null }
    | null
    | undefined;
  if (!learner) return row;
  const name = [learner.first_name, learner.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return { ...row, learner: { ...learner, name } };
}

export class IdpService {
  static async list(supabase: SupabaseClient, filters: IdpFilters = {}): Promise<IdpListResponse> {
    const { page = 1, limit = 20, institution_id, academic_year_label, learner_id, source } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('cdc_idp_responses')
      .select(
        `*, learner:learner_id(id, first_name, last_name, roll_number, institution_id)`,
        { count: 'exact' }
      )
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (learner_id) query = query.eq('learner_id', learner_id);
    if (academic_year_label) query = query.eq('academic_year_label', academic_year_label);
    if (source) query = query.eq('source', source);
    if (institution_id) {
      // filter via learner's institution — use inner join approach
      query = query.eq('learner.institution_id', institution_id);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return {
      data: (data ?? []).map(withLearnerDisplayName) as CdcIdpResponseWithLearner[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  static async getById(supabase: SupabaseClient, id: string): Promise<CdcIdpResponseWithLearner> {
    const { data, error } = await supabase
      .from('cdc_idp_responses')
      .select(`*, learner:learner_id(id, first_name, last_name, roll_number, institution_id)`)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return withLearnerDisplayName(data) as CdcIdpResponseWithLearner;
  }

  static async getByLearnerId(supabase: SupabaseClient, learner_id: string): Promise<CdcIdpResponse | null> {
    const { data, error } = await supabase
      .from('cdc_idp_responses')
      .select('*')
      .eq('learner_id', learner_id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse | null;
  }

  static async create(supabase: SupabaseClient, dto: CreateIdpResponseDto): Promise<CdcIdpResponse> {
    const { data, error } = await supabase
      .from('cdc_idp_responses')
      .insert({
        learner_id: dto.learner_id,
        batch_id: dto.batch_id ?? null,
        academic_year_label: dto.academic_year_label ?? null,
        interests: dto.interests ?? [],
        aspirations: dto.aspirations ?? {},
        club_picks: dto.club_picks ?? [],
        three_year_plan: dto.three_year_plan ?? {},
        skills_self_attribution: dto.skills_self_attribution ?? [],
        // BUG-004061: free-text "My Academic Strengths" narrative (distinct
        // from skills_self_attribution tag array).
        academic_strengths: dto.academic_strengths ?? null,
        free_text_notes: dto.free_text_notes ?? null,
        // BUG-004197 (provenance): which fields were machine-suggested at create.
        prefill_sources: dto.prefill_sources ?? {},
        // BUG-004298: self-submit workflow. Defaults to 'draft'; the learner's
        // Submit path passes 'submitted'. 'approved' is rejected by RLS here.
        submission_status: dto.submission_status ?? 'draft',
        source: 'native_form',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse;
  }

  static async update(supabase: SupabaseClient, id: string, dto: UpdateIdpResponseDto): Promise<CdcIdpResponse> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.interests !== undefined) payload.interests = dto.interests;
    if (dto.aspirations !== undefined) payload.aspirations = dto.aspirations;
    if (dto.club_picks !== undefined) payload.club_picks = dto.club_picks;
    if (dto.three_year_plan !== undefined) payload.three_year_plan = dto.three_year_plan;
    if (dto.skills_self_attribution !== undefined) payload.skills_self_attribution = dto.skills_self_attribution;
    if (dto.academic_strengths !== undefined) payload.academic_strengths = dto.academic_strengths;
    if (dto.free_text_notes !== undefined) payload.free_text_notes = dto.free_text_notes;
    if (dto.academic_year_label !== undefined) payload.academic_year_label = dto.academic_year_label;
    if (dto.updated_by !== undefined) payload.updated_by = dto.updated_by;
    // BUG-004298: self-submit workflow. Only ever set to 'draft' or 'submitted'
    // here (learner Submit). Approval is a separate, staff-only path (approve()).
    if (dto.submission_status !== undefined) payload.submission_status = dto.submission_status;

    const { data, error } = await supabase
      .from('cdc_idp_responses')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse;
  }

  // ==================== APPROVAL (BUG-004298) ====================
  //
  // Staff-only: mark a submitted IDP as approved. RLS enforces that only CDC
  // staff (institution-scoped) can write submission_status='approved' — a learner
  // calling this would be rejected by the row-level policy. Sets approved_at /
  // approved_by for the audit trail and locks the plan from further learner edits
  // (the learner UPDATE policy's USING clause is false once status='approved').
  static async approve(
    supabase: SupabaseClient,
    id: string,
    approverId: string
  ): Promise<CdcIdpResponse> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('cdc_idp_responses')
      .update({
        submission_status: 'approved',
        approved_at: nowIso,
        approved_by: approverId,
        updated_at: nowIso,
        updated_by: approverId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CdcIdpResponse;
  }

  // ==================== COMPLETION REMINDERS (BUG-004092) ====================
  //
  // Manual + bulk "nudge the learner to complete their IDP" action.
  //
  // PENDING DEFINITION — mirrors the stats cards (BUG-004091): cdc_idp_responses
  // has no status column, so a response is "pending" when it has been submitted
  // but never opened/edited since (updated_at <= submitted_at). Only pending
  // rows are reminded, even when a non-pending row's id is passed explicitly.
  //
  // NOTIFICATION MECHANISM — reuses the canonical bell pattern (the same two-table
  // shape as lib/services/ai-pulse/rotation-service.ts and pde-appreciation):
  // ONE `notifications` row + ONE `user_notifications` link per recipient. The
  // bell reads `user_notifications !inner notifications`, so a notifications row
  // alone (with targeting JSONB) NEVER surfaces — the per-recipient links are
  // what makes the reminder appear in the learner's bell.
  //
  // RECIPIENT RESOLUTION — the bell is keyed on profiles.id (auth id), but IDP
  // rows carry learner_id (learners_profiles.id). We map via profiles.learner_id.
  // Learners with no linked profile (e.g. Google-Form-imported responses whose
  // learner never got an auth account) cannot receive an in-app notification;
  // they are counted as `skipped` and reported back so the operator sees the gap
  // instead of a silent no-op.
  static async sendReminders(
    supabase: SupabaseClient,
    opts: { ids?: string[]; scope?: 'selected' | 'all_pending'; filters?: IdpFilters } = {}
  ): Promise<{ sent: number; skipped: number; pending: number }> {
    const { ids, scope = 'selected', filters = {} } = opts;

    // 1. Resolve the candidate IDP rows (id, learner_id, submitted_at, updated_at).
    let query = supabase
      .from('cdc_idp_responses')
      .select('id, learner_id, submitted_at, updated_at');

    if (scope === 'selected') {
      if (!ids || ids.length === 0) {
        throw new Error('No IDP responses selected to remind.');
      }
      query = query.in('id', ids);
    } else {
      // all_pending — honour the same server-side filters the list/stats use,
      // so "Remind All Pending" matches the PENDING count the operator sees.
      if (filters.academic_year_label) query = query.eq('academic_year_label', filters.academic_year_label);
      if (filters.source) query = query.eq('source', filters.source);
      if (filters.learner_id) query = query.eq('learner_id', filters.learner_id);
    }

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) throw new Error(rowsErr.message);

    // 2. Keep only PENDING rows (submitted, not yet opened/edited) with a learner.
    const pendingRows = (rows ?? []).filter((r) => {
      if (!r.learner_id) return false;
      const submitted = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
      const updated = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return !(updated > submitted); // pending = NOT edited since submission
    });

    const pending = pendingRows.length;
    if (pending === 0) {
      return { sent: 0, skipped: 0, pending: 0 };
    }

    // 3. Map learner_id (learners_profiles.id) -> profiles.id (the bell key).
    const learnerIds = [...new Set(pendingRows.map((r) => r.learner_id).filter(Boolean))] as string[];
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', learnerIds);
    if (profErr) throw new Error(profErr.message);

    // learner_id -> profile (auth) id. A learner_id with no profile row is
    // unreachable in-app and falls through to `skipped`.
    const learnerToProfile = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<{ id: string; learner_id: string | null }>) {
      if (p.learner_id && !learnerToProfile.has(p.learner_id)) {
        learnerToProfile.set(p.learner_id, p.id);
      }
    }

    // Build per-pending-row recipient. Recipients are LEARNERS, so the reminder
    // deep-links to their own self-service IDP page (/learner/idp, BUG-004298) —
    // NOT the staff console /cdc/idp, which learners have no permission to view.
    const recipients: Array<{ profileId: string; idpId: string }> = [];
    for (const r of pendingRows) {
      const profileId = r.learner_id ? learnerToProfile.get(r.learner_id) : undefined;
      if (profileId) recipients.push({ profileId, idpId: r.id });
    }

    const skipped = pending - recipients.length;
    if (recipients.length === 0) {
      // Nothing reachable — surface, don't silently succeed.
      return { sent: 0, skipped, pending };
    }

    // 4. Resolve the sender (notifications.created_by is NOT NULL).
    const { data: auth } = await supabase.auth.getUser();
    const senderId = auth?.user?.id ?? null;
    if (!senderId) throw new Error('You must be signed in to send reminders.');

    // 5. Write ONE notifications row, then per-recipient user_notifications links.
    //    Shape mirrors ai-pulse/rotation-service.ts (proven to reach the bell).
    const recipientProfileIds = [...new Set(recipients.map((x) => x.profileId))];
    const { data: notification, error: notifErr } = await supabase
      .from('notifications')
      .insert({
        title: 'Complete your Individual Development Plan',
        body: 'Your Individual Development Plan (IDP) is pending. Please review and complete it so the CDC team can support your goals.',
        created_by: senderId,
        // Category follows the CDC notification convention established by
        // 20260530T000000Z_cdc_notification_parity.sql ('cdc.placement.*').
        category: 'cdc.idp.reminder',
        // kind is CHECK-constrained to ('announcement','work_item').
        kind: 'work_item',
        // Recipients are learners — route them to their own self-service IDP page
        // (BUG-004298), which self-scopes to the signed-in learner's plan; per-learner
        // source ids remain in metadata below.
        url: '/learner/idp',
        targeting: { user_ids: recipientProfileIds },
        metadata: {
          kind: 'cdc_idp_completion_reminder',
          idp_ids: recipients.map((x) => x.idpId),
          reminded_by: senderId,
        },
      })
      .select('id')
      .single();
    if (notifErr || !notification) {
      throw new Error(notifErr?.message ?? 'Failed to create reminder notification.');
    }

    const links = recipientProfileIds.map((uid) => ({
      notification_id: (notification as { id: string }).id,
      user_id: uid,
    }));
    const { error: linkErr } = await supabase.from('user_notifications').insert(links);
    if (linkErr) {
      // The notifications row exists but no bell links — report as not sent so
      // the operator can retry, rather than reporting a false success.
      throw new Error(`Reminder notification created but delivery failed: ${linkErr.message}`);
    }

    return { sent: recipientProfileIds.length, skipped, pending };
  }
}
