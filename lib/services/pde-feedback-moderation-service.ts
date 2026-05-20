/**
 * PDE Feedback Moderation Service
 * ============================================================================
 *
 * Ships PDE Tier 3 item T3.5. Enforces `pde.governance.feedback_identity_policy`
 * (read via `getFeedbackIdentityPolicy()` in `pde-policy-reader.ts`) on the
 * peer / validator feedback that lives inside `pde_demonstrations.validator_notes`
 * (jsonb). No dedicated `pde_feedback` table exists in production — discovery
 * probe on 2026-05-19 confirmed only `hr_feedback_dimensions` and `mess_feedback`
 * sit under the `%feedback%` mask, neither of which is PDE-scoped.
 *
 * Note shape inside `validator_notes` (jsonb array):
 *   { id, author_id, body, submitted_at,
 *     moderation_status: 'pending'|'approved'|'redacted'|'rejected',
 *     moderation_reason?, moderated_by?, moderated_at? }
 *
 * `moderation_status` defaults to `'pending'` for any note missing the field
 * (back-compat with rows authored before this service shipped). Once policy
 * `mode === 'attributed_moderated'` (the seeded default), pending notes are
 * surfaced in the queue; admins approve / redact / reject.
 *
 * Pattern alignment: thin class with static methods, mirrors
 * `lib/services/pde-pace-cap-service.ts`. All Supabase calls go through
 * `createServerSupabaseClient()` — every consumer runs in a server route.
 *
 * Phase: PDE Tier 3 — 2026-05-19.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getFeedbackIdentityPolicy } from '@/lib/services/pde-policy-reader';
import type { FeedbackIdentityPolicy } from '@/lib/services/pde-policy-reader-types';

export type ModerationDecision = 'approve' | 'redact' | 'reject';
export type ModerationStatus = 'pending' | 'approved' | 'redacted' | 'rejected';

export interface PdeFeedbackNote {
  id: string;
  author_id?: string | null;
  body: string;
  submitted_at?: string | null;
  moderation_status: ModerationStatus;
  moderation_reason?: string | null;
  moderated_by?: string | null;
  moderated_at?: string | null;
}

export interface PendingFeedbackItem {
  demonstration_id: string;
  institution_id: string | null;
  category_key: string;
  learner_id: string;
  note: PdeFeedbackNote;
}

/**
 * Coerces a raw jsonb value (which may be null, an array, or a malformed object)
 * into a typed `PdeFeedbackNote[]`. Notes without a `moderation_status` field
 * are treated as `'pending'` so legacy rows surface in the queue.
 */
function coerceNotes(raw: unknown): PdeFeedbackNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n, idx) => {
      if (n == null || typeof n !== 'object') return null;
      const note = n as Record<string, unknown>;
      const body = typeof note.body === 'string' ? note.body : '';
      if (!body) return null;
      const status =
        note.moderation_status === 'approved' ||
        note.moderation_status === 'redacted' ||
        note.moderation_status === 'rejected'
          ? (note.moderation_status as ModerationStatus)
          : ('pending' as ModerationStatus);
      return {
        id: typeof note.id === 'string' ? note.id : `${idx}`,
        author_id: typeof note.author_id === 'string' ? note.author_id : null,
        body,
        submitted_at:
          typeof note.submitted_at === 'string' ? note.submitted_at : null,
        moderation_status: status,
        moderation_reason:
          typeof note.moderation_reason === 'string'
            ? note.moderation_reason
            : null,
        moderated_by:
          typeof note.moderated_by === 'string' ? note.moderated_by : null,
        moderated_at:
          typeof note.moderated_at === 'string' ? note.moderated_at : null,
      } satisfies PdeFeedbackNote;
    })
    .filter((n): n is PdeFeedbackNote => n != null);
}

