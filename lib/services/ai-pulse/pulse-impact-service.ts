// lib/services/ai-pulse/pulse-impact-service.ts
// Created: 2026-06-11 — AI Pulse "Pulse to Practice" SOP, Lane A (submit surfaces)
//
// Backs:
//   - app/(routes)/ai-pulse/submit/publication/* (Phase V publication entry)
//   - app/(routes)/ai-pulse/submit/domain-sync/* (Phase II artifact entry)
//   - app/api/ai-pulse/submit/{publication,domain-sync}/route.ts
//
// Pairs with: event_submissions (write target, upsert on event_id+registration_id),
//             ig_posts / ig_post_metrics / ig_accounts (IG verification reads),
//             ai_pulse_policies (deadline + reach thresholds — NEVER hardcoded).
//
// Pattern reference: lib/services/ai-pulse/naac-evidence-service.ts (service +
// hooks in one file, API-backed reads so server-side scoping applies) and
// lib/services/ai-pulse/learner-service.ts (cycle/team resolution with
// caller-provided client).
//
// NOTE: This file is imported by BOTH client components (hooks) and API routes
// (pure helpers + resolvers that accept a client param). Do NOT import
// '@/lib/supabase/server' here.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PulseSubmitCycle {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  demo_date: string | null;
  status: string | null;
}

export interface PulseSubmitTeam {
  registration_id: string;
  team_name: string | null;
  is_leader: boolean;
  member_count: number;
}

export interface ExistingSubmissionSummary {
  id: string;
  app_name: string | null;
  github_url: string | null;
  description: string | null;
  solution_summary: string | null;
  proof_urls: string[];
  submitted_at: string | null;
}

export interface SubmitDeadline {
  /** ISO timestamp the submission is due at, or null when the cycle has no anchor date. */
  due_at: string | null;
  /** True when "now" (server time at response build) is past due_at. */
  is_past: boolean;
}

export interface PublicationPolicies {
  ig_post_deadline_hours: number;
  ig_reach_threshold: number;
}

export interface DomainSyncPolicies {
  domain_sync_deadline_offset_days: number;
}

export interface SubmitContextBase {
  cycle: PulseSubmitCycle | null;
  team: PulseSubmitTeam | null;
  existing: ExistingSubmissionSummary | null;
  deadline: SubmitDeadline | null;
}

export interface PublicationSubmitContext extends SubmitContextBase {
  policies: PublicationPolicies;
}

export interface DomainSyncSubmitContext extends SubmitContextBase {
  policies: DomainSyncPolicies;
}

export interface PublicationSubmitPayload {
  cycle_id: string;
  ig_url: string;
  github_url?: string;
  app_name?: string;
}

export interface DomainSyncSubmitPayload {
  cycle_id: string;
  app_name: string;
  description: string;
  solution_summary?: string;
  github_url?: string;
  proof_urls?: string[];
}

export interface IgVerificationResult {
  matched: boolean;
  permalink: string | null;
  account_username: string | null;
  posted_at: string | null;
  reach: number | null;
  likes: number | null;
  reach_threshold: number;
  reach_met: boolean;
  /** 'ok' = dept account matches learner dept; 'skipped' = learner dept unresolvable. */
  department_check: 'ok' | 'skipped';
}

export interface PublicationSubmitResult {
  success: true;
  late: boolean;
  deadline: SubmitDeadline;
  ig: IgVerificationResult;
}

export interface DomainSyncSubmitResult {
  success: true;
  late: boolean;
  deadline: SubmitDeadline;
}

