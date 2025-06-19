import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Create admin client for user management
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

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Check if user is admin
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser, error: userError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['super_admin'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only super admin can access cleanup utilities' },
        { status: 403 }
      );
    }

    // Get all auth users
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();

    // Get all profiles
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email');

    const profileEmails = new Set(profiles?.map((p) => p.email) || []);
    const profileIds = new Set(profiles?.map((p) => p.id) || []);

    // Find orphaned auth users (auth user exists but no profile)
    const orphanedAuthUsers = authUsers.users.filter(
      (user) =>
        !profileIds.has(user.id) && user.email && user.email.includes('@')
    );

    // Find staff emails that should have profiles
    const { data: staffEmails } = await supabaseAdmin
      .from('staff')
      .select('institution_email')
      .not('institution_email', 'is', null)
      .not('institution_email', 'eq', '');

    const expectedStaffEmails = new Set(
      staffEmails?.map((s) => s.institution_email) || []
    );

    const orphanedStaffAuthUsers = orphanedAuthUsers.filter(
      (user) => user.email && expectedStaffEmails.has(user.email)
    );

    return NextResponse.json({
      success: true,
      summary: {
        total_auth_users: authUsers.users.length,
        total_profiles: profiles?.length || 0,
        orphaned_auth_users: orphanedAuthUsers.length,
        orphaned_staff_auth_users: orphanedStaffAuthUsers.length
      },
      details: {
        orphaned_auth_users: orphanedAuthUsers.map((user) => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at,
          is_staff_email: user.email
            ? expectedStaffEmails.has(user.email)
            : false
        })),
        orphaned_staff_auth_users: orphanedStaffAuthUsers.map((user) => ({
          id: user.id,
          email: user.email,
          created_at: user.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Error in cleanup check:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
