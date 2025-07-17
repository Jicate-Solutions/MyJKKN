import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Check if user is authenticated and has admin privileges
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser, error: userError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (
      userError ||
      !currentUser ||
      !['super_admin', 'administrator'].includes(currentUser.role)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get consistency report
    const { data: reportData, error: reportError } = await supabase.rpc(
      'get_user_consistency_report'
    );

    if (reportError) {
      console.error('Error getting consistency report:', reportError);
      return NextResponse.json(
        { error: 'Failed to get consistency report' },
        { status: 500 }
      );
    }

    // Get orphaned auth users
    const { data: orphanedAuthUsers, error: orphanedAuthError } =
      await supabase.rpc('check_orphaned_auth_users');

    if (orphanedAuthError) {
      console.error('Error checking orphaned auth users:', orphanedAuthError);
    }

    // Get orphaned profiles
    const { data: orphanedProfiles, error: orphanedProfilesError } =
      await supabase.rpc('check_orphaned_profiles');

    if (orphanedProfilesError) {
      console.error('Error checking orphaned profiles:', orphanedProfilesError);
    }

    return NextResponse.json({
      success: true,
      report: reportData || [],
      orphaned_auth_users: orphanedAuthUsers || [],
      orphaned_profiles: orphanedProfiles || []
    });
  } catch (error) {
    console.error('Error in user consistency check:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Check if user is authenticated and has admin privileges
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser, error: userError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', session.user.id)
      .single();

    if (
      userError ||
      !currentUser ||
      !['super_admin', 'administrator'].includes(currentUser.role)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { action } = await request.json();

    if (action === 'sync_orphaned_auth_users') {
      // Sync orphaned auth users to profiles
      const { data: syncResults, error: syncError } = await supabase.rpc(
        'sync_orphaned_auth_users'
      );

      if (syncError) {
        console.error('Error syncing orphaned auth users:', syncError);
        return NextResponse.json(
          { error: 'Failed to sync orphaned auth users' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'sync_orphaned_auth_users',
        results: syncResults || [],
        message: `Synced ${
          (syncResults || []).length
        } orphaned auth users to profiles`
      });
    }

    return NextResponse.json(
      { error: 'Invalid action specified' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in user consistency fix:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
