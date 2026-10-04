// ============================================================================
// lib/services/id-cards/print-jobs-client.ts
// Created: 2026-07-24 — Phase 2 (one-click ID-card printing).
//
// Browser-side helpers for the ID-card print flow:
//   • fetchIdCardTemplates()          — template picker options (session RLS)
//   • resolveProfileIdForLearner()    — learners_profiles.id → profiles.id
//   • resolveProfileIdsForLearners()  — batch variant for bulk printing
//   • resolveAccountsForLearners()    — batch variant returning the account id
//   • resolveProfileIdByEmail()       — team-member fallback (profiles.email)
//   • enqueuePrintJob()               — POST /api/id-cards/jobs, mapped outcomes
//   • getLastTemplateId()/setLastTemplateId() — localStorage memory of the
//     last template choice (key: idcards.lastTemplateId)
//
// All reads go through the session-scoped browser client, so RLS
// (id_cards.templates.view / profiles policies) stays in force.
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { IdCardTemplate } from '@/types/id-cards';
import { purposeOfLayout, type TemplatePurpose } from '@/lib/id-cards/template-purpose';

export type IdCardTemplateOption = Pick<IdCardTemplate, 'id' | 'name' | 'active' | 'institution_id'> & {
  /** Learners / Senior Learners / Administrators … (front_layout_json.purpose). */
  purpose: TemplatePurpose;
};

export const LAST_TEMPLATE_STORAGE_KEY = 'idcards.lastTemplateId';

export function getLastTemplateId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LAST_TEMPLATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastTemplateId(templateId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_TEMPLATE_STORAGE_KEY, templateId);
  } catch {
    // localStorage unavailable (private mode) — remembering the choice is best-effort
  }
}

/**
 * List ID-card templates the current session may see (RLS-enforced).
 * Active templates sort first, then alphabetically.
 */
export async function fetchIdCardTemplates(): Promise<IdCardTemplateOption[]> {
  const supabase = createClientSupabaseClient();
  // id_card_templates is not yet present in the generated Database types
  // (types/supabase.ts) — cast for this one query. RLS still applies.
  const { data, error } = await (supabase.from('id_card_templates' as never) as any)
    .select('id, name, active, institution_id, front_layout_json')
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as Array<IdCardTemplateOption & { front_layout_json?: unknown }>).map(
    ({ front_layout_json, ...row }) => ({ ...row, purpose: purposeOfLayout(front_layout_json) })
  );
}

/**
 * Resolve a learner (learners_profiles.id) to their account (profiles.id)
 * via profiles.learner_id. Returns null when the learner has no account yet.
 */
