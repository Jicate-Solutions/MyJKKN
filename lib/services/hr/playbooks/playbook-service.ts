/**
 * HR duty playbooks — every call goes through the SECURITY DEFINER functions in
 * supabase/migrations/20271007161139_hr_duty_playbooks_and_lessons.sql, with the
 * caller's own session (the functions check auth.uid() and the manage key).
 * The two cron functions (harvest, propose) are service-role only.
 *
 * Errors keep the database's SQLSTATE so a route can answer with the right
 * status: 42501 refused, 22023 bad input, P0002 not found, 55000 already
 * decided, 54000 too many waiting suggestions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  PlaybookContributor,
  PlaybookDecideInput,
  PlaybookLine,
  PlaybookProposal,
} from '@/types/hr-playbook';
import { HR_DUTY_CODE_PATTERN } from '@/types/hr-playbook';

export class PlaybookError extends Error {
  constructor(message: string, public readonly code: string | null, public readonly status: number) {
    super(message);
    this.name = 'PlaybookError';
  }
}

const STATUS_BY_SQLSTATE: Record<string, number> = {
  '42501': 403,
  '22023': 400,
  '22004': 400,
  P0002: 404,
  '55000': 409,
  '54000': 429,
};

function toError(error: { message?: string; code?: string | null } | null | undefined): PlaybookError {
  const code = error?.code ?? null;
  return new PlaybookError(error?.message ?? 'Unknown error', code, (code && STATUS_BY_SQLSTATE[code]) || 500);
}

function assertDuty(duty: string): void {
  if (!HR_DUTY_CODE_PATTERN.test(duty)) throw new PlaybookError('Unknown duty.', '22023', 400);
}

export const playbookService = {
  async linesForDuty(supabase: SupabaseClient, duty: string): Promise<PlaybookLine[]> {
    assertDuty(duty);
    const { data, error } = await supabase.rpc('fn_hr_playbook_for_duty', { p_duty: duty });
    if (error) throw toError(error);
    return (data ?? []) as PlaybookLine[];
  },

  /** The HR head sees every waiting proposal; anyone else sees only their own suggestions. */
  async openProposals(supabase: SupabaseClient): Promise<PlaybookProposal[]> {
    const { data, error } = await supabase.rpc('fn_hr_playbook_open_proposals');
    if (error) throw toError(error);
    return (data ?? []) as PlaybookProposal[];
  },

  async contributors(supabase: SupabaseClient): Promise<PlaybookContributor[]> {
    const { data, error } = await supabase.rpc('fn_hr_playbook_contributors');
    if (error) throw toError(error);
    return (data ?? []) as PlaybookContributor[];
  },

  async suggest(supabase: SupabaseClient, duty: string, text: string): Promise<string> {
    assertDuty(duty);
    const { data, error } = await supabase.rpc('fn_hr_playbook_suggest', { p_duty: duty, p_text: text });
    if (error) throw toError(error);
    return data as string;
  },

  async decide(supabase: SupabaseClient, proposalId: string, input: PlaybookDecideInput): Promise<string> {
    const { data, error } = await supabase.rpc('fn_hr_playbook_decide', {
      p_id: proposalId,
      p_decision: input.decision,
      p_edited_text: input.edited_text ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw toError(error);
    return data as string;
  },

  async retireLine(supabase: SupabaseClient, lineId: string, note: string): Promise<string> {
    const { data, error } = await supabase.rpc('fn_hr_playbook_retire_line', { p_id: lineId, p_note: note });
    if (error) throw toError(error);
    return data as string;
  },
};

/**
 * Weekly cron (service role): gather reasons into the lessons log, then draft
 * proposals. A source the harvest could not read comes back as {error} inside
 * the result — that counts as a failure too, so the run is never reported as
 * fine while a source is silently skipped.
 */
export async function runPlaybookLessons(
  serviceClient: SupabaseClient,
  now: Date = new Date(),
): Promise<{ ok: boolean; harvested: Record<string, unknown> | null; proposed: number | null; errors: string[] }> {
  const errors: string[] = [];
  const since = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString();

  const h = await serviceClient.rpc('fn_hr_duty_lessons_harvest', { p_since: since });
  let harvested: Record<string, unknown> | null = null;
  if (h.error) {
    errors.push(`harvest: ${h.error.message}`);
  } else {
    harvested = (h.data ?? {}) as Record<string, unknown>;
    for (const [duty, v] of Object.entries(harvested)) {
      if (v && typeof v === 'object' && 'error' in (v as Record<string, unknown>)) {
        errors.push(`harvest ${duty}: ${String((v as Record<string, unknown>).error)}`);
      }
    }
  }

  // Propose even after a partial harvest: what was gathered is still real.
  const p = await serviceClient.rpc('fn_hr_playbook_propose_from_lessons');
  let proposed: number | null = null;
  if (p.error) errors.push(`propose: ${p.error.message}`);
  else proposed = typeof p.data === 'number' ? p.data : Number(p.data ?? 0);

  return { ok: errors.length === 0, harvested, proposed, errors };
}
