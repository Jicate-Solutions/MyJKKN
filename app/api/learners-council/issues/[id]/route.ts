export const dynamic = 'force-dynamic';

// app/api/learners-council/issues/[id]/route.ts
// PATCH /api/learners-council/issues/:id — the two write actions on the
// Learners Council issues board: move an issue's status, and assign it to a
// council member.
//
// WHY THIS ROUTE EXISTS
// ---------------------
// The board wrote to `grievance_tickets` straight from the browser, and RLS
// refused every write an office bearer made. `grievance_tickets_update` has
// five branches and the Learners Council is in none of them:
//
//     is_super_admin() / is_admin()
//     assigned_to  = auth.uid()
//     raised_by_id = auth.uid() AND status = 'open'
//     user_has_permission('grievance.tickets.edit')
//         AND role_has_institution_access(institution_id)
//
// An elected office bearer is typically a learner on the `student` role, which
// carries `grievance.tickets.edit = false`. The only branch that ever admitted
// them was the raiser branch, and it stops applying the moment a ticket leaves
// New. So "Move to In Progress" worked once and everything after it — Mark
// Resolved, Assign — matched 0 rows and surfaced as PGRST116.
//
// The other way to fix this is a sixth branch on the policy itself. That was
// written and deliberately not taken. Widening the policy widens READS as well,
// and /accreditation/naac/grievance lists this table with no permission check
// of its own — it lets RLS decide what comes back. So a policy branch for the
// council would also have surfaced grievances on an accreditation screen the
// council has no business appearing in. Gating that page instead was checked
// and rejected too: only `managing_director` and `ceo` hold
// `grievance.tickets.view`, so every admin, principal and registrar who reads
// it today gets there through the `is_admin()` branch, and gating it would
// have taken a working page away from them.
//
// Fixing it here contains the change to the Learners Council. If a policy
// branch is ever added, this route does not become wrong — step 1 simply
// starts succeeding and the service-role path below stops being reached.
//
// WHY IT IS SAFE TO USE A SERVICE-ROLE CLIENT HERE
// ------------------------------------------------
// A service-role client ignores RLS completely, so a route that reaches for
// one is only as good as the checks it performs itself. Three things keep this
// one narrow:
//
//   1. RLS IS TRIED FIRST, AND IS STILL THE AUTHORITY FOR EVERYONE IT ALREADY
//      ADMITS. The update runs on the caller's own session first. Admins,
//      assignees, raisers-of-open-tickets and `grievance.tickets.edit` holders
//      all pass there and never touch the elevated path. That means this route
//      cannot regress any existing caller, because for them nothing changed.
//   2. THE ELEVATED PATH IS ENTERED ONLY ON 0 ROWS, and only after the caller
//      is confirmed to hold an ACTIVE council executive seat — established by
//      fn_is_lc_executive(), a SECURITY DEFINER function granted to
//      `authenticated` that resolves auth.uid() to this caller and cannot be
//      asked about anybody else.
//   3. THE COLUMN LIST IS A WHITELIST. Only status, assigned_to, assigned_at
//      and resolved_at can be written, and their values are validated against
//      fixed sets. The complainant's own words are not reachable through this
//      route at any privilege level — which is strictly tighter than the
//      migration, since RLS cannot restrict columns at all.

import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';

