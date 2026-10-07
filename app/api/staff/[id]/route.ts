export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { getStaffScope } from '@/lib/services/staff/staff-scope';
import { pickStaffPatchFields } from '@/lib/services/staff/staff-patch-fields';
import {
  adminRecordMessageFor,
  OWN_COLLEGE_MESSAGE,
  refuseIfCallersRecord,
  refuseIfPrivilegedRoleKey,
  changedFieldsBeyondSmall,
  refuseIdentityChange,
  refuseIfAdminRecord,
  refuseIfLinksToAdmin
} from '@/lib/services/staff/staff-admin-powers';

// Create admin client for database operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// PATCH endpoint for updating a staff record (bypasses RLS for faculty users)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;

    // Create authenticated client with cookies
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set(name, value, options);
            } catch (error) {
              // Handle cookie errors in server context
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', { ...options, maxAge: 0 });
            } catch (error) {
              // Handle cookie errors in server context
            }
          }
        }
      }
    );

    // Check authentication
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin, role, institution_id, email')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: 'Failed to check user permissions' },
        { status: 500 }
      );
    }

    // Super admin = the is_super_admin flag, nothing else (2026-10-01).
    const isSuperAdmin = userProfile.is_super_admin === true;

    // Resolve staff module scope (defence-in-depth alongside the RLS
    // policies on public.staff from Batch A).
    const scope = isSuperAdmin
      ? ('all_institutions' as const)
      : await getStaffScope(supabase, session.user.id);

    if (scope === 'none') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the target staff record: profile_id + institution_id for the scope
    // rules, and every column for the admin-powers check below.
    const { data: staffRecord, error: staffFetchError } = await supabaseAdmin
      .from('staff')
      .select('*')
      .eq('id', id)
      .single();

    if (staffFetchError || !staffRecord) {
      return NextResponse.json(
        { error: 'Staff record not found' },
        { status: 404 }
      );
    }

    // Writes are staff.edit (HR Head) or super admin only — every other role
    // is view-only (2026-09-25). The self-edit branch that used to live here
    // let ANY user update their own row through supabaseAdmin, which skips
    // RLS and trg_staff_guard_role_key alike: a staff member could set their
    // own role_key to super_admin. It is gone, deliberately.
    let hasEditPermission = isSuperAdmin;
    if (!hasEditPermission) {
      const { data: permResult } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.edit'
      });
      hasEditPermission = !!permResult;
    }

    if (!hasEditPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update staff' },
        { status: 403 }
      );
    }

    if (scope === 'own_records') {
      const isOwnRecord =
        !!staffRecord.profile_id && staffRecord.profile_id === session.user.id;
      if (!isOwnRecord) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'STAFF_OWN_RECORD_VIOLATION' },
          { status: 403 }
        );
      }
    } else if (scope === 'own_institution' && staffRecord.institution_id) {
      // Same helper the RLS policies use.
      const { data: hasAccess } = await supabase.rpc(
        'role_has_institution_access',
        { check_institution_id: staffRecord.institution_id }
      );
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'STAFF_INSTITUTION_VIOLATION' },
          { status: 403 }
        );
      }
    }
    // all_institutions: no row-level scope gate needed.

    const json = await request.json();

    // Moving a person to another institution: the caller must reach the new
    // one. On the record of someone with admin powers it is super admin only
    // (the admin-powers check below), like every field but the small ones.
    if (
      !isSuperAdmin &&
      Object.prototype.hasOwnProperty.call(json, 'institution_id') &&
      json.institution_id !== staffRecord.institution_id
    ) {
      const { data: canReach, error: reachError } = await supabase.rpc('role_has_institution_access', {
        check_institution_id: json.institution_id ?? null
      });
      if (reachError || canReach !== true) {
        return NextResponse.json(
          { error: 'You cannot move a team member to an institution you do not have access to.' },
          { status: 403 }
        );
      }
      // 2026-10-07: nor their own record: the sync would copy the college onto
      // their profile and widen what "their own institution" lets them see.
      const own = await refuseIfCallersRecord(supabase, staffRecord, OWN_COLLEGE_MESSAGE);
      if (own) {
        return NextResponse.json({ error: own.error }, { status: own.status });
      }
    }

    // Role change. supabaseAdmin below has no auth.uid(), so
    // trg_staff_guard_role_key lets everything through — this is the same
    // rule enforced in code: super admin, or staff.role.change onto a
    // non-privileged role.
    if (
      Object.prototype.hasOwnProperty.call(json, 'role_key') &&
      json.role_key !== staffRecord.role_key &&
      !isSuperAdmin
    ) {
      // 2026-10-03: nobody but a super admin changes the role on their own
      // record: its profile link, or any account or profile carrying its
      // emails (the database's own test of "the caller's record").
      const own = await refuseIfCallersRecord(supabase, staffRecord);
      if (own) {
        return NextResponse.json({ error: own.error }, { status: own.status });
      }

      const { data: canChangeRole } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.role.change'
      });
      if (!canChangeRole) {
        return NextResponse.json(
          { error: "Only HR Head or a super administrator can change a staff member's role." },
          { status: 403 }
        );
      }
      // Privileged = the database's one test (is_privileged, or a role name
      // is_admin() trusts).
      const { data: targetRole } = await supabaseAdmin
        .from('custom_roles')
        .select('id')
        .eq('role_key', json.role_key)
        .maybeSingle();
      const privileged = targetRole ? await refuseIfPrivilegedRoleKey(supabase, json.role_key) : null;
      if (!targetRole || privileged) {
        return NextResponse.json(
          {
            error:
              privileged?.status === 500
                ? privileged.error
                : `Only a super administrator can assign the role "${json.role_key}".`
          },
          { status: privileged?.status ?? 403 }
        );
      }
    }

    // Only the columns the staff form edits — never the raw body.
    const fields = pickStaffPatchFields(json);

    // 2026-10-01: the record of someone with admin powers (privileged staff
    // role, super admin flag, privileged profile role or user_roles role) is
    // super admin only, except the photo, phone numbers and attendance
    // machine code. supabaseAdmin below skips the database guard that
    // enforces the same rule.
    const extraColumns = changedFieldsBeyondSmall(fields, staffRecord);
    if (!isSuperAdmin && extraColumns.length > 0) {
      const refusal = await refuseIfAdminRecord(supabase, id);
      if (refusal) {
        // Name what else the edit changes: the staff form sends every field.
        const error = refusal.status === 403 ? adminRecordMessageFor(extraColumns) : refusal.error;
        return NextResponse.json({ error }, { status: refusal.status });
      }
    }

    // A new institution email re-points the record: sync_staff_to_profiles
    // finds the profile by that email when profile_id is empty, and would
    // copy this row's role onto someone with admin powers.
    if (
      !isSuperAdmin &&
      typeof fields.institution_email === 'string' &&
      fields.institution_email !== staffRecord.institution_email
    ) {
      const refusal = await refuseIfLinksToAdmin(
        supabase,
        staffRecord.profile_id,
        fields.institution_email
      );
      if (refusal) {
        return NextResponse.json({ error: refusal.error }, { status: refusal.status });
      }
    }

    // Normalize empty staff_id to null so the staff_staff_id_not_empty
    // CHECK constraint doesn't reject blanks coming from the form.
    if (fields.staff_id === '') fields.staff_id = null;

    // 2026-10-03: for every caller, super admins included: the record may not
    // be re-pointed to or from the caller's own account or the Director's, nor
    // to anyone else while a salary revision is waiting or approved.
    const identity = await refuseIdentityChange(supabase, id, {
      profileId: staffRecord.profile_id,
      email: 'email' in fields ? (fields.email as string | null) : staffRecord.email,
      institutionEmail:
        'institution_email' in fields
          ? (fields.institution_email as string | null)
          : staffRecord.institution_email
    });
    if (identity) {
      return NextResponse.json({ error: identity.error }, { status: identity.status });
    }

    // Update the staff record using admin client (bypasses RLS)
    const { data: updatedStaff, error: updateError } = await supabaseAdmin
      .from('staff')
      .update({
        ...fields,
        updated_by: session.user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(
        `
        *,
        category:employment_categories(id, category_name, is_teaching, shows_extended_profile),
        institution:institutions!staff_institution_id_fkey(id, name, counselling_code),
        department:departments(id, department_name),
        role:custom_roles!role_key(id, role_key, role_name, description, is_system_role)
      `
      )
      .single();

    if (updateError) {
      console.error('[/api/staff/[id]] Error updating staff:', updateError);
      return NextResponse.json(
        { error: 'Failed to update staff record', details: updateError.message },
        { status: 500 }
      );
    }

    // If the college really changed (the form always sends one) and the
    // record is linked, sync the profile. Only a real move: a phone-only
    // edit must not copy the record's college over a profile's (2026-10-03);
    // a real move has already passed the admin-record check above.
    // The profile is the one linked by profile_id, never every profile that
    // happens to carry the institution email (2026-10-03).
    if (
      fields.institution_id &&
      fields.institution_id !== staffRecord.institution_id &&
      staffRecord.profile_id
    ) {
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ institution_id: fields.institution_id })
        .eq('id', staffRecord.profile_id);

      if (profileUpdateError) {
        console.warn(
          '[/api/staff/[id]] Failed to sync profile institution_id:',
          profileUpdateError
        );
      }
    }

    console.log('[/api/staff/[id]] Staff updated successfully:', id);

    return NextResponse.json(updatedStaff);
  } catch (error) {
    console.error('[/api/staff/[id]] Error in PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE endpoint for removing a staff record. The client first attempts a
// direct RLS-scoped delete (see StaffService.deleteStaff); when RLS silently
// deletes 0 rows (no error, just an empty result — the same "staff_delete_scope_aware"
// policy PostgREST can't always resolve in one round trip), it falls back to
// this route, which duplicates the policy's permission + scope check explicitly
// so the caller gets a real 403 instead of a false "deleted successfully".
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set(name, value, options);
            } catch (error) {
              // Handle cookie errors in server context
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', { ...options, maxAge: 0 });
            } catch (error) {
              // Handle cookie errors in server context
            }
          }
        }
      }
    );

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin, role')
      .eq('id', session.user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json(
        { error: 'Failed to check user permissions' },
        { status: 500 }
      );
    }

    // Super admin = the is_super_admin flag, nothing else (2026-10-01).
    const isSuperAdmin = userProfile.is_super_admin === true;

    const scope = isSuperAdmin
      ? ('all_institutions' as const)
      : await getStaffScope(supabase, session.user.id);

    if (scope === 'none') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: staffRecord, error: staffFetchError } = await supabaseAdmin
      .from('staff')
      .select('id, institution_id')
      .eq('id', id)
      .single();

    if (staffFetchError || !staffRecord) {
      return NextResponse.json(
        { error: 'Staff record not found' },
        { status: 404 }
      );
    }

    let hasDeletePermission = isSuperAdmin;
    if (!hasDeletePermission) {
      const { data: permResult } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.delete'
      });
      hasDeletePermission = !!permResult;
    }

    if (!hasDeletePermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete staff' },
        { status: 403 }
      );
    }

    // 2026-10-01: deleting the record of someone with admin powers is super
    // admin only (same rule as PATCH and the database guard).
    if (!isSuperAdmin) {
      const refusal = await refuseIfAdminRecord(supabase, id);
      if (refusal) {
        return NextResponse.json({ error: refusal.error }, { status: refusal.status });
      }
    }

    // Mirrors the "staff_delete_scope_aware" RLS policy: own_records scope
    // never deletes, own_institution requires institution access to the
    // target row, all_institutions (incl. super admin) is unrestricted.
    if (scope === 'own_records') {
      return NextResponse.json(
        { error: 'Forbidden', code: 'STAFF_OWN_RECORD_VIOLATION' },
        { status: 403 }
      );
    } else if (scope === 'own_institution' && staffRecord.institution_id) {
      const { data: hasAccess } = await supabase.rpc(
        'role_has_institution_access',
        { check_institution_id: staffRecord.institution_id }
      );
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'STAFF_INSTITUTION_VIOLATION' },
          { status: 403 }
        );
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('staff')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[/api/staff/[id]] Error deleting staff:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete staff record', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('[/api/staff/[id]] Staff deleted successfully:', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/staff/[id]] Error in DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
