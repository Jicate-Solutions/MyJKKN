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
 *
 * See resolveRoleHolders() below for the second half of that job: a role step
 * freezes no name at all, so the role has to be resolved to actual people.
 */

/** How many holders of one role we send; the rest become a "+N more" tail. */
const ROLE_HOLDER_LIMIT = 3;

/**
 * The people who actually hold each role the chain routes to.
 *
 * Without this a step reads "Principal" and names nobody, so an applicant
 * chasing their own request has no one to chase — the complaint this answers.
 *
 * SCOPED THE WAY THE GATE SCOPES, not by institution alone. fn_leave_step_admits
 * admits a role holder when the request's organisation is in their reach, and a
 * role with institution_scope='all' reaches everywhere. The only CAO in the
 * group is staffed at College of Education; filtering strictly on institution
 * would drop them from every other institution's chain while the database
 * happily lets them approve it.
 *
 * Best-effort like the rest of this resolver: a failure returns {} and the UI
 * falls back to the bare role name.
 */
async function resolveRoleHolders(
  admin: ReturnType<typeof createServiceRoleClient>,
  roleKeys: string[],
  institutionId: string | null
): Promise<Record<string, { names: string[]; total: number }>> {
  const out: Record<string, { names: string[]; total: number }> = {};
  if (roleKeys.length === 0) return out;
  // Every requested key gets a bucket up front, so a role NOBODY holds here
  // comes back as total 0 rather than as a missing key. That distinction is the
  // point: a step routed to an unheld role is a dead end — it renders, the
  // request waits, and no approver's queue ever shows it.
  for (const k of roleKeys) out[k] = { names: [], total: 0 };

  // !inner is intended here: rows whose role is not one we asked about are not
  // wanted. (Elsewhere in this codebase an accidental !inner silently drops
  // rows — this one is the deliberate kind.)
  const { data: grants, error: gErr } = await admin
    .from('user_roles')
    .select('user_id, custom_roles!inner(role_key, institution_scope)')
    .in('custom_roles.role_key', roleKeys);
  if (gErr) throw gErr;

  type Grant = {
    user_id: string;
    custom_roles: { role_key: string; institution_scope: string | null } | null;
  };
  const rows = (grants ?? []) as unknown as Grant[];
  if (rows.length === 0) return out; // seeded buckets stand: every key reads total 0

  // staff, not profiles: fn_my_designated_hr_org_ids() reads staff.institution_id,
  // so that is the column the gate actually compares.
  const { data: staffRows, error: sErr } = await admin
    .from('staff')
    .select('profile_id, institution_id, first_name, last_name')
    .in('profile_id', [...new Set(rows.map((r) => r.user_id))])
    .eq('is_active', true);
  if (sErr) throw sErr;

  const byProfile = new Map(
    ((staffRows ?? []) as Array<{
      profile_id: string; institution_id: string | null;
      first_name: string | null; last_name: string | null;
    }>).map((s) => [s.profile_id, s])
  );

  // One person counts once per role. There are no duplicate user_roles rows
  // today, but nothing stops a second grant of the same role being written, and
  // the visible symptom would be a name printed twice and an inflated "+N more".
  const counted = new Set<string>();

  for (const g of rows) {
    const key = g.custom_roles?.role_key;
    if (!key) continue;
    if (counted.has(`${key}|${g.user_id}`)) continue;
    counted.add(`${key}|${g.user_id}`);
    const s = byProfile.get(g.user_id);
    if (!s) continue; // holds the role but is not active staff anywhere
    const reaches =
      g.custom_roles?.institution_scope === 'all' ||
      (!!institutionId && s.institution_id === institutionId);
    if (!reaches) continue;
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
    if (!name) continue;
    const bucket = out[key];
    if (!bucket) continue;
    bucket.total += 1;
    if (bucket.names.length < ROLE_HOLDER_LIMIT) bucket.names.push(name);
  }
  return out;
}

async function resolveChainNames(
  chain: LeaveApprovalStep[] | null | undefined,
  finalApproverId: string | null,
  appliedBy: string | null,
  hrOrganizationId: string | null
): Promise<LeaveChainNames> {
  const uids = new Set<string>();
  const keys = new Set<string>();
  for (const s of chain ?? []) {
    if (s.decided_by) uids.add(s.decided_by);
    // Whoever took an approval back. Usually the same person as the step's
    // 'revoked' decision below, but resolved explicitly so a chain written by
    // any other path still names them instead of printing a raw uuid.
    if (s.revoked_by) uids.add(s.revoked_by);
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
  let roleHolders: Record<string, { names: string[]; total: number }> = {};
  if (uids.size === 0 && keys.size === 0) return { people, roles };

  try {
    const admin = createServiceRoleClient();
    // The institution the request belongs to. hr_organizations.id is NOT an
    // institutions.id — the mapping lives in hr_organizations.institution_id,
    // and comparing the two directly matches nothing.
    let institutionId: string | null = null;
    if (hrOrganizationId) {
      const { data: org } = await admin
        .from('hr_organizations')
        .select('institution_id')
        .eq('id', hrOrganizationId)
        .maybeSingle();
      institutionId = (org as { institution_id: string | null } | null)?.institution_id ?? null;
    }
    roleHolders = await resolveRoleHolders(admin, [...keys], institutionId);

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
  return { people, roles, roleHolders };
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
      resolveChainNames(
        app.approval_chain, app.final_approver_id, app.applied_by, app.hr_organization_id
      ),
      resolveApplicant(app.employee_id),
    ]);
    return NextResponse.json({ data: { ...app, chain_names, applicant } });
  } catch (err) {
    console.error('[hr/leave/applications/:id] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