// Mirrors the live grievance_tickets_status_check constraint.
const VALID_STATUSES = [
  'open',
  'in_progress',
  'pending_info',
  'resolved',
  'closed',
  'reopened'
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The single shape both the RLS path and the elevated path write. Declared
// once so the two can never drift into writing different things.
const TICKET_SELECT = `
  *,
  category:grievance_categories!category_id(id, name),
  assignee:profiles!assigned_to(id, full_name, email, avatar_url)
`;

interface PatchBody {
  status?: string;
  assigneeId?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid issue id' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  // ── Build the update from a whitelist, never from the body directly ───────
  const updateData: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json(
        { error: `Unknown status: ${body.status}` },
        { status: 400 }
      );
    }
    updateData.status = body.status;

    // Matches what the client service did before this route existed: a resolve
    // stamps resolved_at, which is the column the NAAC 7.7.1 evidence trigger
    // and the SLA reports both read.
    if (body.status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }
  }

  if (body.assigneeId !== undefined) {
    if (!UUID_RE.test(body.assigneeId)) {
      return NextResponse.json({ error: 'Invalid assignee id' }, { status: 400 });
    }
    updateData.assigned_to = body.assigneeId;
    updateData.assigned_at = new Date().toISOString();
    // Assigning starts the work, unless the caller said otherwise in the same
    // request. Preserved from the previous client-side behaviour.
    if (updateData.status === undefined) {
      updateData.status = 'in_progress';
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: 'Nothing to update. Send a status or an assigneeId.' },
      { status: 400 }
    );
  }

  // ── 1. The caller's own session first. RLS decides, exactly as before ─────
  const { data: rlsRow, error: rlsError } = await supabase
    .from('grievance_tickets')
    .update(updateData)
    .eq('id', id)
    .select(TICKET_SELECT)
    .maybeSingle();

  if (rlsError) {
    console.error('[lc/issues] Update failed:', rlsError);
    return NextResponse.json(
      { error: `Failed to update issue: ${rlsError.message}` },
      { status: 500 }
    );
  }

  if (rlsRow) {
    return NextResponse.json({ ticket: rlsRow }, { status: 200 });
  }

  // ── 2. Zero rows. Either the row is gone, or RLS refused it ──────────────
  //
  // A council executive is the one caller RLS refuses that it should not. Ask
  // the database who this caller is. fn_is_lc_executive() is SECURITY DEFINER
  // and reads auth.uid(), so it can only ever describe the session holder.
  const { data: isExecutive, error: rpcError } = await supabase.rpc(
    'fn_is_lc_executive'
  );

  if (rpcError) {
    console.error('[lc/issues] Council seat lookup failed:', rpcError);
    return NextResponse.json(
      { error: 'Could not confirm your Learners Council seat. Try again.' },
      { status: 500 }
    );
  }

  if (isExecutive !== true) {
    return NextResponse.json(
      {
        error:
          'You do not have permission to change this issue. Only an active ' +
          'Learners Council executive, the assignee, or an administrator can.'
      },
      { status: 403 }
    );
  }

  // ── 3. An executive — but only over non-ICC tickets in their own college ──
  const admin = createServiceRoleClient();

  const { data: ticket, error: ticketError } = await admin
    .from('grievance_tickets')
    .select('id, institution_id, is_icc_only')
    .eq('id', id)
    .maybeSingle();

  if (ticketError) {
    console.error('[lc/issues] Ticket lookup failed:', ticketError);
    return NextResponse.json(
      { error: 'Could not load the issue. Try again.' },
      { status: 500 }
    );
  }

  if (!ticket) {
    return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  }

  // A complaint flagged is_icc_only belongs to the Internal Complaints
  // Committee. A student council seat is not a seat on that committee, and
  // this route must not become a way around that.
  if (ticket.is_icc_only === true) {
    return NextResponse.json(
      {
        error:
          'This is a confidential complaint. Only the Internal Complaints ' +
          'Committee can act on it.'
      },
      { status: 403 }
    );
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('institution_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[lc/issues] Caller profile lookup failed:', profileError);
    return NextResponse.json(
      { error: 'Could not confirm your institution. Try again.' },
      { status: 500 }
    );
  }

  // Deliberately a plain equality against the caller's own institution, and
  // NOT role_has_institution_access(). That function also honours
  // institution_scope = 'all' roles and cross-institution grants, which is
  // right for staff and wrong here: a council seat is held at one college.
  if (
    !profile?.institution_id ||
    profile.institution_id !== ticket.institution_id
  ) {
    return NextResponse.json(
      { error: 'This issue belongs to another institution.' },
      { status: 403 }
    );
  }

  // ── 4. Cleared. Write it ─────────────────────────────────────────────────
  const { data: elevatedRow, error: elevatedError } = await admin
    .from('grievance_tickets')
    .update(updateData)
    .eq('id', id)
    .select(TICKET_SELECT)
    .maybeSingle();

  if (elevatedError) {
    console.error('[lc/issues] Elevated update failed:', elevatedError);
    return NextResponse.json(
      { error: `Failed to update issue: ${elevatedError.message}` },
      { status: 500 }
    );
  }

  if (!elevatedRow) {
    // The row was deleted between the lookup above and this write.
    return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
  }

  return NextResponse.json({ ticket: elevatedRow }, { status: 200 });
}
