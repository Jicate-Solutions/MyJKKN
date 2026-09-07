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

export type IdCardTemplateOption = Pick<IdCardTemplate, 'id' | 'name' | 'active'>;

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
    .select('id, name, active')
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as IdCardTemplateOption[];
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
  | { status: 'queued' }
  | { status: 'already_queued' }
  | { status: 'failed'; message: string };

/**
 * Enqueue one print job. Maps the API contract to a small outcome union:
 *   201 → queued · 409 (duplicate_active_job) → already_queued · else → failed
 */
export async function enqueuePrintJob(
  profileId: string,
  templateId: string
): Promise<EnqueueOutcome> {
  try {
    const res = await fetch('/api/id-cards/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, template_id: templateId })
    });

    if (res.status === 201) return { status: 'queued' };
    if (res.status === 409) return { status: 'already_queued' };

    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // non-JSON error body — keep the status-code message
    }
    return { status: 'failed', message };
  } catch (err) {
    return {
      status: 'failed',
      message: err instanceof Error ? err.message : 'Network error'
    };
  }
}
