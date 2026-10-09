// app/api/mba/dept-artifacts/role-assignments/route.ts
// GET ?area_id=<uuid> — who currently holds each organogram role in a department.
//
// These are real rows in public.hr_additional_roles (improvement_area_id scope),
// written when a manager approves the organogram. They are the reason a holder
// SURVIVES a re-draft: the artifact's content JSON is replaced by a fresh AI
// draft, these rows are not.
//
// Read through the caller's own client so the table's RLS decides. That policy
// admits board managers, the officers who may assign holders, admins and super
// admins, so the route states the requirement up front rather than silently
// returning an empty list — an empty list here is indistinguishable from "nobody
// holds anything", and the review dialog treats those very differently.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export interface RoleAssignment {
  /** hr_additional_roles.id — a department can carry several department_owner rows. */
  id: string;
  role_type: string;
  staff_id: string | null;
  /** User account of a department owner who has no team member record. */
  profile_id: string | null;
  /** Name of a holder who has no MyJKKN team member record. */
  holder_note: string | null;
  /** Resolved display name — from the linked record, else the typed name. */
  holder_name: string | null;
  holder_email: string | null;
  start_date: string | null;
}

interface AssignmentRow {
  id: string;
  role_type: string;
  staff_id: string | null;
  profile_id?: string | null;
  notes: string | null;
  start_date: string | null;
}

const BASE_COLUMNS = 'id, role_type, staff_id, notes, start_date, created_at';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A board manager reads holders as part of reviewing a playbook. An officer reads
    // them because they are the only people who may CHANGE them
    // (improvement.area_role.assign) — asking them to also hold a board manager's
    // permission just to see what they are about to edit is the lockout this route
    // would otherwise recreate. The table's RLS already admits both keys; only this
    // check was narrower.
    const [{ data: canManage }, { data: canAssign }] = await Promise.all([
      supabase.rpc('user_has_permission', {
        permission_name: 'improvement.board.manage',
      }),
      supabase.rpc('user_has_permission', {
        permission_name: 'improvement.area_role.assign',
      }),
    ]);
    if (canManage !== true && canAssign !== true) {
      return NextResponse.json(
        {
          error:
            'Only an improvement board manager, or an officer who can assign role holders, can view role holders.',
        },
        { status: 403 },
      );
    }

    const areaId = request.nextUrl.searchParams.get('area_id');
    if (!areaId) {
      return NextResponse.json({ error: 'area_id is required' }, { status: 400 });
    }

    const read = (columns: string) =>
      supabase
        .from('hr_additional_roles')
        .select(columns)
        .eq('improvement_area_id', areaId)
        .eq('is_current', true)
        .order('role_type', { ascending: true })
        .order('start_date', { ascending: true })
        .order('created_at', { ascending: true });

    // profile_id arrives with 20271006100000. Until that migration is applied
    // the column does not exist (42703); fall back rather than take the whole
    // holders list down with it.
    let { data, error } = await read(`${BASE_COLUMNS}, profile_id`);
    if (error && (error as { code?: string }).code === '42703') {
      ({ data, error } = await read(BASE_COLUMNS));
    }

    if (error) {
      console.error('[GET /api/mba/dept-artifacts/role-assignments] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch role holders' }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as AssignmentRow[];
    const ids = rows.map((r) => r.staff_id).filter((v): v is string => Boolean(v));
    const accountIds = rows
      .filter((r) => !r.staff_id)
      .map((r) => r.profile_id)
      .filter((v): v is string => Boolean(v));

    // Resolve names for the linked records only (never a bulk directory read).
    const byId = new Map<string, { name: string | null; email: string | null }>();
    if (ids.length > 0) {
      const admin = createServiceRoleClient();
      const { data: members } = await admin
        .from('staff')
        .select('id, first_name, last_name, email, profile_id')
        .in('id', ids);
      const memberRows = (members ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        profile_id: string | null;
      }>;

      // Show the LOGIN email, not the team member record's. staff.email is the
      // contact address HR captured and is often personal: on 2026-10-08, 323
      // of 722 active records held a non-@jkkn.ac.in address, 215 of them for
      // people whose login IS @jkkn.ac.in. The record's own email is the
      // fallback only when the person has no login account.
      const loginEmail = new Map<string, string | null>();
      const loginIds = memberRows
        .map((m) => m.profile_id)
        .filter((v): v is string => Boolean(v));
      if (loginIds.length > 0) {
        const { data: logins } = await admin
          .from('profiles')
          .select('id, email')
          .in('id', loginIds);
        for (const l of (logins ?? []) as Array<{ id: string; email: string | null }>) {
          loginEmail.set(l.id, l.email);
        }
      }

      for (const m of memberRows) {
        const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
        byId.set(m.id, {
          name: name || null,
          email: (m.profile_id ? loginEmail.get(m.profile_id) : null) || m.email,
        });
      }
    }

    // Owners linked by user account (no team member record) — same rule.
    const byAccount = new Map<string, { name: string | null; email: string | null }>();
    if (accountIds.length > 0) {
      const admin = createServiceRoleClient();
      const { data: accounts } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', accountIds);
      for (const a of (accounts ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>) {
        byAccount.set(a.id, { name: a.full_name?.trim() || null, email: a.email });
      }
    }

    const assignments: RoleAssignment[] = rows.map((r) => {
      const linked = r.staff_id
        ? byId.get(r.staff_id)
        : r.profile_id
          ? byAccount.get(r.profile_id)
          : undefined;
      return {
        id: r.id,
        role_type: r.role_type,
        staff_id: r.staff_id,
        profile_id: r.staff_id ? null : (r.profile_id ?? null),
        holder_note: r.staff_id ? null : r.notes,
        holder_name: linked?.name ?? (r.staff_id ? null : r.notes),
        holder_email: linked?.email ?? null,
        start_date: r.start_date,
      };
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts/role-assignments] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
