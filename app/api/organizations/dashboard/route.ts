import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardService } from '@/lib/services/organization/dashboard-service';
import { RoleService } from '@/lib/services/roles/role-service';
import type { Profile } from '@/types/auth';

export async function GET(request: Request) {
  console.log('--- Inside /api/organizations/dashboard GET (Server) ---');
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get('institutionId');

  try {
    console.log('Attempting to get user session...');
    const {
      data: { user }
    } = await supabase.auth.getUser();
    console.log('Session retrieved. User ID:', user?.id);

    if (!user) {
      console.error('Unauthorized: No user found in session.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Fetching user profile...');
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id);

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json(
        { error: 'Database error while fetching profile' },
        { status: 500 }
      );
    }

    if (!profiles || profiles.length === 0) {
      console.error('Profile not found for user:', user.id);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profiles.length > 1) {
      console.error('Multiple profiles found for user:', user.id);
      // This is a critical data integrity issue.
      return NextResponse.json(
        { error: 'Critical: Multiple profiles found for user' },
        { status: 500 }
      );
    }

    const profile = profiles[0];
    console.log('Successfully fetched profile.');

    console.log('Checking for permission: organizations.dashboard.view');
    const role = await RoleService.getRoleByKey(profile.role);
    const canViewDashboard =
      profile.role === 'super_admin' ||
      (role?.permissions && role.permissions['organizations.dashboard.view']);

    console.log('Permission check result:', canViewDashboard);

    if (!canViewDashboard) {
      console.error('Forbidden: User does not have the required permission.');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log(
      'Attempting to get organization stats for institution:',
      institutionId
    );
    const stats = await DashboardService.getOrganizationStats(
      supabase,
      profile as Profile,
      institutionId
    );
    console.log('Successfully fetched organization stats.');

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error in /api/organizations/dashboard:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
