/**
 * The weekly Power Users report (Director 2026-10-09): the shapes
 * fn_adoption_power_users returns, the IST week arithmetic, the one-person
 * chat-agenda prompt, the agenda parser, and the reader the super-admin
 * /admin/adoption page uses. Lives here, not in the route file: Next.js route
 * files may only export their handlers and route config.
 *
 * The report itself is plain SQL (migration 20271009115500). A model is used
 * ONLY for the chat agenda of each top-10 person, through the ₹0 Max lane.
 */

import type { createServiceRoleClient } from '@/lib/supabase/server';
import { extractJobResultText } from '@/lib/services/platform/ai-jobs-lane';

type Admin = ReturnType<typeof createServiceRoleClient>;

export const AGENDA_JOB_TYPE = 'adoption.chat_agenda';
/** At most this many agenda jobs per run — one per top-10 person. */
export const MAX_AGENDAS = 10;
/** A person's own problem reports from this many days back go into their prompt. */
export const BUG_LOOKBACK_DAYS = 30;
/** At most this many of their reports, newest first (status + part of MyJKKN only). */
export const MAX_BUGS_PER_PERSON = 5;

export interface PowerUser {
  user_id: string;
  full_name: string | null;
  role: string | null;
  institution_id: string | null;
  institution_name: string | null;
  features_used: number;
  records_saved: number;
  active_days: number;
  total_events?: number;
  is_new?: boolean;
  modules?: Array<{ module: string; count: number }>;
  last_day?: string;
}

export interface CollegeCount {
  institution_id: string | null;
  institution_name: string | null;
  count: number;
}

/** What fn_adoption_power_users returns. Names inside: super admins only. */
export interface PowerUsersPayload {
  week_start: string;
  window: { start: string; end: string };
  excluded_institution_ids: string[];
  top: PowerUser[];
  one_day_staff: PowerUser[];
  one_day_learners_by_college: CollegeCount[];
}

/**
 * A person's own problem report, as the model sees it: status and which part of
 * MyJKKN only. The free text is never sent — it can name other people.
 */
export interface OwnBugReport {
  status: string | null;
  module_name: string | null;
  sub_module_name: string | null;
  created_at: string;
}

/** An earlier adoption.chat_agenda job for this week, found by its dedupe key. */
export interface ExistingAgendaJob {
  id: string;
  status: string;
  result: unknown;
  dedupe: string | null;
}

const LIVE_JOB_STATES = new Set(['pending', 'claimed', 'running']);

/** Still queued/running, or finished with an agenda the page can read. */
export function isUsableAgendaJob(job: Pick<ExistingAgendaJob, 'status' | 'result'>): boolean {
  if (LIVE_JOB_STATES.has(job.status)) return true;
  return job.status === 'done' && parseAgenda(extractJobResultText(job.result as never)) !== null;
}

export interface ChatAgenda {
  questions: string[];
  topics: string[];
}

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 24 * 3600_000;

/** The Monday (YYYY-MM-DD) that began the PREVIOUS week, counted in IST. */
export function previousIstWeekStart(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const isoDow = ist.getUTCDay() === 0 ? 7 : ist.getUTCDay();
  const thisMonday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - (isoDow - 1) * DAY_MS;
  return new Date(thisMonday - 7 * DAY_MS).toISOString().slice(0, 10);
}

/** A real calendar date written YYYY-MM-DD that falls on a Monday. */
export function isMondayDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1
  );
}

/** Which part of MyJKKN a report was about — never its free text. */
function partOf(b: OwnBugReport): string {
  const part = [b.module_name, b.sub_module_name].filter((x) => x && x.trim()).join(' / ');
  return part || 'part not recorded';
}

/**
 * The prompt for ONE person. It carries only that person's own facts — role,
 * college, the parts of MyJKKN they used with counts, records saved, active
 * days and their own recent problem reports. Never their name, their id or
 * anyone else's data. `bugs` null = the reports could not be read.
 */
