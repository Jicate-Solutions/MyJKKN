// lib/services/admission/student-form-service.ts
//
// Server-only service: token CRUD + section save + final submit + revoke.
// Always uses the service-role Supabase client (never user-context) because
// the student-form write path bypasses RLS by design — the column whitelist
// is the security boundary.

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  STUDENT_WRITABLE_COLUMNS,
  filterToWhitelist,
  type StudentSection,
} from './student-form-write-whitelist';
import { signToken, hashRawToken } from './student-form-hmac';

const TOKEN_TTL_SECONDS = 30 * 60;

interface GenerateResult {
  token: string;        // raw signed token; goes in URL
  token_id: string;     // UUID; matches learner_self_fill_tokens.id
  expires_at: string;   // ISO
}

interface TokenContext {
  token_id: string;
  learner_profile_id: string;
  status: 'active' | 'consumed' | 'expired' | 'superseded';
  expires_at: string;
  consumed_at: string | null;
  section_progress: { basic_done: boolean; academic_done: boolean; contact_done: boolean };
  is_profile_complete: boolean;
}

export class StudentFormService {
  /**
   * Generate a fresh token for a learner. Marks any prior active token as
   * 'superseded'. Caller must have already checked the learner's
   * is_profile_complete is false.
   */
  static async generateToken(
    learnerProfileId: string,
    byUserId: string,
  ): Promise<GenerateResult> {
    const svc = createServiceRoleClient();

    // 1. Verify learner exists and is not yet complete
    const { data: learner, error: leadErr } = await (svc as any)
      .from('learners_profiles')
      .select('id, is_profile_complete')
      .eq('id', learnerProfileId)
      .single();
    if (leadErr || !learner) throw new Error('learner_not_found');
    if (learner.is_profile_complete) throw new Error('already_submitted');

    // 2. Supersede prior active token (if any)
    await (svc as any)
      .from('learner_self_fill_tokens')
      .update({ status: 'superseded' })
      .eq('learner_profile_id', learnerProfileId)
      .eq('status', 'active');

    // 3. Insert new token row (DB generates id)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
    const { data: row, error: insErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .insert({
        learner_profile_id: learnerProfileId,
        token_hash: 'placeholder',  // updated below; needed for unique constraint
        status: 'active',
        expires_at: expiresAt.toISOString(),
        generated_by: byUserId,
      })
      .select('id')
      .single();
    if (insErr || !row) throw new Error('token_insert_failed: ' + (insErr?.message ?? ''));

    // 4. Sign token + write hash back
    const now = Math.floor(Date.now() / 1000);
    const rawToken = signToken({ tid: row.id, iat: now, exp: now + TOKEN_TTL_SECONDS });
    const tokenHash = hashRawToken(rawToken);
    const { error: updErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .update({ token_hash: tokenHash })
      .eq('id', row.id);
    if (updErr) throw new Error('token_hash_write_failed: ' + updErr.message);

    return { token: rawToken, token_id: row.id, expires_at: expiresAt.toISOString() };
  }

  /**
   * Validate a raw token (HMAC + DB row + expiry + learner state).
   * Throws on any failure. Returns the rich context the API endpoints need.
   */
  static async validateToken(rawToken: string): Promise<TokenContext> {
    const { verifyToken } = await import('./student-form-hmac');
    const payload = verifyToken(rawToken);  // throws on bad sig / expired / malformed

    const tokenHash = hashRawToken(rawToken);
    const svc = createServiceRoleClient();

    const { data: row, error: rowErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .select('id, learner_profile_id, status, expires_at, consumed_at, section_progress')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (rowErr) throw new Error('db_error');
    if (!row) throw new Error('token_not_found');
    if (row.id !== payload.tid) throw new Error('token_id_mismatch');
    if (row.status !== 'active') throw new Error(row.status);  // 'consumed' | 'superseded' | 'expired'

    // Lazy expiry check on read
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await (svc as any)
        .from('learner_self_fill_tokens')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .eq('status', 'active');
      throw new Error('expired');
    }

    // Learner-level lockdown — even active tokens fail if learner already submitted
    const { data: learner, error: lErr } = await (svc as any)
      .from('learners_profiles')
      .select('is_profile_complete')
      .eq('id', row.learner_profile_id)
      .single();
    if (lErr || !learner) throw new Error('learner_not_found');
    if (learner.is_profile_complete) throw new Error('consumed');

    return {
      token_id: row.id,
      learner_profile_id: row.learner_profile_id,
      status: row.status,
      expires_at: row.expires_at,
      consumed_at: row.consumed_at,
      section_progress: row.section_progress,
      is_profile_complete: learner.is_profile_complete,
    };
  }

  /**
   * Save one section's fields (auto-save during wizard navigation).
   * `final=false` means "continue" tap; `final=true` means final submit
   * (flips is_profile_complete=true, consumes the token, writes audit).
   */
  static async saveSection(
    rawToken: string,
    section: StudentSection,
    fields: Record<string, unknown>,
    final: boolean,
  ): Promise<void> {
    const ctx = await this.validateToken(rawToken);
    const svc = createServiceRoleClient();

    const allowedFields = filterToWhitelist(section, fields);
    if (Object.keys(allowedFields).length > 0) {
      const { error } = await (svc as any)
        .from('learners_profiles')
        .update(allowedFields)
        .eq('id', ctx.learner_profile_id);
      if (error) throw new Error('learner_update_failed: ' + error.message);
    }

    // Mark section_progress[<section>_done] = true on the token row
    const progressKey = `${section}_done`;
    const newProgress = { ...ctx.section_progress, [progressKey]: true };

    if (!final) {
      const { error } = await (svc as any)
        .from('learner_self_fill_tokens')
        .update({ section_progress: newProgress })
        .eq('id', ctx.token_id);
      if (error) throw new Error('progress_update_failed: ' + error.message);
      return;
    }

    // Final submit: consume token + flip is_profile_complete + audit log
    const { error: tokenErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .update({
        status: 'consumed',
        consumed_at: new Date().toISOString(),
        section_progress: newProgress,
      })
      .eq('id', ctx.token_id)
      .eq('status', 'active');
    if (tokenErr) throw new Error('token_consume_failed: ' + tokenErr.message);

    const { error: completeErr } = await (svc as any)
      .from('learners_profiles')
      .update({ is_profile_complete: true, updated_at: new Date().toISOString() })
      .eq('id', ctx.learner_profile_id);
    if (completeErr) throw new Error('complete_flag_failed: ' + completeErr.message);

    // 3 activity rows — one per section — for audit
    const activityRows = (['basic', 'academic', 'contact'] as const).map((s) => ({
      lead_id: null,  // student-form is post-conversion; no admission_lead context
      profile_id: ctx.learner_profile_id,
      activity_type: 'student_section_filled',
      description: `Filled ${s} section via student form`,
      metadata: { section: s, filled_via: 'qr_self_fill' },
    }));
    const { error: actErr } = await (svc as any)
      .from('admission_lead_activities')
      .insert(activityRows);
    if (actErr) console.warn('[StudentFormService] activity log failed:', actErr.message);
  }

  /**
   * Manually revoke an active token (admission action).
   */
  static async revokeToken(tokenId: string, byUserId: string): Promise<void> {
    const svc = createServiceRoleClient();
    const { error } = await (svc as any)
      .from('learner_self_fill_tokens')
      .update({ status: 'superseded' })
      .eq('id', tokenId)
      .eq('status', 'active');
    if (error) throw new Error('revoke_failed: ' + error.message);
  }
}
