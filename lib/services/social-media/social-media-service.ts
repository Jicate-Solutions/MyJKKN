/**
 * Social Media Service
 * Handles all social media account and monitoring operations
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  SmAccount,
  SmSnapshot,
  SmPostMetric,
  SmManualEntry,
  SmAccountFilters,
  SmSnapshotFilters,
  SmPostMetricFilters,
  SmAccountListResponse,
  SmSnapshotListResponse,
  SmPostMetricListResponse,
  SmDashboardOverview,
  SmAccountWithLatestSnapshot,
  SmEngagementTrend,
  CreateSmAccountDto,
  UpdateSmAccountDto,
  CreateManualEntryDto,
  SmHealthStatus,
} from '@/types/social-media';
import { computeHealthScore } from '@/types/social-media';

export class SocialMediaService {
  private static supabase = createClientSupabaseClient() as any;

  // ============================================
  // Account Operations
  // ============================================

  static async getAccounts(filters: SmAccountFilters): Promise<SmAccountListResponse> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('sm_accounts')
      .select('*', { count: 'exact' })
      .eq('institution_id', filters.institution_id)
      .order('platform', { ascending: true })
      .order('username', { ascending: true })
      .range(offset, offset + limit - 1);

    if (filters.platform) {
      query = query.eq('platform', filters.platform);
    }
    if (filters.health_status) {
      query = query.eq('health_status', filters.health_status);
    }
    if (filters.department_id) {
      query = query.eq('department_id', filters.department_id);
    }
    if (filters.is_connected !== undefined) {
      query = query.eq('is_connected', filters.is_connected);
    }
    if (filters.search) {
      const sanitized = sanitizeSearch(filters.search);
      query = query.or(`username.ilike.%${sanitized}%,display_name.ilike.%${sanitized}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  static async getAccount(id: string): Promise<SmAccount> {
    const { data, error } = await this.supabase
      .from('sm_accounts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(`Failed to fetch account: ${error.message}`);
    return data;
  }

  static async createAccount(dto: CreateSmAccountDto): Promise<SmAccount> {
    const { data: { user } } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('sm_accounts')
      .insert({
        ...dto,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create account: ${error.message}`);
    return data;
  }

  static async updateAccount(id: string, dto: UpdateSmAccountDto): Promise<SmAccount> {
    const { data, error } = await this.supabase
      .from('sm_accounts')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update account: ${error.message}`);
    return data;
  }

  static async deleteAccount(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('sm_accounts')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete account: ${error.message}`);
  }

  // ============================================
  // Snapshot Operations
  // ============================================

  static async getSnapshots(filters: SmSnapshotFilters): Promise<SmSnapshotListResponse> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('sm_snapshots')
      .select('*', { count: 'exact' })
      .order('snapshot_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.account_id) {
      query = query.eq('account_id', filters.account_id);
    }
    if (filters.start_date) {
      query = query.gte('snapshot_date', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('snapshot_date', filters.end_date);
    }
    if (filters.source) {
      query = query.eq('source', filters.source);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch snapshots: ${error.message}`);

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  // ============================================
  // Post Metrics Operations
  // ============================================

  static async getPostMetrics(filters: SmPostMetricFilters): Promise<SmPostMetricListResponse> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const sortBy = filters.sort_by || 'posted_at';
    const sortOrder = filters.sort_order === 'asc';

    let query = this.supabase
      .from('sm_post_metrics')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder })
      .range(offset, offset + limit - 1);

    if (filters.account_id) {
      query = query.eq('account_id', filters.account_id);
    }
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.post_type) {
      query = query.eq('post_type', filters.post_type);
    }
    if (filters.start_date) {
      query = query.gte('posted_at', filters.start_date);
    }
    if (filters.end_date) {
      query = query.lte('posted_at', filters.end_date);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch post metrics: ${error.message}`);

    return {
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    };
  }

  // ============================================
  // Manual Entry Operations
  // ============================================

  static async createManualEntry(dto: CreateManualEntryDto): Promise<SmManualEntry> {
    const { data: { user } } = await this.supabase.auth.getUser();

    const { data, error } = await this.supabase
      .from('sm_manual_entries')
      .insert({
        ...dto,
        entered_by: user?.id,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create manual entry: ${error.message}`);
    return data;
  }

  // ============================================
  // Dashboard Operations
  // ============================================

  static async getDashboardOverview(institutionId: string): Promise<SmDashboardOverview> {
    // Fetch all accounts for this institution
    const { data: accounts, error: accError } = await this.supabase
      .from('sm_accounts')
      .select('*')
      .eq('institution_id', institutionId);

    if (accError) throw new Error(`Failed to fetch accounts: ${accError.message}`);

    const allAccounts: SmAccount[] = accounts || [];

    // Health breakdown
    const healthBreakdown: Record<SmHealthStatus, number> = {
      green: 0, yellow: 0, red: 0, dormant: 0
    };
    allAccounts.forEach(a => {
      healthBreakdown[a.health_status]++;
    });

    // Platform breakdown
    const platformBreakdown: Record<string, number> = {};
    allAccounts.forEach(a => {
      platformBreakdown[a.platform] = (platformBreakdown[a.platform] || 0) + 1;
    });

    // Latest snapshots for follower totals and engagement
    const { data: latestSnapshots, error: snapError } = await this.supabase
      .from('sm_snapshots')
      .select('*')
      .eq('institution_id', institutionId)
      .order('snapshot_date', { ascending: false })
      .limit(100);

    if (snapError) throw new Error(`Failed to fetch snapshots: ${snapError.message}`);

    const snapshots: SmSnapshot[] = latestSnapshots || [];

    // Get unique latest per account
    const latestByAccount = new Map<string, SmSnapshot>();
    snapshots.forEach(s => {
      if (!latestByAccount.has(s.account_id)) {
        latestByAccount.set(s.account_id, s);
      }
    });

    let totalFollowers = 0;
    let totalEngagement = 0;
    let engagementCount = 0;
    latestByAccount.forEach(s => {
      totalFollowers += s.followers_count;
      if (s.engagement_rate > 0) {
        totalEngagement += Number(s.engagement_rate);
        engagementCount++;
      }
    });

    // Top posts by engagement
    const { data: topPosts, error: postsError } = await this.supabase
      .from('sm_post_metrics')
      .select('*')
      .eq('institution_id', institutionId)
      .order('engagement_rate', { ascending: false })
      .limit(10);

    if (postsError) throw new Error(`Failed to fetch top posts: ${postsError.message}`);

    return {
      totalAccounts: allAccounts.length,
      connectedAccounts: allAccounts.filter(a => a.is_connected).length,
      healthBreakdown,
      platformBreakdown: platformBreakdown as any,
      totalFollowers,
      avgEngagementRate: engagementCount > 0 ? totalEngagement / engagementCount : 0,
      topPosts: topPosts || [],
      recentSnapshots: snapshots.slice(0, 20),
    };
  }

  static async getAccountsWithSnapshots(institutionId: string): Promise<SmAccountWithLatestSnapshot[]> {
    const { data: accounts, error } = await this.supabase
      .from('sm_accounts')
      .select('*')
      .eq('institution_id', institutionId)
      .order('platform')
      .order('username');

    if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);

    // Get latest snapshot for each account
    const accountIds = (accounts || []).map((a: SmAccount) => a.id);
    if (accountIds.length === 0) return [];

    const { data: snapshots } = await this.supabase
      .from('sm_snapshots')
      .select('*')
      .in('account_id', accountIds)
      .order('snapshot_date', { ascending: false });

    const latestByAccount = new Map<string, SmSnapshot>();
    (snapshots || []).forEach((s: SmSnapshot) => {
      if (!latestByAccount.has(s.account_id)) {
        latestByAccount.set(s.account_id, s);
      }
    });

    return (accounts || []).map((account: SmAccount) => ({
      ...account,
      latest_snapshot: latestByAccount.get(account.id),
    }));
  }

  static async getEngagementTrends(
    accountId: string,
    days: number = 90
  ): Promise<SmEngagementTrend[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('sm_snapshots')
      .select('snapshot_date, engagement_rate, followers_count, posts_count')
      .eq('account_id', accountId)
      .gte('snapshot_date', startDate.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });

    if (error) throw new Error(`Failed to fetch trends: ${error.message}`);

    return (data || []).map((row: any) => ({
      date: row.snapshot_date,
      engagement_rate: Number(row.engagement_rate),
      followers_count: row.followers_count,
      posts_count: row.posts_count,
    }));
  }
}
