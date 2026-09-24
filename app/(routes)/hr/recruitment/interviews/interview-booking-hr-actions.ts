/**
 * Server actions for the two interview-booking cards on the HR interviews page.
 *
 *   loadCallbackRequests        — people the link could not book, waiting for a call (#14)
 *   markCallbackRequestCalled   — the office rang them: open → done
 *   reopenCallbackRequest       — done → open, the second way back
 *   loadClosedPostInterviews    — upcoming interviews for posts already filled or closed (#13)
 *
 * Everything runs on the viewer's SESSION client. RLS is the gate: the call-back
 * table's policies mirror hr_recruitment_jobs (supabase/migrations/
 * 20270312090000_interview_booking_link.sql). The permission reads below only
 * NAME a refusal RLS has already made; they never widen or narrow it.
 */
'use server';

import { createClient } from '@/lib/supabase/server';

export interface CallbackRequestRow {
  id: string;
  job_id: string | null;
  post_title: string;
  name: string;
  phone: string;
  email: string | null;
  status: 'open' | 'done';
  outcome_note: string | null;
  handled_at: string | null;
  handled_by: string | null;
  handler_name: string | null;
  closed_by_booking_id: string | null;
  created_at: string;
}

export type LoadCallbackRequestsResult =
  | { success: true; open: CallbackRequestRow[]; done: CallbackRequestRow[] }
  | { success: false; error: string };

export type CallbackUpdateResult = { success: true } | { success: false; error: string };

export interface ClosedPostInterviewRow {
  id: string;
  candidate_name: string;
  job_id: string;
  post_title: string;
  post_status: 'filled' | 'closed';
  scheduled_at: string;
  round_number: number;
  round_name: string | null;
}

export type LoadClosedPostInterviewsResult =
  | { success: true; rows: ClosedPostInterviewRow[] }
  | { success: false; error: string };

const CALLBACK_COLUMNS =
  'id, job_id, post_title, name, phone, email, status, outcome_note, handled_at, handled_by, closed_by_booking_id, created_at, handler:profiles(full_name)';

/** How many handled requests sit under "Recently handled". */
const RECENT_DONE_LIMIT = 20;

// Not exported: a 'use server' file may export only async functions.
const NO_EDIT_ACCESS_MESSAGE =
  "You don't have access to update call-back requests — contact the HR admin.";
const ALREADY_UPDATED_MESSAGE = 'This request was already updated — refresh.';

type RawCallbackRow = Omit<CallbackRequestRow, 'handler_name'> & {
  handler?: { full_name: string | null } | Array<{ full_name: string | null }> | null;
};

function toCallbackRow(raw: RawCallbackRow): CallbackRequestRow {
  const { handler, ...rest } = raw;
  const h = Array.isArray(handler) ? handler[0] : handler;
  return { ...rest, handler_name: h?.full_name ?? null };
}

export async function loadCallbackRequests(): Promise<LoadCallbackRequestsResult> {
  const supabase = await createClient();

  // Open first, OLDEST first: whoever has waited longest is rung first (#14).
  const [open, done] = await Promise.all([
    supabase
      .from('hr_interview_callback_requests')
      .select(CALLBACK_COLUMNS)
      .eq('status', 'open')
      .order('created_at', { ascending: true }),
    supabase
      .from('hr_interview_callback_requests')
      .select(CALLBACK_COLUMNS)
      .eq('status', 'done')
      .order('handled_at', { ascending: false, nullsFirst: false })
      .limit(RECENT_DONE_LIMIT),
  ]);

  const error = open.error ?? done.error;
  if (error) {
    // The card hides for a viewer who cannot read the table; log so a real
    // failure is not mistaken for "no access".
    console.error('[interview-booking-hr] loading call-back requests failed', error);
    return { success: false, error: error.message };
  }
  return {
    success: true,
    open: ((open.data ?? []) as unknown as RawCallbackRow[]).map(toCallbackRow),
    done: ((done.data ?? []) as unknown as RawCallbackRow[]).map(toCallbackRow),
  };
}

/**
 * RLS returned no row. Say WHY: a viewer without the edit permission gets the
 * access message; one who has it lost a race — someone else changed the row
 * first (the updates below are guarded on the status they expect).
 */
