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
      .select('id, profile_id, institution_id, institution_email')
      .eq('id', id)
      .single();

    if (staffFetchError || !staffRecord) {
      return NextResponse.json(
        { error: 'Staff record not found' },
        { status: 404 }
      );
    }

    // Self-edit branch: any user editing their own staff record (matched by
    // institution_email OR profile_id) is allowed without staff.edit.
    // Preserves the prior "faculty can update own profile" behaviour for any
    // role, not just faculty.  The institution_email check covers legacy staff
    // rows whose profile_id was never back-filled.
    const isSelfEdit =
      (!!staffRecord.institution_email &&
        staffRecord.institution_email === session.user.email) ||
      (!!staffRecord.profile_id &&
        staffRecord.profile_id === session.user.id);

    // Permission check via DB instead of hardcoded role list. Honours dynamic
    // Role Management grants for staff.edit.
    let hasEditPermission = isSuperAdmin;
    if (!hasEditPermission) {
      const { data: permResult } = await supabase.rpc('user_has_permission', {
        permission_name: 'staff.edit'
      });
      hasEditPermission = !!permResult;
    }

    // Scope enforcement — runs AFTER permission + self-edit are resolved so
    // self-edits by users with own_records scope whose staff.profile_id is
    // NULL (legacy rows) are not wrongly blocked.
    if (scope === 'own_records') {
      const isOwnRecord =
        isSelfEdit ||
        (!!staffRecord.profile_id && staffRecord.profile_id === session.user.id);
      if (!isOwnRecord) {
        return NextResponse.json(
          { error: 'Forbidden', code: 'STAFF_OWN_RECORD_VIOLATION' },
          { status: 403 }
        );
      }
    } else if (scope === 'own_institution') {
      // own_institution: user must have institution access for the target staff
      // member's institution.  Uses the same helper the RLS policies use.
      if (!isSelfEdit && hasEditPermission && staffRecord.institution_id) {
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
    }
    // all_institutions: no row-level scope gate needed.

    if (!hasEditPermission && !isSelfEdit) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update staff' },
        { status: 403 }
      );
    }

    const json = await request.json();

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
        institution:institutions(id, name, counselling_code),
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