export async function resolveProfileIdForLearner(
  learnerId: string
): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('learner_id', learnerId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

// PostgREST encodes .in() filters in the request URL, so a whole-cohort batch
// (1000+ UUIDs ≈ 37 KB) would overflow URL limits. 100 ids ≈ 3.7 KB — safe.
const RESOLVE_CHUNK_SIZE = 100;

export interface LearnerAccountInfo {
  /** profiles.id — the account the print job is enqueued against. */
  profileId: string;
}

// profiles.avatar_url used to ride along here as the last link of the render
// engine's photo fallback chain, so callers could predict an initials box.
// Removed 2026-09-03: an account avatar no longer qualifies a card at all
// (Guard 3), so fetching it told callers nothing and invited the old rule back.

/**
 * Batch account resolution: map learners_profiles.id → account info
 * (profiles.id), chunked to stay within URL limits at cohort
 * scale (freshers batch / whole class).
 * Learners without an account are simply absent from the returned map.
 */
export async function resolveAccountsForLearners(
  learnerIds: string[]
): Promise<Map<string, LearnerAccountInfo>> {
  const map = new Map<string, LearnerAccountInfo>();
  if (learnerIds.length === 0) return map;

  const supabase = createClientSupabaseClient();
  for (let i = 0; i < learnerIds.length; i += RESOLVE_CHUNK_SIZE) {
    const chunk = learnerIds.slice(i, i + RESOLVE_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (row.learner_id) {
        map.set(row.learner_id, { profileId: row.id });
      }
    }
  }
  return map;
}

/**
 * Batch variant: map learners_profiles.id → profiles.id. Thin wrapper over
 * resolveAccountsForLearners (same chunked query) for callers that only need
 * the account id.
 */
export async function resolveProfileIdsForLearners(
  learnerIds: string[]
): Promise<Map<string, string>> {
  const accounts = await resolveAccountsForLearners(learnerIds);
  const map = new Map<string, string>();
  for (const [learnerId, info] of accounts) {
    map.set(learnerId, info.profileId);
  }
  return map;
}

/**
 * Team-member fallback: match profiles.email when staff.profile_id is not set.
 * (The staff table links to accounts via profile_id — see lib/services/staff.)
 */
export async function resolveProfileIdByEmail(
  email: string
): Promise<string | null> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export type EnqueueOutcome =
  | { status: 'queued'; /** Set when the card was a chargeable replacement. */ chargeMessage?: string }
  | { status: 'already_queued'; jobId: string | null }
  /**
   * The person has used up their free cards: the server refuses until the
   * caller re-submits with the fee acknowledged. NOT a queue collision — the
   * print queue is empty for this person.
   */
  | {
      status: 'replacement_fee';
      replacementNumber: number;
      feeAmount: number;
      feeCurrency: string;
      message: string;
    }
  | { status: 'failed'; message: string };

export interface EnqueueOptions {
  /** The in-charge has seen the replacement fee and accepts the charge. */
  acknowledgeReplacementFee?: boolean;
}

/**
 * Enqueue one print job. Maps the API contract to a small outcome union:
 *   201 → queued
 *   409 duplicate_active_job     → already_queued (carries the job id)
 *   409 replacement_fee_required → replacement_fee (carries the price)
 *   any other status / 409 code  → failed (server message)
 *
 * Every 409 used to collapse into already_queued, so a learner whose first
 * card had already been printed saw "Already in the print queue" on an empty
 * queue and a "Cancel & re-queue" that had nothing to cancel.
 */
export async function enqueuePrintJob(
  profileId: string,
  templateId: string,
  options: EnqueueOptions = {}
): Promise<EnqueueOutcome> {
  try {
    const res = await fetch('/api/id-cards/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile_id: profileId,
        template_id: templateId,
        ...(options.acknowledgeReplacementFee ? { replacement_fee_acknowledged: true } : {})
      })
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // no / non-JSON body — every branch below copes with null
    }
    const b = (body ?? {}) as {
      error?: { message?: string; code?: string };
      data?: Record<string, unknown>;
      replacement?: { message?: string };
    };

    if (res.status === 201) {
      const chargeMessage =
        typeof b.replacement?.message === 'string' ? b.replacement.message : undefined;
      return chargeMessage ? { status: 'queued', chargeMessage } : { status: 'queued' };
    }

    if (res.status === 409) {
      const code = b.error?.code;
      if (code === 'replacement_fee_required') {
        const d = b.data ?? {};
        return {
          status: 'replacement_fee',
          replacementNumber: typeof d.replacement_number === 'number' ? d.replacement_number : 1,
          feeAmount: typeof d.fee_amount === 'number' ? d.fee_amount : 0,
          feeCurrency: typeof d.fee_currency === 'string' ? d.fee_currency : 'INR',
          message: b.error?.message ?? 'A replacement fee applies to this card.'
        };
      }
      // duplicate_active_job — and, for older servers without a code, any 409
      // that carries a job row.
      if (code === 'duplicate_active_job' || (!code && typeof b.data?.id === 'string')) {
        return {
          status: 'already_queued',
          jobId: typeof b.data?.id === 'string' ? (b.data.id as string) : null
        };
      }
      return { status: 'failed', message: b.error?.message ?? 'Request refused (409)' };
    }

    return {
      status: 'failed',
      message: b.error?.message ?? `Request failed (${res.status})`
    };
  } catch (err) {
    return {
      status: 'failed',
      message: err instanceof Error ? err.message : 'Network error'
    };
  }
}

/** Cancel an active (not yet printed) job. Resolves false when the server refused. */
export async function cancelPrintJob(jobId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/id-cards/jobs/${jobId}`, { method: 'DELETE' });
    if (res.ok) return { ok: true };
    let message = `Cancel failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // keep the status message
    }
    return { ok: false, message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Enqueue; when a job is already active for the person, cancel it and enqueue
 * again ("re-queue"). Used by the Print ID Card button's "Cancel & re-queue"
 * action and by the bulk dialog's re-queue option.
 */
export async function requeuePrintJob(
  profileId: string,
  templateId: string,
  options: EnqueueOptions = {}
): Promise<EnqueueOutcome> {
  const first = await enqueuePrintJob(profileId, templateId, options);
  if (first.status !== 'already_queued' || !first.jobId) return first;
  const cancelled = await cancelPrintJob(first.jobId);
  if (cancelled.ok === false) return { status: 'failed', message: cancelled.message };
  return enqueuePrintJob(profileId, templateId, options);
}
