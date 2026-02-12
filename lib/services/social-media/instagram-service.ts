/**
 * Instagram Monitoring Service
 * Pulls account stats and recent post metrics via Instagram Internal API
 *
 * Strategy (from SPECS):
 *   PRIMARY: Instagram Internal API (no auth, free, ~200 requests/hour)
 *   FUTURE:  Instagram Graph API (after Meta Business Verification)
 *   FALLBACK: Apify Instagram Scraper ($0.50/1000 posts)
 *
 * Rate limiting: 3-second delay between accounts
 * 59 accounts × 3 seconds = ~3 minutes total
 */

import { createClient } from '@supabase/supabase-js';

const IG_API_BASE = 'https://www.instagram.com/api/v1/users/web_profile_info/';
const IG_HEADERS: Record<string, string> = {
  'User-Agent': 'Instagram 219.0.0.12.117',
  'X-IG-App-ID': '936619743392459',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
};

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
  viewCount: number; // for videos/reels
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

export class InstagramService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Fetch with single retry for rate limiting
   * Instagram returns 429 or 401 when rate limited from cloud IPs
   * Keep retries minimal to stay within Vercel's 60s function timeout
   */
  private async fetchWithRetry(url: string, maxRetries = 1): Promise<Response> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const resp = await fetch(url, { headers: IG_HEADERS, cache: 'no-store' });
      if (resp.ok) return resp;
      if (resp.status === 404) return resp; // Not found is not retryable
      if ((resp.status === 429 || resp.status === 401) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000)); // 5s wait before retry
        continue;
      }
      return resp;
    }
    throw new Error('Unexpected: retry loop exited without returning');
  }

  /**
   * Fetch profile data from Instagram Internal API
   */
  async getProfile(username: string): Promise<InstagramProfile> {
    const url = `${IG_API_BASE}?username=${encodeURIComponent(username)}`;
    const resp = await this.fetchWithRetry(url);

    if (!resp.ok) {
      if (resp.status === 404) throw new Error(`Account @${username} not found`);
      if (resp.status === 429 || resp.status === 401) throw new Error(`Rate limited — try again in 60s`);
      throw new Error(`Instagram API error: ${resp.status}`);
    }

    const data = await resp.json();
    const user = data?.data?.user;
    if (!user) throw new Error(`No user data for @${username}`);

    return {
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
  }

  /**
   * Extract recent posts from the same API response
   */
  async getRecentPosts(username: string): Promise<InstagramPost[]> {
    const url = `${IG_API_BASE}?username=${encodeURIComponent(username)}`;
    const resp = await this.fetchWithRetry(url, 1);

    if (!resp.ok) return [];

    const data = await resp.json();
    const user = data?.data?.user;
    if (!user) return [];

    const edges = user.edge_owner_to_timeline_media?.edges || [];

    return edges.map((edge: Record<string, unknown>) => {
      const node = edge.node as Record<string, unknown>;
      const isVideo = node.__typename === 'GraphVideo' || node.is_video === true;
      const isCarousel = node.__typename === 'GraphSidecar';

      // Detect post type
      let postType: InstagramPost['postType'] = 'image_post';
      if (isCarousel) postType = 'carousel';
      else if (isVideo) {
        // Reels typically have product_type "clips"
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
  }

  /**
   * Pull data for a single Instagram account and store in database
   */
  async pullAccount(account: { id: string; username: string; institution_id: string }): Promise<PullResult> {
    const result: PullResult = {
      accountId: account.id,
      username: `@${account.username}`,
      success: false,
    };

    try {
      // Fetch profile (includes posts in same request — single API call)
      const profile = await this.getProfile(account.username);

      // Get posts from same API response
      const posts = await this.getRecentPosts(account.username);

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

  /**
   * Compute health score (0-100) matching the formula in types/social-media.ts
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
    // Activity (0-30): how recently and frequently they post
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

    // Engagement (0-30): engagement rate quality
    let engagementScore = 0;
    if (engagementRate >= 6) engagementScore = 30;
    else if (engagementRate >= 4) engagementScore = 25;
    else if (engagementRate >= 3) engagementScore = 20;
    else if (engagementRate >= 2) engagementScore = 15;
    else if (engagementRate >= 1) engagementScore = 10;
    else if (engagementRate > 0) engagementScore = 5;

    // Growth (0-20): follower growth rate
    let growthScore = 0;
    if (growthRate >= 5) growthScore = 20;
    else if (growthRate >= 2) growthScore = 15;
    else if (growthRate >= 1) growthScore = 10;
    else if (growthRate > 0) growthScore = 5;

    // Profile (0-20): completeness
    let profileScore = 0;
    if (profile.biography.length > 0) profileScore += 5;
    if (profile.profilePicUrl) profileScore += 5;
    if (profile.fullName.length > 0) profileScore += 5;
    if (profile.isBusinessAccount) profileScore += 5;

    return Math.min(100, activityScore + engagementScore + growthScore + profileScore);
  }

  /**
   * Pull all Instagram accounts for an institution
   */
  async pullAllAccounts(institutionId: string): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    details: PullResult[];
  }> {
    const { data: accounts, error } = await this.supabase
      .from('sm_accounts')
      .select('id, username, institution_id')
      .eq('institution_id', institutionId)
      .eq('platform', 'instagram');

    if (error || !accounts) {
      return { processed: 0, succeeded: 0, failed: 0, details: [] };
    }

    const details: PullResult[] = [];
    let succeeded = 0;
    let failed = 0;

    let rateLimited = false;
    for (const account of accounts) {
      if (rateLimited) {
        // Skip remaining accounts if rate limited
        details.push({
          accountId: account.id,
          username: `@${account.username}`,
          success: false,
          error: 'Skipped — rate limited on previous account',
        });
        failed++;
        continue;
      }

      const result = await this.pullAccount(account);
      details.push(result);
      if (result.success) succeeded++;
      else {
        failed++;
        if (result.error?.includes('Rate limited')) {
          rateLimited = true;
        }
      }

      // 5-second delay between requests to respect rate limits
      if (accounts.indexOf(account) < accounts.length - 1 && !rateLimited) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return {
      processed: accounts.length,
      succeeded,
      failed,
      details,
    };
  }
}
