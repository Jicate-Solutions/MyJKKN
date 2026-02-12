import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInstagramOAuthUrl } from '@/lib/services/social-media/instagram-service';
import { randomBytes } from 'crypto';

/**
 * GET /api/social-media/instagram/auth
 *
 * Initiates the Facebook OAuth flow for Instagram Graph API.
 * Only admins (super_admin, admin, principal) can connect Instagram.
 *
 * Flow:
 *   1. Verify user is authenticated + admin
 *   2. Generate CSRF state token, store in cookie
 *   3. Redirect to Facebook OAuth consent screen
 */
export async function GET(request: NextRequest) {
  try {
    // Check META_APP_ID is configured
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return NextResponse.json(
        { error: 'Meta App credentials not configured. Add META_APP_ID and META_APP_SECRET to environment variables.' },
        { status: 500 }
      );
    }

    // Verify authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const adminRoles = ['super_admin', 'admin', 'principal'];
    if (!adminRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Only administrators can connect Instagram' }, { status: 403 });
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString('hex');

    // Build callback URL from the current request origin
    const requestUrl = new URL(request.url);
    const redirectUri = `${requestUrl.origin}/api/social-media/instagram/callback`;

    // Build Facebook OAuth URL
    const oauthUrl = getInstagramOAuthUrl(redirectUri, state);

    // Create response that redirects to Facebook
    const response = NextResponse.redirect(oauthUrl);

    // Store state + institution_id in a cookie for the callback to verify
    const cookieData = JSON.stringify({
      state,
      institutionId: profile.institution_id,
      userId: user.id,
    });

    response.cookies.set('ig_oauth_state', cookieData, {
      httpOnly: true,
      secure: requestUrl.protocol === 'https:',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('Instagram OAuth init error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
