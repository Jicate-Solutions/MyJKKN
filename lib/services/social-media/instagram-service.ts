/**
 * Instagram Monitoring Service
 * Pulls account stats and recent post metrics via Instagram APIs
 *
 * Strategy (in order of preference):
 *   1. Instagram Graph API (Business Discovery) — works from Vercel, official, free
 *   2. Instagram Internal API — only works from residential IPs (local dev fallback)
 *
 * Graph API: ONE connected Business account queries ALL other public Business accounts
 * Rate limit: 200 calls/hour/connected account (59 accounts = ~30% of limit)
 */

import { createClient } from '@supabase/supabase-js';

// ─── Graph API Configuration ────────────────────────────────────────────────
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Internal API Configuration (local-only fallback) ───────────────────────
const IG_INTERNAL_API_BASE = 'https://www.instagram.com/api/v1/users/web_profile_info/';
const IG_INTERNAL_HEADERS: Record<string, string> = {
  'User-Agent': 'Instagram 219.0.0.12.117',
  'X-IG-App-ID': '936619743392459',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
};

// ─── Shared Interfaces ──────────────────────────────────────────────────────

interface GraphApiCredential {
  accessToken: string;
  igUserId: string;
  pageId: string;
  accountId: string; // sm_accounts.id of the connected account
}

interface InstagramProfile {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  isVerified: boolean;
  isBusinessAccount: boolean;
  categoryName: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
}

interface InstagramPost {
  shortcode: string;
  caption: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isVideo: boolean;
  thumbnailUrl: string;
  publishedAt: string;
  postType: 'image_post' | 'video_post' | 'carousel' | 'reel';
}

interface PullResult {
  accountId: string;
  username: string;
  success: boolean;
  error?: string;
  snapshotId?: string;
  postsStored?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class InstagramService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: any;
  private graphCredential: GraphApiCredential | null = null;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /** Whether Graph API mode is active */
  get isGraphApiMode(): boolean {
    return this.graphCredential !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Graph API Initialization
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Try to load Graph API credentials for the institution.
   * Call this before pullAllAccounts() to enable Graph API mode.
   * Returns true if Graph API credentials are available and valid.
   */
  async initGraphApi(institutionId: string): Promise<boolean> {
    try {
      // Find a connected Instagram account for this institution
      const { data: connectedAccount } = await this.supabase
        .from('sm_accounts')
        .select('id')
        .eq('institution_id', institutionId)
        .eq('platform', 'instagram')
        .eq('is_connected', true)
        .limit(1)
        .single();

      if (!connectedAccount) return false;

      // Get its Graph API credential
      const { data: cred } = await this.supabase
        .from('sm_account_credentials')
        .select('access_token, platform_user_id, metadata')
        .eq('account_id', connectedAccount.id)
        .eq('credential_type', 'graph_api')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!cred?.access_token || !cred?.platform_user_id) return false;

      this.graphCredential = {
        accessToken: cred.access_token,
        igUserId: cred.platform_user_id,
        pageId: cred.metadata?.page_id || '',
        accountId: connectedAccount.id,
      };

      // Validate the token with a simple API call
      const valid = await this.validateGraphToken();
      if (!valid) {
        // Mark credential as needing reconnection
        await this.supabase
          .from('sm_account_credentials')
          .update({ needs_reconnect: true })
          .eq('account_id', connectedAccount.id)
          .eq('credential_type', 'graph_api');
        this.graphCredential = null;
        return false;
      }

      // Update last_used_at
      await this.supabase
        .from('sm_account_credentials')
        .update({ last_used_at: new Date().toISOString() })
        .eq('account_id', connectedAccount.id)
        .eq('credential_type', 'graph_api');

      return true;
    } catch {
      this.graphCredential = null;
      return false;
    }
  }

