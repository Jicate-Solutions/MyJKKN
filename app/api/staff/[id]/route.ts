import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { CookieOptions } from '@supabase/ssr';

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

    // Get the staff record to verify ownership for faculty users
    const { data: staffRecord, error: staffFetchError } = await supabaseAdmin
      .from('staff')
      .select('id, institution_email')
      .eq('id', id)
      .single();

    if (staffFetchError || !staffRecord) {
      return NextResponse.json(
        { error: 'Staff record not found' },
        { status: 404 }
      );
    }

    // Authorization: Faculty can only update their own record
    if (!isSuperAdmin && userProfile.role === 'faculty') {
      if (staffRecord.institution_email !== session.user.email) {
        return NextResponse.json(
          { error: 'Faculty users can only update their own profile' },
          { status: 403 }
        );
      }
    }

    // Authorization: Non-admin roles (except faculty updating self) need edit permission
    const canEditStaff =
      isSuperAdmin ||
      ['super_admin', 'administrator', 'hod'].includes(userProfile.role) ||
      (userProfile.role === 'faculty' &&
        staffRecord.institution_email === session.user.email);

    if (!canEditStaff) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update staff' },
        { status: 403 }
      );
    }

    const json = await request.json();

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
        category:employment_categories(id, category_name),
        institution:institutions(id, name, counselling_code),
        department:departments(id, department_name)
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
