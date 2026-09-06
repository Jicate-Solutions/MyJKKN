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
  role_type: string;
  staff_id: string | null;
  /** Name of a holder who has no MyJKKN team member record. */
  holder_note: string | null;
  /** Resolved display name — from the linked record, else the typed name. */
  holder_name: string | null;
  holder_email: string | null;
  start_date: string | null;
}

interface AssignmentRow {
  role_type: string;
  staff_id: string | null;
  notes: string | null;
  start_date: string | null;
}

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

    const { data, error } = await supabase
      .from('hr_additional_roles')
      .select('role_type, staff_id, notes, start_date')
      .eq('improvement_area_id', areaId)
      .eq('is_current', true)
      .order('role_type', { ascending: true });

    if (error) {
      console.error('[GET /api/mba/dept-artifacts/role-assignments] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch role holders' }, { status: 500 });
    }

    const rows = (data ?? []) as AssignmentRow[];
    const ids = rows.map((r) => r.staff_id).filter((v): v is string => Boolean(v));

    // Resolve names for the linked records only (never a bulk directory read).
    const byId = new Map<string, { name: string | null; email: string | null }>();
    if (ids.length > 0) {
      const admin = createServiceRoleClient();
      const { data: members } = await admin
        .from('staff')
        .select('id, first_name, last_name, email')
        .in('id', ids);
      for (const m of (members ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>) {
        const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
        byId.set(m.id, { name: name || null, email: m.email });
      }
    }

    const assignments: RoleAssignment[] = rows.map((r) => {
      const linked = r.staff_id ? byId.get(r.staff_id) : undefined;
      return {
        role_type: r.role_type,
        staff_id: r.staff_id,
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
