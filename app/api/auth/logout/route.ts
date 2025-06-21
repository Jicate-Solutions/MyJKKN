import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      // User might already be logged out, which is fine
      return NextResponse.json({ 
        success: true, 
        message: 'No active session to log out' 
      });
    }

    try {
      // Get user profile for activity logging
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, institution_id')
        .eq('id', user.id)
        .single();

      // Log logout activity
      const userName = profile?.full_name || user.email || 'Unknown';
      const template = ActivityTemplates.userLogout(userName);
      
      await logActivity({
        userId: user.id,
        actionType: template.actionType,
        resourceType: template.resourceType,
        description: template.description,
        request,
        metadata: {
          logout_method: 'manual',
          user_email: user.email,
          user_role: profile?.role || 'unknown',
          session_duration: 'unknown', // Could calculate this if we track login time
          logout_timestamp: new Date().toISOString()
        },
        institutionId: profile?.institution_id,
        statusCode: 200
      });

      return NextResponse.json({
        success: true,
        message: 'Logout activity logged successfully'
      });
    } catch (activityError) {
      console.error('Failed to log logout activity:', activityError);
      // Return success even if activity logging fails - don't block logout
      return NextResponse.json({
        success: true,
        message: 'Logout processed, activity logging failed',
        warning: 'Activity logging failed but logout can proceed'
      });
    }
  } catch (error) {
    console.error('Error in logout API:', error);
    // Don't block logout even if there's an error
    return NextResponse.json({
      success: true,
      message: 'Logout can proceed despite logging error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 