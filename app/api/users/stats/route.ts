import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/auth';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
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
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      !['super_admin', 'administrator'].includes(profile?.role || '')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all profiles
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('role, institution, is_active');

    if (usersError) throw usersError;

    // Calculate statistics
    const stats = {
      total: users.length,
      active: users.filter((user: any) => user.is_active).length,
      inactive: users.filter((user: any) => !user.is_active).length,
      byRole: {} as { [key: string]: number },
      byInstitution: {} as { [key: string]: number }
    };

    // Count by role
    users.forEach((user: any) => {
      stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
      if (user.institution) {
        stats.byInstitution[user.institution] =
          (stats.byInstitution[user.institution] || 0) + 1;
      }
    });

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error in GET /api/users/stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