export function buildAgendaPrompt(
  weekStart: string,
  person: PowerUser,
  bugs: OwnBugReport[] | null
): string {
  const modules = (person.modules ?? [])
    .map((m) => `  - ${m.module}: ${m.count}`)
    .join('\n');
  const reports =
    bugs === null
      ? '  (could not be read this week)'
      : bugs.length === 0
        ? '  (none)'
        : bugs
            .slice(0, MAX_BUGS_PER_PERSON)
            .map((b) => `  - [${b.status ?? 'unknown'}] ${partOf(b)}`)
            .join('\n');

  return `You are helping the MyJKKN adoption team prepare a short chat with ONE person who used MyJKKN a lot in the week starting ${weekStart}. Use ONLY the facts below about this one person. Do not guess or add facts.

ABOUT THIS PERSON
- Role: ${person.role ?? 'not recorded'}
- College: ${person.institution_name ?? 'not recorded'}
- Parts of MyJKKN they opened, with how many times:
${modules || '  (none recorded)'}
- Different features used: ${person.features_used}
- Records saved (created, updated or exported): ${person.records_saved}
- Days active: ${person.active_days} of 7
- Their own problem reports in the last ${BUG_LOOKBACK_DAYS} days (status, then which part of MyJKKN):
${reports}

WRITE
- questions: exactly 3 short questions to ask this person in the chat, about how they use MyJKKN and what gets in their way.
- topics: 2 to 4 short topics to cover in the chat.

RULES
- Plain English that a 10th-grade reader understands. Short sentences.
- No marketing words (for example: powerful, seamless, unlock, leverage, revolutionary).
- Do not mention or compare with any other person.
- Do not invent numbers.

Return ONLY valid JSON (no markdown, no code fences, no commentary), exactly:
{"questions": ["...", "...", "..."], "topics": ["...", "..."]}`;
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Parse the model's agenda. null when it is missing or not the asked shape. */
export function parseAgenda(text: string | null): ChatAgenda | null {
  if (!text) return null;
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const questions = cleanList(obj.questions, 3);
  const topics = cleanList(obj.topics, 4);
  if (questions.length === 0 || topics.length === 0) return null;
  return { questions, topics };
}

export interface PowerUsersRunCounts {
  top: number;
  oneDayStaff: number;
  enqueued: number;
  inFlight: number;
  failed: number;
  kept: number;
  dryRun: boolean;
}

/** One line for the log, like the daily tick's. */
export function summarisePowerUsersRun(c: PowerUsersRunCounts): string {
  if (c.dryRun) {
    return `dry run · top ${c.top}, one_day_staff ${c.oneDayStaff}, would enqueue ${c.top}`;
  }
  return `top ${c.top}, one_day_staff ${c.oneDayStaff}, enqueued ${c.enqueued}, in_flight ${c.inFlight}, failed ${c.failed}, kept ${c.kept}`;
}

export interface PowerUsersWeekView {
  week: { week_start: string; computed_at: string; payload: PowerUsersPayload } | null;
  /** user_id -> the parsed agenda, or null when it is not ready / not readable. */
  agendas: Record<string, ChatAgenda | null>;
  error: string | null;
}

/**
 * The latest stored week and each top-10 person's agenda. Service-role ONLY,
 * and only after the page's super-admin check: ai_jobs rows belong to the Max
 * seat's owner, so a signed-in super admin's own client would read none.
 */
export async function loadPowerUsersLastWeek(admin: Admin): Promise<PowerUsersWeekView> {
  try {
    return await readLatestWeek(admin);
  } catch (e) {
    // The rest of the adoption page must still render.
    return { week: null, agendas: {}, error: e instanceof Error ? e.message : 'read failed' };
  }
}

async function readLatestWeek(admin: Admin): Promise<PowerUsersWeekView> {
  const { data, error } = await admin
    .from('adoption_power_user_weeks')
    .select('week_start, computed_at, payload, agenda_jobs')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { week: null, agendas: {}, error: error.message };
  if (!data) return { week: null, agendas: {}, error: null };

  const row = data as {
    week_start: string;
    computed_at: string;
    payload: PowerUsersPayload;
    agenda_jobs: Record<string, unknown> | null;
  };
  const jobByUser = Object.entries(row.agenda_jobs ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  const agendas: Record<string, ChatAgenda | null> = {};
  let jobsError: string | null = null;

  if (jobByUser.length > 0) {
    const { data: jobs, error: jobErr } = await admin
      .from('ai_jobs')
      .select('id, status, result')
      .in(
        'id',
        jobByUser.map(([, jobId]) => jobId)
      );
    if (jobErr) jobsError = jobErr.message;
    const byId = new Map(
      ((jobs ?? []) as Array<{ id: string; status: string; result: unknown }>).map((j) => [j.id, j])
    );
    for (const [userId, jobId] of jobByUser) {
      const job = byId.get(jobId);
      agendas[userId] =
        job && job.status === 'done' ? parseAgenda(extractJobResultText(job.result)) : null;
    }
  }

  return {
    week: { week_start: row.week_start, computed_at: row.computed_at, payload: row.payload },
    agendas,
    error: jobsError,
  };
}
