/**
 * YouTube Monitoring Service
 * Pulls channel stats and recent video metrics via YouTube Data API v3
 *
 * Quota usage per channel (optimized):
 *   channels.list:      1 unit
 *   playlistItems.list:  1 unit
 *   videos.list:         1 unit (batch up to 50 IDs)
 *   Total: ~3 units per channel
 */

import { createClient } from '@supabase/supabase-js';

interface YouTubeChannelStats {
  channelId: string;
  title: string;
  description: string;
  customUrl: string;
  thumbnailUrl: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string;
}

interface YouTubeVideoStats {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface PullResult {
  accountId: string;
  username: string;
  success: boolean;
  error?: string;
  snapshotId?: string;
  postsStored?: number;
}

export class YouTubeService {
  private apiKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: any;

  constructor() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error('YOUTUBE_API_KEY environment variable is not set');
    this.apiKey = apiKey;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment variables are not set');
    }
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Fetch channel statistics from YouTube Data API
   */
  async getChannelStats(handle: string): Promise<YouTubeChannelStats | null> {
    // Strip @ prefix if present
    const cleanHandle = handle.replace(/^@/, '');

    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'statistics,snippet,contentDetails');
    url.searchParams.set('forHandle', cleanHandle);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const channel = data.items[0];
    const stats = channel.statistics;
    const snippet = channel.snippet;
    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;

