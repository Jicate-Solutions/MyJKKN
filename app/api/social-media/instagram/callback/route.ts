import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  exchangeCodeForToken,
  getInstagramBusinessAccounts,
} from '@/lib/services/social-media/instagram-service';

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/social-media/instagram/callback
 *
 * Facebook OAuth callback handler.
 * Exchanges authorization code for tokens, finds IG Business accounts,
 * stores credentials, and redirects back to the social media settings.
 *
 * Flow:
 *   1. Verify CSRF state from cookie
 *   2. Exchange code → short-lived token → long-lived token
 *   3. Get Facebook Pages with Instagram Business accounts
 *   4. Store Page Access Token + IG User ID in sm_account_credentials
 *   5. Mark the sm_account as is_connected: true
 *   6. Redirect to social media dashboard with success/error message
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Base URL for redirects
  const requestUrl = new URL(request.url);
  const baseUrl = requestUrl.origin;
  const dashboardUrl = `${baseUrl}/social-media`;

  // Handle Facebook OAuth errors (user denied, etc.)
  if (error) {
    const msg = encodeURIComponent(errorDescription || error);
    return NextResponse.redirect(`${dashboardUrl}?ig_error=${msg}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${dashboardUrl}?ig_error=Missing+authorization+code`);
  }

  // Verify CSRF state from cookie
  const cookieData = request.cookies.get('ig_oauth_state')?.value;
  if (!cookieData) {
    return NextResponse.redirect(`${dashboardUrl}?ig_error=Session+expired.+Please+try+again.`);
  }

  let oauthState: { state: string; institutionId: string; userId: string };
  try {
    oauthState = JSON.parse(cookieData);
  } catch {
    return NextResponse.redirect(`${dashboardUrl}?ig_error=Invalid+session+data`);
  }

  if (oauthState.state !== state) {
    return NextResponse.redirect(`${dashboardUrl}?ig_error=CSRF+state+mismatch`);
  }

  try {
    const redirectUri = `${baseUrl}/api/social-media/instagram/callback`;

    // Step 1: Exchange code for long-lived user token
    const longLivedToken = await exchangeCodeForToken(code, redirectUri);

    // Step 2: Get Facebook Pages with Instagram Business accounts
    const igAccounts = await getInstagramBusinessAccounts(longLivedToken);

    if (igAccounts.length === 0) {
      return NextResponse.redirect(
        `${dashboardUrl}?ig_error=${encodeURIComponent('No Instagram Business accounts found. Make sure your Facebook Page is connected to an Instagram Business or Creator account.')}`
      );
    }

    const serviceSupabase = getServiceSupabase();
    let connectedCount = 0;

    // Step 3: For each IG Business account, store credentials
    for (const igAccount of igAccounts) {
      // Try to find a matching sm_accounts record by username
      let { data: smAccount } = await serviceSupabase
        .from('sm_accounts')
        .select('id')
        .eq('institution_id', oauthState.institutionId)
        .eq('platform', 'instagram')
        .eq('username', igAccount.igUsername)
        .single();

      // If no match found, create a new sm_accounts record
      if (!smAccount) {
        const { data: newAccount } = await serviceSupabase
          .from('sm_accounts')
          .insert({
            institution_id: oauthState.institutionId,
            platform: 'instagram',
            username: igAccount.igUsername,
            display_name: igAccount.pageName,
            profile_url: `https://www.instagram.com/${igAccount.igUsername}/`,
            platform_account_id: igAccount.igUserId,
            account_type: 'business',
            is_connected: true,
            connected_by: oauthState.userId,
          })
          .select('id')
          .single();
        smAccount = newAccount;
      }

      if (!smAccount) continue;

      // Upsert credential (one per account + credential_type)
      await serviceSupabase
        .from('sm_account_credentials')
        .upsert({
          account_id: smAccount.id,
          credential_type: 'graph_api',
          access_token: igAccount.pageAccessToken,
          platform_user_id: igAccount.igUserId,
          scopes: ['instagram_basic', 'pages_show_list', 'pages_read_engagement'],
          is_active: true,
          needs_reconnect: false,
          last_used_at: new Date().toISOString(),
          created_by: oauthState.userId,
          metadata: {
            page_id: igAccount.pageId,
            page_name: igAccount.pageName,
            ig_username: igAccount.igUsername,
            token_type: 'page_access_token',
            connected_at: new Date().toISOString(),
          },
        }, { onConflict: 'account_id,credential_type' })
        .select('id');

      // Mark the sm_account as connected
      await serviceSupabase
        .from('sm_accounts')
        .update({
          is_connected: true,
          platform_account_id: igAccount.igUserId,
          connected_by: oauthState.userId,
        })
        .eq('id', smAccount.id);

      connectedCount++;
    }

    // Clear the OAuth state cookie
    const response = NextResponse.redirect(
      `${dashboardUrl}?ig_success=${encodeURIComponent(`Connected ${connectedCount} Instagram account${connectedCount !== 1 ? 's' : ''} via Graph API`)}`
    );
    response.cookies.delete('ig_oauth_state');
    return response;

  } catch (err) {
    console.error('Instagram OAuth callback error:', err);
    const msg = encodeURIComponent(err instanceof Error ? err.message : 'Connection failed');
    return NextResponse.redirect(`${dashboardUrl}?ig_error=${msg}`);
  }
}
