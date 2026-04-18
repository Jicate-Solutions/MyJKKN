// GET /api/admission/referral-dropdowns
// Returns dropdown options for the lead-creation referrer picker.
//
// admission_staff (and any role with admission.leads.create permission) can fetch
// students/staff from ANY institution via this endpoint — bypassing RLS's per-row
// institution filter. Needed because referrers are cross-institution by nature:
// a student at Institution A may refer a lead for Institution B.
//
// Query params:
//   type:           "institutions" | "departments" | "students" | "staff"
//   institution_id: required for type=departments|students|staff
//   department_id:  optional for type=staff
//
// Auth: any role with admission.leads.create permission, or super_admin / admin.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';

type DropdownOption = { id: string; name: string; role?: string; extra?: string };

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const institutionId = url.searchParams.get('institution_id') || undefined;
    const departmentId = url.searchParams.get('department_id') || undefined;

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    // Permission gate — either super_admin, admin role, or any custom role with
    // admission.leads.create. Merges permissions from all user_roles entries.
    const { data: profile } = await admin
      .from('profiles')
      .select('is_super_admin, role')
      .eq('id', user.id)
      .single();

    const isPrivileged =
      profile?.is_super_admin === true ||
      profile?.role === 'super_admin' ||
      profile?.role === 'admin' ||
      profile?.role === 'administrator';

    if (!isPrivileged) {
      const { data: userRoles } = await admin
        .from('user_roles')
        .select('custom_roles!inner(permissions)')
        .eq('user_id', user.id);

      const hasLeadsCreate = (userRoles || []).some((ur: any) => {
        const p = ur.custom_roles?.permissions || {};
        return (
          p['all'] === true ||
          p['admission.leads.create'] === true ||
          p['admission.leads.manage'] === true
        );
      });

      if (!hasLeadsCreate) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    let options: DropdownOption[] = [];

    if (type === 'institutions') {
      const { data, error } = await admin
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      options = (data || []).map((i) => ({ id: i.id, name: i.name }));
    } else if (type === 'departments') {
      if (!institutionId) {
        return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
      }
      const { data, error } = await admin
        .from('departments')
        .select('id, department_name')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('department_name', { ascending: true });
      if (error) throw error;
      options = (data || []).map((d: any) => ({ id: d.id, name: d.department_name }));
    } else if (type === 'students') {
      if (!institutionId) {
        return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
      }
      let q = admin
        .from('learners_profiles')
        .select('id, first_name, last_name, department_id')
        .eq('institution_id', institutionId)
        .eq('lifecycle_status', 'active')
        .order('first_name', { ascending: true })
        .limit(500);
      if (departmentId) q = q.eq('department_id', departmentId);
      const { data, error } = await q;
      if (error) throw error;
      options = (data || []).map((s: any) => ({
        id: s.id,
        name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Unnamed',
      }));
    } else if (type === 'staff') {
      if (!institutionId) {
        return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
      }
      let q = admin
        .from('staff')
        .select('id, first_name, last_name, designation, department_id')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('first_name', { ascending: true })
        .limit(500);
      if (departmentId) q = q.eq('department_id', departmentId);
      const { data, error } = await q;
      if (error) throw error;
      options = (data || []).map((f: any) => ({
        id: f.id,
        name:
          `${f.first_name || ''} ${f.last_name || ''}`.trim() +
          (f.designation ? ` (${f.designation})` : ''),
        extra: f.designation || undefined,
      }));
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ options });
  } catch (err: any) {
    console.error('[api/admission/referral-dropdowns] Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch dropdown options' },
      { status: 500 }
    );
  }
}