export interface SubmitErrorBody {
  error: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (shared by client + API routes)
// ---------------------------------------------------------------------------

/**
 * Extract an Instagram shortcode from a post/reel URL.
 * Matches https://www.instagram.com/p/<CODE>/ and /reel/<CODE>/ (live ig_posts
 * permalinks store the full URL in exactly these two shapes).
 */
export function extractIgShortcode(url: string): string | null {
  const m = /instagram\.com\/(?:p|reel)\/([^/?#]+)/i.exec(url ?? '');
  return m ? m[1] : null;
}

/** Coerce one ai_pulse_policies row out of a fetched batch with a fallback. */
export function readPolicyValue<T>(
  rows: Array<{ config_key: string; value_jsonb: unknown }>,
  key: string,
  fallback: T
): T {
  const row = rows.find((r) => r.config_key === key);
  if (!row || row.value_jsonb === null || row.value_jsonb === undefined) {
    return fallback;
  }
  return row.value_jsonb as T;
}

/** Compute a deadline from a cycle anchor + offset in milliseconds. */
export function computeDeadline(
  anchorIso: string | null | undefined,
  offsetMs: number,
  now: Date = new Date()
): SubmitDeadline {
  if (!anchorIso) return { due_at: null, is_past: false };
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return { due_at: null, is_past: false };
  const due = new Date(anchor.getTime() + offsetMs);
  return { due_at: due.toISOString(), is_past: now.getTime() > due.getTime() };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an AI Pulse cycle by id, or the current ISO-week cycle when the
 * param is 'current' / missing / not a uuid. Cycles are startup_events rows
 * discriminated by config->>'kind' = 'ai_pulse' (production convention —
 * matches learner-service / cycles-service).
 *
 * `client` is a caller-provided supabase client (session-scoped or service
 * role) so this stays importable from client bundles.
 */
export async function resolveAiPulseCycle(
  client: any,
  cycleParam: string | null | undefined
): Promise<PulseSubmitCycle | null> {
  const select = 'id, name, start_date, end_date, demo_date, status, config';

  if (cycleParam && UUID_RE.test(cycleParam)) {
    const { data, error } = await client
      .from('startup_events')
      .select(select)
      .eq('id', cycleParam)
      .filter('config->>kind', 'eq', 'ai_pulse')
      .maybeSingle();
    if (error || !data) return null;
    return data as PulseSubmitCycle;
  }

  // Current ISO week (Mon..Sun) — same bounds logic as learner-service.
  const d = new Date();
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday)
  );
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 7);

  const { data, error } = await client
    .from('startup_events')
    .select(select)
    .filter('config->>kind', 'eq', 'ai_pulse')
    .gte('start_date', monday.toISOString())
    .lt('start_date', sunday.toISOString())
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as PulseSubmitCycle;
}

/** Normalize an event_submissions row into the summary shape the forms use. */
export function toExistingSubmissionSummary(
  row: any
): ExistingSubmissionSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    app_name: row.app_name ?? null,
    github_url: row.github_url ?? null,
    description: row.description ?? null,
    solution_summary: row.solution_summary ?? null,
    proof_urls: Array.isArray(row.proof_urls)
      ? (row.proof_urls as string[]).filter(Boolean)
      : [],
    submitted_at: row.submitted_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Client-side service — talks to the API routes (cookie session; all reads /
// writes are auth + permission gated server-side).
// ---------------------------------------------------------------------------

async function fetchJsonOrThrow<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as SubmitErrorBody | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export class PulseImpactService {
  static getPublicationContext(
    cycleParam: string
  ): Promise<PublicationSubmitContext> {
    return fetchJsonOrThrow<PublicationSubmitContext>(
      `/api/ai-pulse/submit/publication?cycle=${encodeURIComponent(cycleParam)}`
    );
  }

  static getDomainSyncContext(
    cycleParam: string
  ): Promise<DomainSyncSubmitContext> {
    return fetchJsonOrThrow<DomainSyncSubmitContext>(
      `/api/ai-pulse/submit/domain-sync?cycle=${encodeURIComponent(cycleParam)}`
    );
  }

  static submitPublication(
    payload: PublicationSubmitPayload
  ): Promise<PublicationSubmitResult> {
    return fetchJsonOrThrow<PublicationSubmitResult>(
      '/api/ai-pulse/submit/publication',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
  }

  static submitDomainSync(
    payload: DomainSyncSubmitPayload
  ): Promise<DomainSyncSubmitResult> {
    return fetchJsonOrThrow<DomainSyncSubmitResult>(
      '/api/ai-pulse/submit/domain-sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
  }
}

// ---------------------------------------------------------------------------
// React Query hooks
// ---------------------------------------------------------------------------

const QK_PUB = (cycleParam: string) =>
  ['ai-pulse', 'submit', 'publication', cycleParam] as const;
const QK_DS = (cycleParam: string) =>
  ['ai-pulse', 'submit', 'domain-sync', cycleParam] as const;

export function usePublicationSubmitContext(cycleParam: string) {
  return useQuery<PublicationSubmitContext, Error>({
    queryKey: QK_PUB(cycleParam),
    queryFn: () => PulseImpactService.getPublicationContext(cycleParam),
    staleTime: 30_000,
  });
}

export function useDomainSyncSubmitContext(cycleParam: string) {
  return useQuery<DomainSyncSubmitContext, Error>({
    queryKey: QK_DS(cycleParam),
    queryFn: () => PulseImpactService.getDomainSyncContext(cycleParam),
    staleTime: 30_000,
  });
}

export function useSubmitPublication(cycleParam: string) {
  const qc = useQueryClient();
  return useMutation<PublicationSubmitResult, Error, PublicationSubmitPayload>({
    mutationFn: (payload) => PulseImpactService.submitPublication(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_PUB(cycleParam) });
    },
  });
}

export function useSubmitDomainSync(cycleParam: string) {
  const qc = useQueryClient();
  return useMutation<DomainSyncSubmitResult, Error, DomainSyncSubmitPayload>({
    mutationFn: (payload) => PulseImpactService.submitDomainSync(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_DS(cycleParam) });
    },
  });
}
