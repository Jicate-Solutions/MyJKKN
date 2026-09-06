// lib/services/admission/student-form-service.ts
//
// Server-only service: token CRUD + section save + final submit + revoke.
// Always uses the service-role Supabase client (never user-context) because
// the student-form write path bypasses RLS by design — the column whitelist
// is the security boundary.

import 'server-only';
import crypto from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  STUDENT_WRITABLE_COLUMNS,
  filterToWhitelist,
  type StudentSection,
} from './student-form-write-whitelist';
import { signToken, hashRawToken } from './student-form-hmac';
import { buildAccommodationTypeResolver } from '@/lib/utils/accommodation-type-resolver';

// Token lifetime in seconds. Updated 2026-05-20 from 30 to 60 minutes per
// product call — students at the counter often need more time to chase parent
// signatures / mark-sheets between sections. Both the HMAC-signed `exp` claim
// (signToken below) and the DB `expires_at` column (insert below) derive from
// this constant, so this is the single source of truth.
const TOKEN_TTL_SECONDS = 60 * 60;

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

    // 3. Generate token id + sign + hash UP-FRONT, then a single INSERT.
    //    Earlier we did a two-step "insert with placeholder, update with
    //    real hash" — that worked exactly once because every subsequent
    //    insert re-collided on token_hash='placeholder' (the column has a
    //    UNIQUE constraint). Generating the id in JS removes the dependency
    //    on a server-assigned UUID and lets us write the real hash from the
    //    start.
    const tokenId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const rawToken = signToken({ tid: tokenId, iat: now, exp: now + TOKEN_TTL_SECONDS });
    const tokenHash = hashRawToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

    const { error: insErr } = await (svc as any)
      .from('learner_self_fill_tokens')
      .insert({
        id: tokenId,
        learner_profile_id: learnerProfileId,
        token_hash: tokenHash,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        generated_by: byUserId,
      });
    if (insErr) throw new Error('token_insert_failed: ' + insErr.message);

    return { token: rawToken, token_id: tokenId, expires_at: expiresAt.toISOString() };
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

    // accommodation_type TEXT is retired. The form still sends the HOSTEL/DAY
    // SCHOLAR choice as `accommodation_type` (not whitelisted anymore), so
    // resolve it to the global accommodation_types FK here and write that.
    // Read the raw `fields` (the text was filtered out of allowedFields).
    if (
      section === 'accommodation' &&
      typeof fields.accommodation_type === 'string' &&
      fields.accommodation_type.trim() !== ''
    ) {
      const resolveAccommodation = await buildAccommodationTypeResolver(svc);
      allowedFields.accommodation_type_id =
        resolveAccommodation(fields.accommodation_type as string) ?? null;
    }

    // Nullable UUID FKs must never reach the UPDATE as '' — Postgres rejects an
    // empty string cast to uuid with 22P02. Coerce blank → null for every
    // uuid-typed writable column the student form can submit.
    //
    // 2026-06-10: list extended to ALL uuid columns across every section.
    // department_id was the painful one — it's prefilled as `?? ''` in
    // step-course-selection, is NOT wizard-required, and only gets set when
    // the student re-picks a Program. Legacy leads with a null department
    // sent department_id='' → 22P02 aborted the whole course UPDATE → the
    // step silently refused to advance. transport_route_id/transport_stop_id
    // had the same gap on the accommodation step.
    for (const uuidCol of [
      'hostel_category_id', 'mess_category_id', 'community_category_id',
      'caste_id', 'quota_id', 'accommodation_type_id',
      'institution_id', 'degree_id', 'department_id', 'program_id',
      'semester_id', 'section_id', 'admission_year_id', 'academic_year_id',
      'transport_route_id', 'transport_stop_id',
    ]) {
      if (allowedFields[uuidCol] === '') allowedFields[uuidCol] = null;
    }

    // When the student writes the Course Selection step, picking a different
    // institution/program may invalidate the existing admission_year_id.
    // The DB trigger `validate_learner_admission_year_scope` will reject the
    // UPDATE with `check_violation` if it detects a mismatch. Detect that
    // case here and add `admission_year_id = null` to the payload so the
    // trigger short-circuits at `IF NEW.admission_year_id IS NULL RETURN NEW`.
    //
    // Admin staff re-attach the correct admission_year via the enquiry form
    // later — same recovery flow the convert route uses on initial conversion.
    if (section === 'course') {
      const newInst = (allowedFields.institution_id ?? null) as string | null;

      const { data: current } = await (svc as any)
        .from('learners_profiles')
        .select('admission_year_id, institution_id, program_id')
        .eq('id', ctx.learner_profile_id)
        .maybeSingle();

      if (current?.admission_year_id) {
        // Compare against the CURRENT admission_year's scope, not the row's
        // institution/program columns — those might already be stale.
        const { data: ay } = await (svc as any)
          .from('admission_years')
          .select('institution_id')
          .eq('id', current.admission_year_id)
          .maybeSingle();

        // admission_years is now institution-wide (program dimension dropped),
        // so the scope check is institution-only — mirrors the
        // validate_learner_admission_year_scope trigger.
        const effInst = newInst ?? current.institution_id;

        const instMismatch = ay && ay.institution_id !== effInst;

        if (instMismatch) {
          (allowedFields as Record<string, unknown>).admission_year_id = null;
        }
      }
    }

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

    // Final submit. Order: lookup lead_id → write audit rows → consume
    // token → flip is_profile_complete. Audit happens BEFORE consume so a
    // partial failure leaves the form re-submittable rather than half-locked.
    //
    // admission_lead_activities.lead_id is NOT NULL, so we resolve the lead
    // via admission_leads.learner_profile_id. Most converted leads will have
    // exactly one such row (FK is one-to-one), but a handful of learners
    // were created without a corresponding admission_leads entry (legacy
    // imports). For those we skip the audit rows with a warning rather
    // than blocking the submit.

    let leadId: string | null = null;
    {
      const { data: leadRow } = await (svc as any)
        .from('admission_leads')
        .select('id')
        .eq('learner_profile_id', ctx.learner_profile_id)
        .maybeSingle();
      leadId = leadRow?.id ?? null;
    }

    if (leadId) {
      const sectionActivities = (['basic', 'academic', 'contact'] as const).map((s) => ({
        lead_id: leadId,
        activity_type: 'student_section_filled',
        subject: `Student filled ${s} section via QR`,
        description: `Section: ${s}. Filled via QR self-fill at counter.`,
      }));
      // 2026-05-20: also log a summary row to make the workflow transition
      // visible on the activities timeline without scanning for the 3 section
      // rows individually. Admission officers filter their queue on this.
      const submitActivity = {
        lead_id: leadId,
        activity_type: 'enquiry_submitted',
        subject: 'Enquiry form submitted via QR',
        description: 'Learner completed all required sections of the QR self-fill form. Awaiting admission officer verification.',
      };
      const { error: actErr } = await (svc as any)
        .from('admission_lead_activities')
        .insert([...sectionActivities, submitActivity]);
      if (actErr) {
        // Audit failure is non-fatal — log loudly but continue with submit
        // rather than block the student at the counter.
        console.warn('[StudentFormService] activity log failed:', actErr.message);
      }
    } else {
      console.warn(
        '[StudentFormService] no admission_leads row for learner',
        ctx.learner_profile_id,
        '— skipping activity audit',
      );
    }

    // Consume the token (single UPDATE — atomic at row level)
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

    // Flip the learner's completion flag AND promote to 'enquiry_submitted'.
    // The lifecycle_status update is guarded with `.eq('lifecycle_status', 'enquiry')`
    // so we never downgrade a learner who has already moved further along the
    // workflow (e.g. account, reserved, admitted) — useful if an officer
    // accidentally re-issues a token for a learner who has already progressed.
    const { error: completeErr } = await (svc as any)
      .from('learners_profiles')
      .update({
        is_profile_complete: true,
        lifecycle_status: 'enquiry_submitted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.learner_profile_id)
      .eq('lifecycle_status', 'enquiry');
    if (completeErr) {
      // If the row was skipped because status had moved past 'enquiry', fall
      // back to flipping just the completion flag so the existing UX remains.
      const isLifecycleSkip =
        /lifecycle_status/i.test(completeErr.message || '') ||
        /no rows/i.test(completeErr.message || '');
      if (!isLifecycleSkip) {
        throw new Error('complete_flag_failed: ' + completeErr.message);
      }
      const { error: fallbackErr } = await (svc as any)
        .from('learners_profiles')
        .update({ is_profile_complete: true, updated_at: new Date().toISOString() })
        .eq('id', ctx.learner_profile_id);
      if (fallbackErr) throw new Error('complete_flag_failed: ' + fallbackErr.message);
    }
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
