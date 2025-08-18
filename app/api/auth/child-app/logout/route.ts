import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

// Add CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { app_id, session_id, redirect_uri, access_token } = body;
    
    if (!app_id) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing app_id' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    const serviceClient = createServiceRoleClient();
    
    // Validate the app exists
    const { data: app, error: appError } = await serviceClient
      .from('applications')
      .select('*')
      .eq('app_id', app_id)
      .eq('uses_parent_auth', true)
      .single();
    
    if (!app || appError) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid application' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Get user from session if possible
    let userId = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id || null;
    } catch (error) {
      // User might already be logged out
    }
    
    // If access token provided, validate and extract user ID
    if (access_token && !userId) {
      try {
        // You could validate the JWT here to get the user ID
        // For now, we'll just proceed without user ID
      } catch (error) {
        console.error('Token validation error:', error);
      }
    }
    
    // Invalidate the session if session_id provided
    if (session_id) {
      await serviceClient
        .from('child_app_sessions')
        .update({ 
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: 'user_logout'
        })
        .eq('id', session_id)
        .eq('child_app_id', app_id);
    }
    
    // Invalidate all sessions for this user and app if we have user ID
    if (userId) {
      await serviceClient
        .from('child_app_sessions')
        .update({ 
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: 'user_logout'
        })
        .eq('user_id', userId)
        .eq('child_app_id', app_id)
        .eq('is_active', true);
    }
    
    // Log the logout
    if (userId || session_id) {
      await serviceClient
        .from('child_app_access_logs')
        .insert({
          child_app_id: app_id,
          user_id: userId,
          session_id: session_id || null,
          action: 'logout',
          status: 'success',
          ip_address: request.headers.get('x-forwarded-for') || null,
          user_agent: request.headers.get('user-agent') || null,
          metadata: { redirect_uri }
        });
    }
    
    return NextResponse.json(
      { 
        success: true,
        message: 'Logout successful',
        redirect_uri: redirect_uri || null
      },
      { headers: corsHeaders }
    );
    
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}