async function explainNoRowUpdated(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CallbackUpdateResult> {
  // The policy's own bypasses, then the permission — the same three it tests.
  const [{ data: isSuperAdmin }, { data: isAdmin }, { data: canEdit }] = await Promise.all([
    supabase.rpc('is_super_admin'),
    supabase.rpc('is_admin'),
    supabase.rpc('user_has_permission', { permission_name: 'hr.recruitment.edit' }),
  ]);
  if (!isSuperAdmin && !isAdmin && !canEdit) return { success: false, error: NO_EDIT_ACCESS_MESSAGE };
  return { success: false, error: ALREADY_UPDATED_MESSAGE };
}

export async function markCallbackRequestCalled(
  id: string,
  note?: string | null,
): Promise<CallbackUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: NO_EDIT_ACCESS_MESSAGE };

  // Only the fields this action means to change. The note is written only when
  // one was typed, so an empty box never wipes an earlier note.
  const patch: Record<string, string> = {
    status: 'done',
    handled_by: user.id,
    handled_at: new Date().toISOString(),
  };
  const trimmed = (note ?? '').trim();
  if (trimmed) patch.outcome_note = trimmed;

  const { data, error } = await supabase
    .from('hr_interview_callback_requests')
    .update(patch)
    .eq('id', id)
    .eq('status', 'open')
    .select('id');
  if (error) return { success: false, error: `Could not update the request: ${error.message}` };
  if (!data || data.length === 0) return explainNoRowUpdated(supabase);
  return { success: true };
}

export async function reopenCallbackRequest(id: string): Promise<CallbackUpdateResult> {
  const supabase = await createClient();

  // Back to open: who handled it and when no longer apply. closed_by_booking_id
  // is cleared too — once the office reopens it, "booked themselves" is no
  // longer why it is closed, and would mislabel the row when it is next handled.
  // outcome_note is kept as history.
  const { data, error } = await supabase
    .from('hr_interview_callback_requests')
    .update({ status: 'open', handled_at: null, handled_by: null, closed_by_booking_id: null })
    .eq('id', id)
    .eq('status', 'done')
    .select('id');
  if (error) return { success: false, error: `Could not reopen the request: ${error.message}` };
  if (!data || data.length === 0) return explainNoRowUpdated(supabase);
  return { success: true };
}

interface RawInterview {
  id: string;
  job_id: string | null;
  scheduled_at: string;
  round_number: number;
  round_name: string | null;
  candidate?: { name: string | null } | Array<{ name: string | null }> | null;
}

/**
 * Upcoming scheduled interviews whose post is filled or closed (#13). Nothing
 * auto-cancels; this is the list HR decides from.
 *
 * Starts from the interviews (a short, future-only list) and then asks for
 * their posts, rather than embedding the post: hr_recruitment_interviews.job_id
 * was created without a foreign key (20260516030937), so an embed may not exist.
 */
export async function loadClosedPostInterviews(): Promise<LoadClosedPostInterviewsResult> {
  const supabase = await createClient();

  const { data: interviews, error } = await supabase
    .from('hr_recruitment_interviews')
    .select('id, job_id, scheduled_at, round_number, round_name, candidate:hr_recruitment_candidates(name)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .not('job_id', 'is', null)
    .order('scheduled_at', { ascending: true });
  if (error) {
    console.error('[interview-booking-hr] loading upcoming interviews failed', error);
    return { success: false, error: error.message };
  }

  const rows = (interviews ?? []) as unknown as RawInterview[];
  const jobIds = [...new Set(rows.map((r) => r.job_id).filter((j): j is string => !!j))];
  if (jobIds.length === 0) return { success: true, rows: [] };

  const { data: jobs, error: jobsError } = await supabase
    .from('hr_recruitment_jobs')
    .select('id, title, status')
    .in('id', jobIds)
    .in('status', ['filled', 'closed']);
  if (jobsError) {
    console.error('[interview-booking-hr] loading posts failed', jobsError);
    return { success: false, error: jobsError.message };
  }

  const jobMap = new Map(
    ((jobs ?? []) as Array<{ id: string; title: string; status: 'filled' | 'closed' }>).map((j) => [j.id, j]),
  );
  const out: ClosedPostInterviewRow[] = [];
  for (const r of rows) {
    const job = r.job_id ? jobMap.get(r.job_id) : undefined;
    if (!job) continue;
    const c = Array.isArray(r.candidate) ? r.candidate[0] : r.candidate;
    out.push({
      id: r.id,
      candidate_name: c?.name ?? 'Unknown candidate',
      job_id: job.id,
      post_title: job.title,
      post_status: job.status,
      scheduled_at: r.scheduled_at,
      round_number: r.round_number,
      round_name: r.round_name,
    });
  }
  return { success: true, rows: out };
}
