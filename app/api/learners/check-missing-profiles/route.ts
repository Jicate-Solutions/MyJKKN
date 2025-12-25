import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';


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
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // 2. Check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch user profile'
        },
        { status: 500 }
      );
    }

    const profile = profileData as {
      id: string;
      role: string;
      is_super_admin: boolean | null;
    };

    // Get user's role and permissions
    const { data: roleData, error: roleError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', profile.role)
      .single();

    if (roleError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch role permissions'
        },
        { status: 500 }
      );
    }

    const rolePermissions = roleData as { permissions: Record<string, boolean> } | null;

    // Check for learners.profiles.sync permission or super admin
    const permissions = rolePermissions?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['learners.profiles.sync'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to sync learner profiles'
        },
        { status: 403 }
      );
    }

    // 3. Use database function to get truly missing profiles
    // This bypasses Supabase pagination limits and does case-insensitive comparison
    // at the database level using LEFT JOIN for accuracy
    const { data: missingProfiles, error: missingError } = await supabaseAdmin
      .rpc('get_learners_missing_profiles');

    if (missingError) {
      throw new Error(`Failed to fetch missing profiles: ${missingError.message}`);
    }

    // 4. Get total count of active learners for summary
    const { count: totalLearners, error: countError } = await supabaseAdmin
      .from('learners_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_profile_complete', true)
      .eq('lifecycle_status', 'active')
      .not('college_email', 'is', null);

    if (countError) {
      throw new Error(`Failed to count learners: ${countError.message}`);
    }

    if (!totalLearners || totalLearners === 0) {
      return NextResponse.json({
        success: true,
        summary: 'No active learners with complete profiles found.',
        total_learners: 0,
        with_profiles: 0,
        without_profiles: 0,
        details: []
      });
    }

    // Construct the response in the format expected by the frontend component
    const withProfiles = totalLearners - missingProfiles.length;
    const summaryMessage =
      missingProfiles.length === 0
        ? 'All active learners have user profiles created.'
        : `Found ${missingProfiles.length} active learner${missingProfiles.length === 1 ? '' : 's'} with complete profile${missingProfiles.length === 1 ? '' : 's'} who ${missingProfiles.length === 1 ? 'is' : 'are'} missing a user profile.`;

    return NextResponse.json({
      success: true,
      summary: summaryMessage,
      total_learners: totalLearners,
      with_profiles: withProfiles,
      without_profiles: missingProfiles.length,
      details: missingProfiles.map((l: any) => ({
        learner_id: l.learner_id,
        name: `${l.first_name} ${l.last_name || ''}`.trim(),
        college_email: l.college_email
      }))
    });
  } catch (error) {
    console.error('[api/learners/check-missing-profiles] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