  /**
   * Validate the Graph API access token
   */
  private async validateGraphToken(): Promise<boolean> {
    if (!this.graphCredential) return false;
    try {
      const url = `${GRAPH_API_BASE}/${this.graphCredential.igUserId}?fields=id&access_token=${this.graphCredential.accessToken}`;
      const resp = await fetch(url, { cache: 'no-store' });
      return resp.ok;
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Data Fetching — Graph API (Primary)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch profile + posts via Instagram Graph API Business Discovery
   * Single API call per account — most efficient method
   */
  private async fetchViaGraphApi(
    username: string
  ): Promise<{ profile: InstagramProfile; posts: InstagramPost[] }> {
    if (!this.graphCredential) throw new Error('Graph API credentials not loaded');

    const fields = `business_discovery.username(${username}){username,name,profile_picture_url,biography,website,followers_count,follows_count,media_count,media.limit(25){id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count}}`;

    const params = new URLSearchParams({
      fields,
      access_token: this.graphCredential.accessToken,
    });

    const url = `${GRAPH_API_BASE}/${this.graphCredential.igUserId}?${params}`;
    const resp = await fetch(url, { cache: 'no-store' });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `Graph API error: ${resp.status}`;
      const errorCode = errorData?.error?.code;

      // Token expired
      if (errorCode === 190) {
        throw new Error('Access token expired — reconnect Instagram in settings');
      }
      // Not a business account
      if (resp.status === 400 && errorMsg.includes('not a Business')) {
        throw new Error(`@${username} is not a Business/Creator account — cannot query via Business Discovery`);
      }
      // Account not found
      if (errorMsg.includes('does not exist') || errorMsg.includes('Invalid username')) {
        throw new Error(`Account @${username} not found on Instagram`);
      }
      throw new Error(errorMsg);
    }

    const data = await resp.json();
    const bd = data?.business_discovery;
    if (!bd) throw new Error(`No business_discovery data for @${username}`);

    // Parse profile
    const profile: InstagramProfile = {
      username: bd.username || username,
      fullName: bd.name || '',
      biography: bd.biography || '',
      profilePicUrl: bd.profile_picture_url || '',
      isVerified: false, // Not available via Business Discovery
      isBusinessAccount: true, // Must be business/creator to be queried
      categoryName: null, // Not available via Business Discovery
      followerCount: bd.followers_count || 0,
      followingCount: bd.follows_count || 0,
      postCount: bd.media_count || 0,
    };

    // Parse posts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts: InstagramPost[] = (bd.media?.data || []).map((post: any) => {
      const mediaType = post.media_type; // IMAGE, VIDEO, CAROUSEL_ALBUM
      let postType: InstagramPost['postType'] = 'image_post';
      if (mediaType === 'VIDEO') postType = 'reel'; // Graph API VIDEO includes reels
      else if (mediaType === 'CAROUSEL_ALBUM') postType = 'carousel';

      // Extract shortcode from permalink: https://www.instagram.com/p/XXXX/ or /reel/XXXX/
      const permalink = post.permalink || '';
      const shortcodeMatch = permalink.match(/\/(?:p|reel)\/([^/]+)/);
      const shortcode = shortcodeMatch?.[1] || post.id;

      return {
        shortcode,
        caption: (post.caption || '').slice(0, 500),
        likeCount: post.like_count || 0,
        commentCount: post.comments_count || 0,
        viewCount: 0, // Not available via Business Discovery for other accounts
        isVideo: mediaType === 'VIDEO',
        thumbnailUrl: post.media_url || '',
        publishedAt: post.timestamp || new Date().toISOString(),
        postType,
      };
    });

