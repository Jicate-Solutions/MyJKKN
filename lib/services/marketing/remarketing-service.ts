// lib/services/marketing/remarketing-service.ts
// Strategic Remarketing Service
// Auto-sync lead audiences to Google Ads Customer Match and Facebook Custom Audiences

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type AdPlatform = 'google_ads' | 'facebook';
export type AudienceSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'stale';

export interface RemarketingAudienceRule {
  id: string;
  institution_id: string;
  name: string;
  platform: AdPlatform;
  // Audience definition
  stage_filter: string[];
  source_filter: string[];
  tag_filter: string[];
  score_min: number | null;
  score_max: number | null;
  exclude_enrolled: boolean;
  exclude_declined: boolean;
  // Platform-specific IDs
  google_audience_id: string | null;
  facebook_audience_id: string | null;
  // Sync state
  sync_status: AudienceSyncStatus;
  last_synced_at: string | null;
  audience_size: number;
  sync_error: string | null;
  // Settings
  is_enabled: boolean;
  sync_frequency_hours: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAudienceRuleInput {
  institution_id: string;
  name: string;
  platform: AdPlatform;
  stage_filter?: string[];
  source_filter?: string[];
  tag_filter?: string[];
  score_min?: number;
  score_max?: number;
  exclude_enrolled?: boolean;
  exclude_declined?: boolean;
  sync_frequency_hours?: number;
}

export interface UpdateAudienceRuleInput {
  name?: string;
  stage_filter?: string[];
  source_filter?: string[];
  tag_filter?: string[];
  score_min?: number | null;
  score_max?: number | null;
  exclude_enrolled?: boolean;
  exclude_declined?: boolean;
  is_enabled?: boolean;
  sync_frequency_hours?: number;
}

export interface AudienceRuleFilters {
  institutionId: string;
  platform?: AdPlatform;
  isEnabled?: boolean;
  syncStatus?: AudienceSyncStatus;
}

export interface SyncResult {
  success: boolean;
  audience_size: number;
  added: number;
  removed: number;
  error?: string;
}

export interface AdAccountStatus {
  platform: AdPlatform;
  connected: boolean;
  account_id: string | null;
  account_name: string | null;
  last_verified_at: string | null;
}

export interface SyncHistoryEntry {
  id: string;
  rule_id: string;
  platform: AdPlatform;
  audience_size: number;
  added: number;
  removed: number;
  status: 'success' | 'failed';
  error: string | null;
  duration_ms: number;
  created_at: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class RemarketingService {
  private static supabase = createClientSupabaseClient();

  // ============================================================================
  // AUDIENCE RULES CRUD
  // ============================================================================

  /**
   * Get audience rules
   */
  static async getAudienceRules(filters: AudienceRuleFilters): Promise<RemarketingAudienceRule[]> {
    let query = (this.supabase as any)
      .from('remarketing_audience_rules')
      .select('*')
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.platform) query = query.eq('platform', filters.platform);
    if (filters.isEnabled !== undefined) query = query.eq('is_enabled', filters.isEnabled);
    if (filters.syncStatus) query = query.eq('sync_status', filters.syncStatus);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch audience rules: ${error.message}`);
    return (data || []) as RemarketingAudienceRule[];
  }

  /**
   * Get a single audience rule
   */
  static async getAudienceRule(id: string): Promise<RemarketingAudienceRule | null> {
    const { data, error } = await (this.supabase as any)
      .from('remarketing_audience_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch audience rule: ${error.message}`);
    }
    return data as RemarketingAudienceRule;
  }

  /**
   * Create an audience rule
   */
  static async createAudienceRule(input: CreateAudienceRuleInput): Promise<RemarketingAudienceRule> {
    const { data, error } = await (this.supabase as any)
      .from('remarketing_audience_rules')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        platform: input.platform,
        stage_filter: input.stage_filter || [],
        source_filter: input.source_filter || [],
        tag_filter: input.tag_filter || [],
        score_min: input.score_min ?? null,
        score_max: input.score_max ?? null,
        exclude_enrolled: input.exclude_enrolled ?? true,
        exclude_declined: input.exclude_declined ?? true,
        is_enabled: false,
        sync_status: 'pending',
        audience_size: 0,
        sync_frequency_hours: input.sync_frequency_hours ?? 24,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create audience rule: ${error.message}`);
    return data as RemarketingAudienceRule;
  }

  /**
   * Update an audience rule
   */
  static async updateAudienceRule(id: string, input: UpdateAudienceRuleInput): Promise<RemarketingAudienceRule> {
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.stage_filter !== undefined) updateData.stage_filter = input.stage_filter;
    if (input.source_filter !== undefined) updateData.source_filter = input.source_filter;
    if (input.tag_filter !== undefined) updateData.tag_filter = input.tag_filter;
    if (input.score_min !== undefined) updateData.score_min = input.score_min;
    if (input.score_max !== undefined) updateData.score_max = input.score_max;
    if (input.exclude_enrolled !== undefined) updateData.exclude_enrolled = input.exclude_enrolled;
    if (input.exclude_declined !== undefined) updateData.exclude_declined = input.exclude_declined;
    if (input.is_enabled !== undefined) updateData.is_enabled = input.is_enabled;
    if (input.sync_frequency_hours !== undefined) updateData.sync_frequency_hours = input.sync_frequency_hours;

    const { data, error } = await (this.supabase as any)
      .from('remarketing_audience_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update audience rule: ${error.message}`);
    return data as RemarketingAudienceRule;
  }

  /**
   * Delete an audience rule
   */
  static async deleteAudienceRule(id: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('remarketing_audience_rules')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete audience rule: ${error.message}`);
  }

  // ============================================================================
  // AUDIENCE SYNC
  // ============================================================================

  /**
   * Sync an audience rule to the ad platform
   */
  static async syncAudience(ruleId: string): Promise<SyncResult> {
    const rule = await this.getAudienceRule(ruleId);
    if (!rule) throw new Error('Audience rule not found');

    const startTime = Date.now();

    // Update status to syncing
    await (this.supabase as any)
      .from('remarketing_audience_rules')
      .update({ sync_status: 'syncing' })
      .eq('id', ruleId);

    try {
      // Get matching leads
      const leads = await this.getMatchingLeads(rule);

      // Extract contact data
      const contacts = leads.map((lead: any) => ({
        email: lead.email,
        phone: lead.phone || lead.mobile,
        name: lead.full_name,
      })).filter((c: any) => c.email || c.phone);

      let result: SyncResult;

      if (rule.platform === 'google_ads') {
        result = await this.syncToGoogleAds(rule, contacts);
      } else {
        result = await this.syncToFacebookAds(rule, contacts);
      }

      const duration = Date.now() - startTime;

      // Update rule status
      await (this.supabase as any)
        .from('remarketing_audience_rules')
        .update({
          sync_status: result.success ? 'synced' : 'failed',
          last_synced_at: new Date().toISOString(),
          audience_size: result.audience_size,
          sync_error: result.error || null,
        })
        .eq('id', ruleId);

      // Log sync history
      await (this.supabase as any)
        .from('remarketing_sync_history')
        .insert({
          rule_id: ruleId,
          platform: rule.platform,
          audience_size: result.audience_size,
          added: result.added,
          removed: result.removed,
          status: result.success ? 'success' : 'failed',
          error: result.error || null,
          duration_ms: duration,
        });

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      await (this.supabase as any)
        .from('remarketing_audience_rules')
        .update({
          sync_status: 'failed',
          sync_error: errorMsg,
        })
        .eq('id', ruleId);

      return { success: false, audience_size: 0, added: 0, removed: 0, error: errorMsg };
    }
  }

  /**
   * Sync leads to Google Ads Customer Match
   */
  private static async syncToGoogleAds(
    rule: RemarketingAudienceRule,
    contacts: Array<{ email: string; phone: string; name: string }>
  ): Promise<SyncResult> {
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

    if (!customerId || !developerToken || !refreshToken) {
      return { success: false, audience_size: 0, added: 0, removed: 0, error: 'Google Ads API not configured' };
    }

    try {
      // Hash user data per Google's requirements (SHA-256)
      const hashedUsers = (await Promise.all(contacts.map(async c => ({
        hashedEmail: c.email ? await this.sha256Hash(c.email.toLowerCase().trim()) : undefined,
        hashedPhone: c.phone ? await this.sha256Hash(c.phone.replace(/[^0-9+]/g, '')) : undefined,
      })))).filter(u => u.hashedEmail || u.hashedPhone);

      // If no audience ID exists yet, create one
      let audienceId = rule.google_audience_id;
      if (!audienceId) {
        // Create user list via Google Ads API
        const createResponse = await fetch(
          `https://googleads.googleapis.com/v17/customers/${customerId}/userLists:mutate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${refreshToken}`,
              'developer-token': developerToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              operations: [{
                create: {
                  name: `MyJKKN - ${rule.name}`,
                  description: `Auto-synced from MyJKKN Admission CRM`,
                  membershipLifeSpan: 30,
                  crmBasedUserList: {
                    uploadKeyType: 'CONTACT_INFO',
                    dataSourceType: 'FIRST_PARTY',
                  },
                },
              }],
            }),
          }
        );

        if (createResponse.ok) {
          const createData = await createResponse.json();
          audienceId = createData.results?.[0]?.resourceName;

          // Save audience ID
          await (this.supabase as any)
            .from('remarketing_audience_rules')
            .update({ google_audience_id: audienceId })
            .eq('id', rule.id);
        }
      }

      // Upload user data
      if (audienceId) {
        const offlineResponse = await fetch(
          `https://googleads.googleapis.com/v17/customers/${customerId}/offlineUserDataJobs:create`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${refreshToken}`,
              'developer-token': developerToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'CUSTOMER_MATCH_USER_LIST',
              customerMatchUserListMetadata: {
                userList: audienceId,
              },
            }),
          }
        );

        if (!offlineResponse.ok) {
          const errData = await offlineResponse.json();
          return {
            success: false,
            audience_size: contacts.length,
            added: 0,
            removed: 0,
            error: `Google Ads API error: ${JSON.stringify(errData.error?.message || errData)}`,
          };
        }
      }

      return {
        success: true,
        audience_size: contacts.length,
        added: contacts.length,
        removed: 0,
      };
    } catch (err) {
      return {
        success: false,
        audience_size: 0,
        added: 0,
        removed: 0,
        error: err instanceof Error ? err.message : 'Google Ads sync failed',
      };
    }
  }

  /**
   * Sync leads to Facebook Custom Audiences
   */
  private static async syncToFacebookAds(
    rule: RemarketingAudienceRule,
    contacts: Array<{ email: string; phone: string; name: string }>
  ): Promise<SyncResult> {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;

    if (!adAccountId || !accessToken) {
      return { success: false, audience_size: 0, added: 0, removed: 0, error: 'Facebook Marketing API not configured' };
    }

    try {
      // Create or update custom audience
      let audienceId = rule.facebook_audience_id;

      if (!audienceId) {
        const createResponse = await fetch(
          `https://graph.facebook.com/v21.0/${adAccountId}/customaudiences`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: accessToken,
              name: `MyJKKN - ${rule.name}`,
              subtype: 'CUSTOM',
              description: 'Auto-synced from MyJKKN Admission CRM',
              customer_file_source: 'USER_PROVIDED_ONLY',
            }),
          }
        );

        if (createResponse.ok) {
          const createData = await createResponse.json();
          audienceId = createData.id;

          await (this.supabase as any)
            .from('remarketing_audience_rules')
            .update({ facebook_audience_id: audienceId })
            .eq('id', rule.id);
        }
      }

      if (audienceId) {
        // Hash and upload users
        const schema = ['EMAIL', 'PHONE', 'FN'];
        const dataRows = await Promise.all(
          contacts.map(async c => [
            c.email ? await this.sha256Hash(c.email.toLowerCase().trim()) : '',
            c.phone ? await this.sha256Hash(c.phone.replace(/[^0-9+]/g, '')) : '',
            c.name ? await this.sha256Hash(c.name.toLowerCase().trim()) : '',
          ])
        );

        // Upload in batches of 10000
        for (let i = 0; i < dataRows.length; i += 10000) {
          const batch = dataRows.slice(i, i + 10000);
          await fetch(
            `https://graph.facebook.com/v21.0/${audienceId}/users`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                access_token: accessToken,
                payload: {
                  schema,
                  data: batch,
                },
              }),
            }
          );
        }
      }

      return {
        success: true,
        audience_size: contacts.length,
        added: contacts.length,
        removed: 0,
      };
    } catch (err) {
      return {
        success: false,
        audience_size: 0,
        added: 0,
        removed: 0,
        error: err instanceof Error ? err.message : 'Facebook sync failed',
      };
    }
  }

  // ============================================================================
  // AD ACCOUNT STATUS
  // ============================================================================

  /**
   * Check ad account connection status
   */
  static async getAdAccountStatus(): Promise<AdAccountStatus[]> {
    const statuses: AdAccountStatus[] = [];

    // Google Ads
    const googleConfigured = !!(
      process.env.GOOGLE_ADS_CUSTOMER_ID &&
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN
    );
    statuses.push({
      platform: 'google_ads',
      connected: googleConfigured,
      account_id: process.env.GOOGLE_ADS_CUSTOMER_ID || null,
      account_name: googleConfigured ? 'Google Ads' : null,
      last_verified_at: null,
    });

    // Facebook
    const facebookConfigured = !!(
      process.env.FACEBOOK_AD_ACCOUNT_ID &&
      process.env.FACEBOOK_ACCESS_TOKEN
    );
    statuses.push({
      platform: 'facebook',
      connected: facebookConfigured,
      account_id: process.env.FACEBOOK_AD_ACCOUNT_ID || null,
      account_name: facebookConfigured ? 'Facebook Ads' : null,
      last_verified_at: null,
    });

    return statuses;
  }

  // ============================================================================
  // SYNC HISTORY
  // ============================================================================

  /**
   * Get sync history for a rule
   */
  static async getSyncHistory(ruleId: string, limit = 20): Promise<SyncHistoryEntry[]> {
    const { data, error } = await (this.supabase as any)
      .from('remarketing_sync_history')
      .select('*')
      .eq('rule_id', ruleId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch sync history: ${error.message}`);
    return (data || []) as SyncHistoryEntry[];
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get leads matching rule filters
   */
  private static async getMatchingLeads(rule: RemarketingAudienceRule): Promise<any[]> {
    let query = (this.supabase as any)
      .from('admission_leads')
      .select('id, email, phone, mobile, full_name')
      .eq('institution_id', rule.institution_id);

    if (rule.stage_filter && rule.stage_filter.length > 0) {
      query = query.in('stage', rule.stage_filter);
    }
    if (rule.source_filter && rule.source_filter.length > 0) {
      query = query.in('source', rule.source_filter);
    }
    if (rule.exclude_enrolled) {
      query = query.neq('stage', 'enrolled');
    }
    if (rule.exclude_declined) {
      query = query.neq('stage', 'declined');
    }
    if (rule.score_min) {
      query = query.gte('score', rule.score_min);
    }
    if (rule.score_max) {
      query = query.lte('score', rule.score_max);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch matching leads: ${error.message}`);
    return data || [];
  }

  /**
   * SHA-256 hash for PII data (required by Google/Facebook APIs)
   */
  private static async sha256Hash(value: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(value);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for server-side
    const { createHash } = await import('crypto');
    return createHash('sha256').update(value).digest('hex');
  }
}