    return {
      channelId: channel.id,
      title: snippet.title,
      description: snippet.description || '',
      customUrl: snippet.customUrl || '',
      thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
      subscriberCount: parseInt(stats.subscriberCount || '0', 10),
      videoCount: parseInt(stats.videoCount || '0', 10),
      viewCount: parseInt(stats.viewCount || '0', 10),
      uploadsPlaylistId: uploads || '',
    };
  }

  /**
   * Fetch recent videos from a channel's uploads playlist
   * Uses playlistItems.list (1 quota unit) instead of search.list (100 units)
   */
  async getRecentVideos(uploadsPlaylistId: string, maxResults: number = 20): Promise<YouTubeVideoStats[]> {
    if (!uploadsPlaylistId) return [];

    // Step 1: Get video IDs from playlist (1 quota unit)
    const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    playlistUrl.searchParams.set('part', 'snippet,contentDetails');
    playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
    playlistUrl.searchParams.set('maxResults', String(maxResults));
    playlistUrl.searchParams.set('key', this.apiKey);

    const playlistResp = await fetch(playlistUrl.toString());
    if (!playlistResp.ok) {
      // 404 = playlist exists but has no content (channel with 0 videos)
      if (playlistResp.status === 404) return [];
      throw new Error(`YouTube playlist API error: ${playlistResp.status}`);
    }

    const playlistData = await playlistResp.json();
    const items = playlistData.items || [];
    if (items.length === 0) return [];

    // Extract video IDs and basic info
    const videoIds = items.map((item: any) => item.contentDetails.videoId);
    const videoSnippets = new Map<string, any>();
    items.forEach((item: any) => {
      videoSnippets.set(item.contentDetails.videoId, item.snippet);
    });

    // Step 2: Get video statistics in batch (1 quota unit for up to 50 videos)
    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.searchParams.set('part', 'statistics');
    videosUrl.searchParams.set('id', videoIds.join(','));
    videosUrl.searchParams.set('key', this.apiKey);

    const videosResp = await fetch(videosUrl.toString());
    if (!videosResp.ok) {
      throw new Error(`YouTube videos API error: ${videosResp.status}`);
    }

    const videosData = await videosResp.json();

    return (videosData.items || []).map((video: any) => {
      const snippet = videoSnippets.get(video.id) || {};
      const stats = video.statistics || {};
      return {
        videoId: video.id,
        title: snippet.title || '',
        description: snippet.description || '',
        publishedAt: snippet.publishedAt || '',
        thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        viewCount: parseInt(stats.viewCount || '0', 10),
        likeCount: parseInt(stats.likeCount || '0', 10),
        commentCount: parseInt(stats.commentCount || '0', 10),
      };
    });
  }

  /**
   * Pull data for a single YouTube account and store in database
   */
  async pullAccount(account: { id: string; username: string; institution_id: string }): Promise<PullResult> {
    try {
      // 1. Get channel stats
      const channel = await this.getChannelStats(account.username);
      if (!channel) {
        return {
          accountId: account.id,
          username: account.username,
          success: false,
          error: `Channel not found for handle ${account.username}`,
        };
      }

      // 2. Get recent videos
      const videos = await this.getRecentVideos(channel.uploadsPlaylistId);

      // 3. Compute metrics
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const postsLast7 = videos.filter(v => new Date(v.publishedAt) >= sevenDaysAgo).length;
      const postsLast30 = videos.filter(v => new Date(v.publishedAt) >= thirtyDaysAgo).length;

      const totalLikes = videos.reduce((sum, v) => sum + v.likeCount, 0);
      const totalComments = videos.reduce((sum, v) => sum + v.commentCount, 0);
      const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);

      const engagementRate = channel.subscriberCount > 0 && videos.length > 0
        ? ((totalLikes + totalComments) / videos.length) / channel.subscriberCount * 100
        : 0;

      // 4. Store snapshot
      const snapshotDate = now.toISOString().split('T')[0];

      const { data: snapshot, error: snapError } = await this.supabase
        .from('sm_snapshots')
        .upsert({
          institution_id: account.institution_id,
          account_id: account.id,
          snapshot_date: snapshotDate,
          followers_count: channel.subscriberCount,
          following_count: 0, // YouTube doesn't have following
          posts_count: channel.videoCount,
          total_likes: totalLikes,
          total_comments: totalComments,
          total_views: totalViews,
          engagement_rate: Math.round(engagementRate * 100) / 100,
          avg_likes_per_post: videos.length > 0 ? Math.round(totalLikes / videos.length) : 0,
          avg_comments_per_post: videos.length > 0 ? Math.round(totalComments / videos.length) : 0,
          follower_growth: 0, // Calculated by comparing with previous snapshot
          follower_growth_pct: 0,
          posts_last_7_days: postsLast7,
          posts_last_30_days: postsLast30,
          health_score: 0, // Will be computed after
          health_status: 'dormant', // Will be updated
          source: 'auto_api',
          raw_data: { channel, videosCount: videos.length },
        }, { onConflict: 'account_id,snapshot_date' })
        .select()
        .single();

      if (snapError) throw new Error(`Snapshot insert failed: ${snapError.message}`);
      if (!snapshot) throw new Error('Snapshot insert returned no data');

      // 5. Compute follower growth vs previous snapshot
      const { data: prevSnapshot } = await this.supabase
        .from('sm_snapshots')
        .select('followers_count')
        .eq('account_id', account.id)
        .lt('snapshot_date', snapshotDate)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      let followerGrowth = 0;
      let followerGrowthPct = 0;
      if (prevSnapshot) {
        followerGrowth = channel.subscriberCount - prevSnapshot.followers_count;
        followerGrowthPct = prevSnapshot.followers_count > 0
          ? (followerGrowth / prevSnapshot.followers_count) * 100
          : 0;
      }

      // 6. Compute health score
      const lastPostDate = videos.length > 0 ? new Date(videos[0].publishedAt) : null;
      const daysSinceLastPost = lastPostDate
        ? Math.floor((now.getTime() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Simple health score calculation
      let healthScore = 0;
      // Posting frequency (40 points)
      if (daysSinceLastPost <= 3) healthScore += 40;
      else if (daysSinceLastPost <= 7) healthScore += 30;
      else if (daysSinceLastPost <= 14) healthScore += 15;
      else if (daysSinceLastPost <= 30) healthScore += 5;
      // Engagement (35 points) - YouTube avg engagement ~2-5%
      if (engagementRate >= 5) healthScore += 35;
      else if (engagementRate >= 2) healthScore += 25;
      else if (engagementRate >= 0.5) healthScore += 15;
      else if (engagementRate > 0) healthScore += 5;
      // Growth (15 points)
      if (followerGrowthPct > 5) healthScore += 15;
      else if (followerGrowthPct > 2) healthScore += 10;
      else if (followerGrowthPct > 0) healthScore += 5;
      // Consistency (10 points)
      if (postsLast30 >= 12) healthScore += 10;
      else if (postsLast30 >= 8) healthScore += 7;
      else if (postsLast30 >= 4) healthScore += 4;

      healthScore = Math.min(healthScore, 100);
      const healthStatus = daysSinceLastPost > 30 ? 'dormant'
        : healthScore >= 70 ? 'green'
        : healthScore >= 40 ? 'yellow'
        : 'red';

      // Update snapshot with computed values
      await this.supabase
        .from('sm_snapshots')
        .update({
          follower_growth: followerGrowth,
          follower_growth_pct: Math.round(followerGrowthPct * 100) / 100,
          health_score: healthScore,
          health_status: healthStatus,
        })
        .eq('id', snapshot.id);

      // Update account health score
      await this.supabase
        .from('sm_accounts')
        .update({
          health_score: healthScore,
          health_status: healthStatus,
          display_name: channel.title,
          avatar_url: channel.thumbnailUrl,
          profile_url: `https://www.youtube.com/${channel.customUrl}`,
        })
        .eq('id', account.id);

      // 7. Store video metrics
      let postsStored = 0;
      for (const video of videos) {
        const totalEngagement = video.likeCount + video.commentCount;
        const videoEngRate = video.viewCount > 0
          ? (totalEngagement / video.viewCount) * 100
          : 0;

        const { error: postError } = await this.supabase
          .from('sm_post_metrics')
          .upsert({
            institution_id: account.institution_id,
            account_id: account.id,
            platform_post_id: video.videoId,
            post_type: 'video',
            caption: video.title,
            thumbnail_url: video.thumbnailUrl,
            permalink: `https://www.youtube.com/watch?v=${video.videoId}`,
            likes_count: video.likeCount,
            comments_count: video.commentCount,
            views_count: video.viewCount,
            engagement_rate: Math.round(videoEngRate * 100) / 100,
            posted_at: video.publishedAt,
            snapshot_id: snapshot.id,
            metadata: { description: video.description.substring(0, 500) },
          }, { onConflict: 'account_id,platform_post_id' });

        if (!postError) postsStored++;
      }

      return {
        accountId: account.id,
        username: account.username,
        success: true,
        snapshotId: snapshot.id,
        postsStored,
      };

    } catch (err) {
      return {
        accountId: account.id,
        username: account.username,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Pull all YouTube accounts for an institution
   */
  async pullAllAccounts(institutionId: string): Promise<{
    results: PullResult[];
    totalProcessed: number;
    totalSucceeded: number;
    totalFailed: number;
  }> {
    // Get all YouTube accounts
    const { data: accounts, error } = await this.supabase
      .from('sm_accounts')
      .select('id, username, institution_id')
      .eq('institution_id', institutionId)
      .eq('platform', 'youtube');

    if (error) throw new Error(`Failed to fetch YouTube accounts: ${error.message}`);
    if (!accounts || accounts.length === 0) {
      return { results: [], totalProcessed: 0, totalSucceeded: 0, totalFailed: 0 };
    }

    const results: PullResult[] = [];
    for (const account of accounts) {
      // 3-second delay between requests to be respectful
      if (results.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      const result = await this.pullAccount(account);
      results.push(result);
    }

    return {
      results,
      totalProcessed: results.length,
      totalSucceeded: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length,
    };
  }
}