export class PDEFeedbackModerationService {
  /**
   * Returns all feedback notes across `pde_demonstrations` whose
   * `moderation_status` is `'pending'`. Honors `pde.governance.feedback_identity_policy`
   * — when policy mode is `'fully_anonymous'`, the `author_id` is stripped before
   * leaving the service, even from the moderation queue.
   */
  static async listPendingFeedback(
    institutionId?: string | null
  ): Promise<{
    items: PendingFeedbackItem[];
    policy: FeedbackIdentityPolicy;
  }> {
    const supabase = await createServerSupabaseClient();
    const policy = await getFeedbackIdentityPolicy(institutionId ?? null);

    let query = supabase
      .from('pde_demonstrations')
      .select('id, institution_id, category_key, learner_id, validator_notes')
      .not('validator_notes', 'is', null);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `PDEFeedbackModerationService.listPendingFeedback failed: ${error.message}`
      );
    }

    const items: PendingFeedbackItem[] = [];
    for (const row of data ?? []) {
      const notes = coerceNotes(
        (row as { validator_notes: unknown }).validator_notes
      );
      for (const note of notes) {
        if (note.moderation_status !== 'pending') continue;
        const visibleNote: PdeFeedbackNote =
          policy.mode === 'fully_anonymous'
            ? { ...note, author_id: null }
            : note;
        items.push({
          demonstration_id: (row as { id: string }).id,
          institution_id:
            (row as { institution_id: string | null }).institution_id ?? null,
          category_key: (row as { category_key: string }).category_key,
          learner_id: (row as { learner_id: string }).learner_id,
          note: visibleNote,
        });
      }
    }
    return { items, policy };
  }

  /**
   * Applies a moderation decision to a single note inside
   * `pde_demonstrations.validator_notes`. Reads the current array, mutates the
   * one note whose `id` matches, writes back. RLS on `pde_demonstrations` is the
   * hard layer; this service is the soft layer that encodes the policy
   * (e.g. blocks moderation on non-moderated modes).
   */
  static async moderateFeedback(
    demonstrationId: string,
    noteId: string,
    decision: ModerationDecision,
    moderatorId: string,
    reason: string | null
  ): Promise<PdeFeedbackNote> {
    const supabase = await createServerSupabaseClient();
    const policy = await getFeedbackIdentityPolicy(null);

    if (policy.mode === 'fully_anonymous') {
      // Anonymous-only mode skips moderation per policy.
      throw new Error(
        `Moderation disabled: feedback_identity_policy.mode is 'fully_anonymous'`
      );
    }

    const { data: row, error: readErr } = await supabase
      .from('pde_demonstrations')
      .select('id, validator_notes')
      .eq('id', demonstrationId)
      .maybeSingle();

    if (readErr) {
      throw new Error(
        `PDEFeedbackModerationService.moderateFeedback read failed: ${readErr.message}`
      );
    }
    if (!row) {
      throw new Error(`Demonstration ${demonstrationId} not found`);
    }

    const notes = coerceNotes((row as { validator_notes: unknown }).validator_notes);
    const targetIdx = notes.findIndex((n) => n.id === noteId);
    if (targetIdx < 0) {
      throw new Error(`Note ${noteId} not found on demonstration ${demonstrationId}`);
    }

    const nextStatus: ModerationStatus =
      decision === 'approve'
        ? 'approved'
        : decision === 'redact'
          ? 'redacted'
          : 'rejected';

    const updated: PdeFeedbackNote = {
      ...notes[targetIdx],
      moderation_status: nextStatus,
      moderation_reason: reason ?? notes[targetIdx].moderation_reason ?? null,
      moderated_by: moderatorId,
      moderated_at: new Date().toISOString(),
      // Redact wipes the body; approve/reject leave it intact.
      body: decision === 'redact' ? '[redacted]' : notes[targetIdx].body,
    };
    notes[targetIdx] = updated;

    const { error: writeErr } = await supabase
      .from('pde_demonstrations')
      .update({ validator_notes: notes, updated_at: new Date().toISOString() })
      .eq('id', demonstrationId);

    if (writeErr) {
      throw new Error(
        `PDEFeedbackModerationService.moderateFeedback write failed: ${writeErr.message}`
      );
    }
    return updated;
  }
}
