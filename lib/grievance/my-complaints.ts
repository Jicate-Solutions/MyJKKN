// lib/grievance/my-complaints.ts
// ============================================================================
// SERVER-ONLY read for /instasolver/my-complaints: the signed-in person's own
// NON-anonymous complaints, newest first.
//
// WHY A SERVICE-ROLE READ. grievance_tickets RLS is written for handlers; a
// learner may not be able to read back a ticket they filed. So the page reads
// elevated — and the ownership rule lives HERE instead of in RLS:
//   · raised_by_id must equal the caller's auth user id, taken from the session
//     by the page, never from the URL or the browser;
//   · is_anonymous must be false. An anonymous filing KEEPS raised_by_id (see
//     LCIssueService.createLCIssue) — listing it here would put the filer's
//     name back next to a complaint they chose to file without one, on a
//     screen anyone looking over their shoulder can see. Those are followed on
//     /instasolver/track with the private code.
// The filter is applied in the query AND re-checked on every row, so a mocked
// or mis-built query can never widen it.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MyComplaint {
  id: string;
  ticket_number: string | null;
  subject: string | null;
  category: string | null;
  status: string | null;
  handler_name: string | null;
  assigned_to: string | null;
  sla_deadline: string | null;
  last_update: string | null;
  resolution: string | null;
}

interface Row {
  id: string;
  ticket_number: string | null;
  subject: string | null;
  status: string | null;
  sla_deadline: string | null;
  created_at: string | null;
  updated_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  assigned_to: string | null;
  raised_by_id: string | null;
  is_anonymous: boolean | null;
  category: { name: string | null } | { name: string | null }[] | null;
  assignee: { full_name: string | null } | { full_name: string | null }[] | null;
}

const SELECT =
  'id, ticket_number, subject, status, sla_deadline, created_at, updated_at, ' +
  'assigned_at, resolved_at, resolution, assigned_to, raised_by_id, is_anonymous, ' +
  'category:grievance_categories!category_id(name), assignee:profiles!assigned_to(full_name)';

function one<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** The latest of the timestamps a filer would call "an update". */
function latest(...values: Array<string | null>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const ms = new Date(v).getTime();
    if (!Number.isNaN(ms) && ms > bestMs) {
      best = v;
      bestMs = ms;
    }
  }
  return best;
}

/** ok=false carries a reason and an empty list — never a partial one. */
export interface MyComplaintsResult {
  ok: boolean;
  complaints: MyComplaint[];
  reason?: string;
}

export async function readMyComplaints(
  admin: SupabaseClient,
  userId: string
): Promise<MyComplaintsResult> {
  if (!userId) return { ok: false, complaints: [], reason: 'No signed-in user.' };

  const { data, error } = await admin
    .from('grievance_tickets')
    .select(SELECT)
    .eq('raised_by_id', userId)
    .eq('is_anonymous', false)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return { ok: false, complaints: [], reason: error.message };

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.raised_by_id === userId && r.is_anonymous === false
  );

  return {
    ok: true,
    complaints: rows.map((r) => ({
      id: r.id,
      ticket_number: r.ticket_number,
      subject: r.subject,
      category: one(r.category)?.name ?? null,
      status: r.status,
      handler_name: one(r.assignee)?.full_name ?? null,
      assigned_to: r.assigned_to,
      sla_deadline: r.sla_deadline,
      last_update: latest(r.updated_at, r.resolved_at, r.assigned_at, r.created_at),
      resolution: r.resolution,
    })),
  };
}
