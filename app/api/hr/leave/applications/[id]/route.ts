export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { LeaveService } from '@/lib/services/hr/leave-service';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { LeaveApprovalStep, LeaveChainNames } from '@/types/hr';

/**
 * Names for the uids and role keys frozen into the chain.
 *
 * Runs on the service-role client, and ONLY after the RLS-gated read in GET has
 * returned the application — that read is the authorisation; this is a lookup
 * of ids the caller is already allowed to see. profiles and custom_roles are
 * unreadable to staff, so without it the detail sheet showed a step as
 * "hod (approved)" and could only ever name the FINAL approver, which the queue
 * RPC happens to resolve. Every step's decider now has a name.
 *
 * Best-effort on purpose: a lookup failure degrades to raw ids in the UI, never
 * to a 500 — the chain itself is still returned.
 */
async function resolveChainNames(
  chain: LeaveApprovalStep[] | null | undefined,
  finalApproverId: string | null,
  appliedBy: string | null
): Promise<LeaveChainNames> {
  const uids = new Set<string>();
  const keys = new Set<string>();
  for (const s of chain ?? []) {
    if (s.decided_by) uids.add(s.decided_by);
    if (s.approver_user_id) uids.add(s.approver_user_id);
    // 'pinned_user' is the flow editor's sentinel for "a named person", not a role.
    if (s.approver_role && s.approver_role !== 'pinned_user') keys.add(s.approver_role);
    for (const a of s.approvers ?? []) {
      if (a.approver_user_id) uids.add(a.approver_user_id);
      if (a.approver_role) keys.add(a.approver_role);
    }
    for (const d of s.decisions ?? []) if (d.by) uids.add(d.by);
  }
  if (finalApproverId) uids.add(finalApproverId);
  // The person who FILED it. Without this the detail surfaces printed a raw
  // uuid under "Applied by" — the same lookup that already names every
  // decider answers it, so it costs nothing extra.
  if (appliedBy) uids.add(appliedBy);

  const people: Record<string, string> = {};
  const roles: Record<string, string> = {};
  if (uids.size === 0 && keys.size === 0) return { people, roles };

  try {
    const admin = createServiceRoleClient();
    const [p, r] = await Promise.all([
      uids.size > 0
        ? admin.from('profiles').select('id, full_name, email').in('id', [...uids])
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }>, error: null }),
      keys.size > 0
        ? admin.from('custom_roles').select('role_key, role_name').in('role_key', [...keys])
        : Promise.resolve({ data: [] as Array<{ role_key: string; role_name: string }>, error: null }),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    for (const row of p.data ?? []) people[row.id] = row.full_name?.trim() || row.email || row.id;
    for (const row of r.data ?? []) roles[row.role_key] = row.role_name;
  } catch (err) {
    console.error('[hr/leave/applications/:id] chain name lookup failed', err);
  }
  return { people, roles };
}

/**
 * The staff member the leave is FOR.
 *
 * employee_id points at `staff`, NOT at `profiles`, so the chain-name lookup
 * above cannot resolve it — the detail surfaces printed a raw uuid under
 * "Employee". Service-role, and only after GET's RLS-gated read has already
 * authorised the caller to see this application. Best-effort: a failure
 * degrades to the id rather than to a 500.
 */
async function resolveApplicant(
  employeeId: string | null
): Promise<{ name: string; staff_code: string | null } | null> {
  if (!employeeId) return null;
  try {
    const admin = createServiceRoleClient();
    const { data, error } = await admin
      .from('staff')
      .select('first_name, last_name, staff_id')
      .eq('id', employeeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as { first_name: string | null; last_name: string | null; staff_id: string | null };
    return {
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || employeeId,
      staff_code: row.staff_id,
    };
  } catch (err) {
    console.error('[hr/leave/applications/:id] applicant lookup failed', err);
    return null;
  }
}

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const app = await LeaveService.getApplication(supabase, id);
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const [chain_names, applicant] = await Promise.all([
      resolveChainNames(app.approval_chain, app.final_approver_id, app.applied_by),
      resolveApplicant(app.employee_id),
    ]);
    return NextResponse.json({ data: { ...app, chain_names, applicant } });
  } catch (err) {
    console.error('[hr/leave/applications/:id] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