    return { profile, posts };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Data Fetching — Internal API (Local Fallback)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch with single retry for rate limiting (Internal API)
   */
  private async fetchWithRetry(url: string, maxRetries = 1): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const resp = await fetch(url, { headers: IG_INTERNAL_HEADERS, cache: 'no-store' });
      if (resp.ok) return resp;
      if (resp.status === 404) return resp;
      if ((resp.status === 429 || resp.status === 401) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      return resp;
    }
    throw new Error('Unexpected: retry loop exited without returning');
  }

  /**
   * Fetch profile + posts via Instagram Internal API (two HTTP calls)
   * Only works from residential IPs — blocked from Vercel/cloud IPs
   */
  private async fetchViaInternalApi(
    username: string
  ): Promise<{ profile: InstagramProfile; posts: InstagramPost[] }> {
    const url = `${IG_INTERNAL_API_BASE}?username=${encodeURIComponent(username)}`;
    const resp = await this.fetchWithRetry(url);

    if (!resp.ok) {
      if (resp.status === 404) throw new Error(`Account @${username} not found`);
      if (resp.status === 429 || resp.status === 401) throw new Error(`Rate limited — try again in 60s`);
      throw new Error(`Instagram API error: ${resp.status}`);
    }

    const data = await resp.json();
    const user = data?.data?.user;
    if (!user) throw new Error(`No user data for @${username}`);

    // Parse profile
    const profile: InstagramProfile = {
      username: user.username,
      fullName: user.full_name || '',
      biography: user.biography || '',
      profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || '',
      isVerified: user.is_verified || false,
      isBusinessAccount: user.is_business_account || false,
      categoryName: user.category_name || null,
      followerCount: user.edge_followed_by?.count || 0,
      followingCount: user.edge_follow?.count || 0,
      postCount: user.edge_owner_to_timeline_media?.count || 0,
    };

    // Parse posts
    const edges = user.edge_owner_to_timeline_media?.edges || [];
    const posts: InstagramPost[] = edges.map((edge: Record<string, unknown>) => {
      const node = edge.node as Record<string, unknown>;
      const isVideo = node.__typename === 'GraphVideo' || node.is_video === true;
      const isCarousel = node.__typename === 'GraphSidecar';

      let postType: InstagramPost['postType'] = 'image_post';
      if (isCarousel) postType = 'carousel';
      else if (isVideo) {
        const productType = node.product_type as string | undefined;
        postType = productType === 'clips' ? 'reel' : 'video_post';
      }

      const captionEdges = (node.edge_media_to_caption as Record<string, unknown>)?.edges as Array<Record<string, unknown>> | undefined;
      const caption = captionEdges?.[0]?.node
        ? ((captionEdges[0].node as Record<string, unknown>).text as string || '')
        : '';

      return {
        shortcode: node.shortcode as string,
        caption: caption.slice(0, 500),
        likeCount: (node.edge_liked_by as Record<string, unknown>)?.count as number || 0,
        commentCount: (node.edge_media_to_comment as Record<string, unknown>)?.count as number || 0,
        viewCount: (node.video_view_count as number) || 0,
        isVideo,
        thumbnailUrl: (node.thumbnail_src as string) || (node.display_url as string) || '',
        publishedAt: new Date((node.taken_at_timestamp as number) * 1000).toISOString(),
        postType,
      };
    });

    return { profile, posts };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pull Account (Shared Logic)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pull data for a single Instagram account and store in database.
   * Uses Graph API if available, falls back to Internal API.
   */
  async pullAccount(account: { id: string; username: string; institution_id: string }): Promise<PullResult> {
    const result: PullResult = {
      accountId: account.id,
      username: `@${account.username}`,
      success: false,
    };

    try {
      // Fetch profile + posts using available API
      let profile: InstagramProfile;
      let posts: InstagramPost[];

      if (this.graphCredential) {
        ({ profile, posts } = await this.fetchViaGraphApi(account.username));
      } else {
        ({ profile, posts } = await this.fetchViaInternalApi(account.username));
      }

      // Compute engagement rate
      const totalEngagement = posts.reduce((sum, p) => sum + p.likeCount + p.commentCount, 0);
      const engagementRate = profile.followerCount > 0 && posts.length > 0
        ? (totalEngagement / posts.length / profile.followerCount) * 100
        : 0;

      // Get previous snapshot for growth calculation
      const { data: prevSnapshot } = await this.supabase
        .from('sm_snapshots')
        .select('followers_count')
        .eq('account_id', account.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      const followerGrowth = prevSnapshot
        ? profile.followerCount - prevSnapshot.followers_count
        : 0;
      const followerGrowthRate = prevSnapshot?.followers_count > 0
        ? (followerGrowth / prevSnapshot.followers_count) * 100
        : 0;

      // Compute health score
      const healthScore = this.computeHealthScore(profile, posts, engagementRate, followerGrowthRate);
      const healthStatus = healthScore >= 70 ? 'green'
        : healthScore >= 40 ? 'yellow'
        : healthScore >= 10 ? 'red'
        : 'dormant';

      // Find most recent post date
      const lastPostAt = posts.length > 0
        ? posts.reduce((latest, p) =>
            new Date(p.publishedAt) > new Date(latest) ? p.publishedAt : latest,
          posts[0].publishedAt)
        : null;

      // Upsert snapshot (one per account per day)
      const today = new Date().toISOString().split('T')[0];
      const totalLikes = posts.reduce((s, p) => s + p.likeCount, 0);
      const totalComments = posts.reduce((s, p) => s + p.commentCount, 0);
      const totalViews = posts.reduce((s, p) => s + p.viewCount, 0);

      const { data: snapshot, error: snapError } = await this.supabase
        .from('sm_snapshots')
        .upsert({
          account_id: account.id,
          institution_id: account.institution_id,
          snapshot_date: today,
          followers_count: profile.followerCount,
          following_count: profile.followingCount,
          posts_count: profile.postCount,
          total_likes: totalLikes,
          total_comments: totalComments,
          total_views: totalViews,
          engagement_rate: Math.round(engagementRate * 10000) / 10000,
          avg_likes_per_post: posts.length > 0
            ? Math.round(totalLikes / posts.length)
            : 0,
          avg_comments_per_post: posts.length > 0
            ? Math.round(totalComments / posts.length)
            : 0,
          follower_growth: followerGrowth,
          follower_growth_pct: Math.round(followerGrowthRate * 100) / 100,
          health_score: healthScore,
          health_status: healthStatus,
          source: 'auto_api',
        }, { onConflict: 'account_id,snapshot_date' })
        .select('id')
        .single();

      if (snapError) throw new Error(`Snapshot error: ${snapError.message}`);

      result.snapshotId = snapshot?.id;

      // Update account with latest data
      await this.supabase
        .from('sm_accounts')
        .update({
          display_name: profile.fullName || account.username,
          profile_pic_url: profile.profilePicUrl,
          bio: profile.biography,
          profile_url: `https://www.instagram.com/${account.username}/`,
          is_verified: profile.isVerified,
          health_score: healthScore,
          health_status: healthStatus,
          last_snapshot_at: new Date().toISOString(),
          last_post_at: lastPostAt,
          metadata: {
            follower_count: profile.followerCount,
            following_count: profile.followingCount,
            post_count: profile.postCount,
            is_business_account: profile.isBusinessAccount,
            category_name: profile.categoryName,
            data_source: this.graphCredential ? 'graph_api' : 'internal_api',
          },
        })
        .eq('id', account.id);

      // Store individual post metrics
      let postsStored = 0;
      for (const post of posts) {
        const postEngRate = profile.followerCount > 0
          ? ((post.likeCount + post.commentCount) / profile.followerCount) * 100
          : 0;

        const { error: postError } = await this.supabase
          .from('sm_post_metrics')
          .upsert({
            account_id: account.id,
            institution_id: account.institution_id,
            platform_post_id: post.shortcode,
            post_type: post.postType,
            permalink: `https://www.instagram.com/p/${post.shortcode}/`,
            caption: post.caption,
            thumbnail_url: post.thumbnailUrl,
            likes_count: post.likeCount,
            comments_count: post.commentCount,
            views_count: post.viewCount,
            engagement_rate: Math.round(postEngRate * 10000) / 10000,
            posted_at: post.publishedAt,
          }, { onConflict: 'account_id,platform_post_id' });

        if (!postError) postsStored++;
      }

      result.postsStored = postsStored;
      result.success = true;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Health Score
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute health score (0-100)
   *
   * Activity Score (0-30):   Based on posting frequency
   * Engagement Score (0-30): Based on engagement rate
   * Growth Score (0-20):     Based on follower growth rate
   * Profile Score (0-20):    Based on profile completeness
   */
  private computeHealthScore(
    profile: InstagramProfile,
    posts: InstagramPost[],
    engagementRate: number,
    growthRate: number
  ): number {
    // Activity (0-30)
    let activityScore = 0;
    if (posts.length > 0) {
      const daysSincePost = Math.floor(
        (Date.now() - new Date(posts[0].publishedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSincePost <= 7) activityScore = 30;
      else if (daysSincePost <= 14) activityScore = 25;
      else if (daysSincePost <= 30) activityScore = 20;
      else if (daysSincePost <= 60) activityScore = 10;
      else if (daysSincePost <= 90) activityScore = 5;
    }

    // Engagement (0-30)
    let engagementScore = 0;
    if (engagementRate >= 6) engagementScore = 30;
    else if (engagementRate >= 4) engagementScore = 25;
    else if (engagementRate >= 3) engagementScore = 20;
    else if (engagementRate >= 2) engagementScore = 15;
    else if (engagementRate >= 1) engagementScore = 10;
    else if (engagementRate > 0) engagementScore = 5;

    // Growth (0-20)
    let growthScore = 0;
    if (growthRate >= 5) growthScore = 20;
    else if (growthRate >= 2) growthScore = 15;
    else if (growthRate >= 1) growthScore = 10;
    else if (growthRate > 0) growthScore = 5;

    // Profile (0-20)
    let profileScore = 0;
    if (profile.biography.length > 0) profileScore += 5;
    if (profile.profilePicUrl) profileScore += 5;
    if (profile.fullName.length > 0) profileScore += 5;
    if (profile.isBusinessAccount) profileScore += 5;

    return Math.min(100, activityScore + engagementScore + growthScore + profileScore);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Pull All Accounts
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pull all Instagram accounts for an institution.
   * Uses Graph API if initGraphApi() was called successfully, else Internal API.
   */
  async pullAllAccounts(institutionId: string): Promise<{
    totalProcessed: number;
    totalSucceeded: number;
    totalFailed: number;
    results: PullResult[];
    dataSource: 'graph_api' | 'internal_api';
  }> {
    const { data: accounts, error } = await this.supabase
      .from('sm_accounts')
      .select('id, username, institution_id')
      .eq('institution_id', institutionId)
      .eq('platform', 'instagram');

    if (error || !accounts) {
      return { totalProcessed: 0, totalSucceeded: 0, totalFailed: 0, results: [], dataSource: this.graphCredential ? 'graph_api' : 'internal_api' };
    }

    const results: PullResult[] = [];
    let succeeded = 0;
    let failed = 0;

    // Graph API mode: faster, no rate limit concerns (200/hr is plenty)
    // Internal API mode: slower, rate limit detection needed
    const delayBetweenAccounts = this.graphCredential ? 1000 : 5000;

    let rateLimited = false;
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      if (rateLimited) {
        results.push({
          accountId: account.id,
          username: `@${account.username}`,
          success: false,
          error: 'Skipped — rate limited on previous account',
        });
        failed++;
        continue;
      }

      const result = await this.pullAccount(account);
      results.push(result);
      if (result.success) succeeded++;
      else {
        failed++;
        // Only stop on rate limit for Internal API mode
        if (!this.graphCredential && result.error?.includes('Rate limited')) {
          rateLimited = true;
        }
      }

      // Delay between requests
      if (i < accounts.length - 1 && !rateLimited) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenAccounts));
      }
    }

    return {
      totalProcessed: accounts.length,
      totalSucceeded: succeeded,
      totalFailed: failed,
      results,
      dataSource: this.graphCredential ? 'graph_api' : 'internal_api',
    };
  }
}

// ─── OAuth Helper Functions (used by API routes) ────────────────────────────

/**
 * Generate Facebook OAuth authorization URL
 */
export function getInstagramOAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: redirectUri,
    scope: 'instagram_basic,pages_show_list,pages_read_engagement',
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params}`;
}

/**
 * Exchange authorization code for access tokens.
 * Returns the long-lived user access token.
 */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  // Step 1: Exchange code for short-lived token
  const tokenParams = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: redirectUri,
    code,
  });

  const tokenResp = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${tokenParams}`,
    { cache: 'no-store' }
  );

  if (!tokenResp.ok) {
    const err = await tokenResp.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to exchange authorization code');
  }

  const tokenData = await tokenResp.json();
  const shortLivedToken = tokenData.access_token;

  // Step 2: Exchange short-lived token for long-lived token (60 days)
  const longLivedParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortLivedToken,
  });

  const longLivedResp = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${longLivedParams}`,
    { cache: 'no-store' }
  );

  if (!longLivedResp.ok) {
    const err = await longLivedResp.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to get long-lived token');
  }

  const longLivedData = await longLivedResp.json();
  return longLivedData.access_token;
}

/**
 * Get Facebook Pages with their Instagram Business accounts.
 * Uses the long-lived user token. Returns Pages with IG accounts attached.
 */
export async function getInstagramBusinessAccounts(userAccessToken: string): Promise<Array<{
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string;
  igUsername: string;
}>> {
  // Get pages with their Instagram business accounts
  const pagesResp = await fetch(
    `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userAccessToken}`,
    { cache: 'no-store' }
  );

  if (!pagesResp.ok) {
    const err = await pagesResp.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to get Facebook Pages');
  }

  const pagesData = await pagesResp.json();
  const results: Array<{
    pageId: string;
    pageName: string;
    pageAccessToken: string;
    igUserId: string;
    igUsername: string;
  }> = [];

  for (const page of pagesData.data || []) {
    if (page.instagram_business_account) {
      results.push({
        pageId: page.id,
        pageName: page.name || '',
        pageAccessToken: page.access_token,
        igUserId: page.instagram_business_account.id,
        igUsername: page.instagram_business_account.username || '',
      });
    }
  }

  return results;
}
