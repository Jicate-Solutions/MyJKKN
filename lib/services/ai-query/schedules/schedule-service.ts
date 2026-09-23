/**
 * Scheduled AI Assistant questions — the browser half.
 *
 * Every call runs under the signed-in person's own session. Reads go straight to
 * public.ai_query_schedules (RLS: owner-only SELECT); every change goes through
 * a SECURITY DEFINER RPC pinned to auth.uid(), so a person can only ever touch
 * their own schedules. See supabase/migrations/20270305090000_ai_query_schedules.sql.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { ArtifactRef, ArtifactType } from '@/types/ai-query';
import type { AIQuerySchedule, ScheduleInput, ScheduleRpcResult } from './types';

const ARTIFACT_TYPES: ArtifactType[] = ['chart', 'report', 'spreadsheet', 'slides'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same shape-check the chat route applies to ai_jobs.result.artifacts. */
function toArtifactRefs(raw: unknown): ArtifactRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ArtifactRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== 'string' || !UUID_RE.test(a.id)) continue;
    if (typeof a.type !== 'string' || !ARTIFACT_TYPES.includes(a.type as ArtifactType)) continue;
    out.push({
      id: a.id,
      type: a.type as ArtifactType,
      title: typeof a.title === 'string' ? a.title : null,
      is_sensitive: a.is_sensitive === true,
    });
    if (out.length >= 10) break;
  }
  return out;
}

// The table and RPCs are newer than the generated Database types.
function db(): SupabaseClient {
  return createClientSupabaseClient() as unknown as SupabaseClient;
}

function asResult(data: unknown, error: { message: string } | null): ScheduleRpcResult {
  if (error) return { ok: false, error: error.message };
  if (data && typeof data === 'object') return data as ScheduleRpcResult;
  return { ok: false, error: 'No response.' };
}

export async function listMySchedules(): Promise<AIQuerySchedule[]> {
  const { data, error } = await db()
    .from('ai_query_schedules')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AIQuerySchedule[];
}

export async function createSchedule(input: ScheduleInput): Promise<ScheduleRpcResult> {
  const { data, error } = await db().rpc('fn_ai_query_schedule_create', {
    p_title: input.title,
    p_question: input.question,
    p_cadence: input.cadence,
    p_weekday: input.cadence === 'weekly' ? input.weekday : null,
    p_day_of_month: input.cadence === 'monthly' ? input.day_of_month : null,
    p_time_ist: input.time_ist,
    p_channels: input.channels,
  });
  return asResult(data, error);
}

export async function setScheduleActive(id: string, active: boolean): Promise<ScheduleRpcResult> {
  const { data, error } = await db().rpc('fn_ai_query_schedule_set_active', { p_id: id, p_active: active });
  return asResult(data, error);
}

export async function deleteSchedule(id: string): Promise<ScheduleRpcResult> {
  const { data, error } = await db().rpc('fn_ai_query_schedule_delete', { p_id: id });
  return asResult(data, error);
}

export async function runScheduleNow(id: string): Promise<ScheduleRpcResult> {
  const { data, error } = await db().rpc('fn_ai_query_schedule_run_now', { p_id: id });
  return asResult(data, error);
}

/** The latest answer of a schedule — the owner's own ai_jobs row (RLS: requested_by = auth.uid()). */
export async function getScheduleAnswer(jobId: string): Promise<{
  status: string;
  answer: string | null;
  artifacts: ArtifactRef[];
  completed_at: string | null;
} | null> {
  const { data, error } = await db()
    .from('ai_jobs')
    .select('status, result, completed_at')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    status: string;
    result: { answer?: unknown; artifacts?: unknown } | null;
    completed_at: string | null;
  };
  const answer = row.result && typeof row.result.answer === 'string' ? row.result.answer : null;
  return {
    status: row.status,
    answer,
    artifacts: toArtifactRefs(row.result?.artifacts),
    completed_at: row.completed_at,
  };
}

/** Plain-English message for a "Run now" that did not queue. */
export function runNowMessage(res: ScheduleRpcResult): string {
  if (res.ok) return 'Asked. The answer will reach you within about 15 minutes.';
  switch (res.status) {
    case 'in_flight':
      return 'The last run is still being answered. Try again once it arrives.';
    case 'busy':
      return 'You have too many questions being answered right now. Try again in a few minutes.';
    case 'skipped_limit':
      return `You have reached today's limit${res.cap ? ` of ${res.cap}` : ''} AI Assistant questions.`;
    case 'skipped_offline':
      return 'The AI Assistant is switched off right now.';
    case 'paused_no_access':
      return 'Your account no longer has access to the AI Assistant, so this schedule was paused.';
    case 'not_found':
      return 'Schedule not found.';
    default:
      return res.error ?? 'Could not run it now. Please try again.';
  }
}
