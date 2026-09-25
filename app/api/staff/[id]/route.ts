export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse , connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';
import { getStaffScope } from '@/lib/services/staff/staff-scope';

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

    const isSuperAdmin =
      userProfile.is_super_admin || userProfile.role === 'super_admin';

    // Resolve staff module scope (defence-in-depth alongside the RLS
    // policies on public.staff from Batch A).
    const scope = isSuperAdmin
      ? ('all_institutions' as const)
      : await getStaffScope(supabase, session.user.id);

    if (scope === 'none') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the target staff record (need profile_id + institution_id to
    // enforce scope ownership rules).
    const { data: staffRecord, error: staffFetchError } = await supabaseAdmin
      .from('staff')
      .select('id, profile_id, institution_id, institution_email, role_key')
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

    // Role change. supabaseAdmin below has no auth.uid(), so
    // trg_staff_guard_role_key lets everything through — this is the same
    // rule enforced in code: super admin, or staff.role.change onto a
    // non-privileged role.
    if (
      Object.prototype.hasOwnProperty.call(json, 'role_key') &&
      json.role_key !== staffRecord.role_key &&
      !isSuperAdmin
    ) {
      const { data: canChangeRole } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.role.change'
      });
      if (!canChangeRole) {
        return NextResponse.json(
          { error: "Only HR Head or a super administrator can change a staff member's role." },
          { status: 403 }
        );
      }
      const { data: targetRole } = await supabaseAdmin
        .from('custom_roles')
        .select('is_privileged')
        .eq('role_key', json.role_key)
        .maybeSingle();
      if (!targetRole || (targetRole as any).is_privileged) {
        return NextResponse.json(
          { error: `Only a super administrator can assign the role "${json.role_key}".` },
          { status: 403 }
        );
      }
    }

    // Normalize empty staff_id to null so the staff_staff_id_not_empty
    // CHECK constraint doesn't reject blanks coming from the form.
    if (json.staff_id === '') json.staff_id = null;

    // Update the staff record using admin client (bypasses RLS)
    const { data: updatedStaff, error: updateError } = await supabaseAdmin
      .from('staff')
      .update({
        ...json,
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

    // If institution_id was updated and staff has institution_email, sync profile
    if (json.institution_id && staffRecord.institution_email) {
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ institution_id: json.institution_id })
        .eq('email', staffRecord.institution_email);

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

    const isSuperAdmin =
      userProfile.is_super_admin || userProfile.role === 'super_admin';

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
