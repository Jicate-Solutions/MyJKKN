// lib/services/marketing/remarketing-service.ts
// Meta Custom Audiences remarketing service.
//
// Replaces the prior 99-line stub. All public type names and field shapes
// preserved — they're the API contract consumed by
// `app/api/admission/remarketing/route.ts`. Anything callers can construct
// from the old types must keep working.
//
// Storage: `meta_audience_rules` + `meta_audience_sync_history` (migration
// 20260704000000_meta_custom_audiences.sql).
//
// Boundary to Meta: `lib/meta/custom-audiences-client.ts`. PII is SHA-256
// hashed at that boundary; this file only ever hands raw PII to the client,
// never to the network.
//
// Sync execution (the one operation that crosses out to Meta) is server-only
// and uses the service-role client + the long-lived META_ACCESS_TOKEN env
// var. `syncAudience` will throw / return a failed SyncResult if invoked
// without that env var.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  createAudience,
  addUsersToAudience,
  type MetaAudienceCallConfig,
} from '@/lib/meta/custom-audiences-client';
import type { RawUserPayload } from '@/lib/meta/audience-hash';

// ---------------------------------------------------------------------------
// Public types (API contract — DO NOT rename)
// ---------------------------------------------------------------------------

export type AdPlatform = 'facebook' | 'google' | 'instagram' | 'linkedin';
export type AudienceSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface AudienceRuleFilters {
  institutionId: string;
  platform?: AdPlatform;
  isEnabled?: boolean;
  syncStatus?: AudienceSyncStatus;
}

export interface AudienceRule {
  id: string;
  institution_id: string;
  name: string;
  platform: AdPlatform;
  is_enabled: boolean;
  sync_status: AudienceSyncStatus;
  audience_size: number;
  criteria: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateAudienceRuleInput {
  institution_id: string;
  name: string;
  platform: AdPlatform;
  criteria: Record<string, unknown>;
  ad_account_id?: string;
}

export interface UpdateAudienceRuleInput {
  name?: string;
  platform?: AdPlatform;
  is_enabled?: boolean;
  criteria?: Record<string, unknown>;
  ad_account_id?: string;
}

export interface SyncResult {
  success: boolean;
  audience_size?: number;
  error?: string;
}

export interface AdAccountStatus {
  platform: AdPlatform;
  account_id: string;
  is_connected: boolean;
  last_synced_at: string | null;
}

export interface SyncHistoryEntry {
  id: string;
  rule_id: string;
  status: AudienceSyncStatus;
  audience_size: number;
  synced_at: string;
  error_message: string | null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type DbAudienceRule = {
  id: string;
  institution_id: string;
  name: string;
  platform: string;
  ad_account_id: string;
  criteria: Record<string, unknown> | null;
  audience_size: number;
  sync_status: string;
  meta_audience_id: string | null;
  last_synced_at: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

function rowToAudienceRule(row: DbAudienceRule): AudienceRule {
  return {
    id: row.id,
    institution_id: row.institution_id,
    name: row.name,
    platform: row.platform as AdPlatform,
    is_enabled: row.is_enabled,
    sync_status: (row.sync_status || 'pending') as AudienceSyncStatus,
    audience_size: row.audience_size ?? 0,
    criteria: row.criteria ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const RULE_COLUMNS =
  'id, institution_id, name, platform, ad_account_id, criteria, audience_size, sync_status, meta_audience_id, last_synced_at, is_enabled, created_at, updated_at';

// The Supabase typed client doesn't know about meta_audience_* tables yet
// (database.types.ts is generated from the live schema; these tables landed
// in this PR's migration). We narrow to `any` at the .from() boundary so
// the new tables are usable without touching the generated types. Drop the
// cast once codegen catches up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any;
function untyped(c: unknown): UntypedClient {
  return c as UntypedClient;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RemarketingService {
  // Lazily-instantiated browser client. The server-only `syncAudience` path
  // builds its own service-role client.
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // -------------------------------------------------------------------------
  // getAudienceRules
  // -------------------------------------------------------------------------
  static async getAudienceRules(
    filters: AudienceRuleFilters
  ): Promise<AudienceRule[]> {
    const supabase = this.supabase;
    let q = untyped(supabase)
      .from('meta_audience_rules')
      .select(RULE_COLUMNS)
      .eq('institution_id', filters.institutionId)
      .order('created_at', { ascending: false });

    if (filters.platform) q = q.eq('platform', filters.platform);
    if (typeof filters.isEnabled === 'boolean') {
      q = q.eq('is_enabled', filters.isEnabled);
    }
    if (filters.syncStatus) q = q.eq('sync_status', filters.syncStatus);

    const { data, error } = await q;
    if (error) {
      throw new Error(`getAudienceRules: ${error.message}`);
    }
    return ((data ?? []) as unknown as DbAudienceRule[]).map(rowToAudienceRule);
  }

  // -------------------------------------------------------------------------
  // createAudienceRule
  // -------------------------------------------------------------------------
  static async createAudienceRule(
    input: CreateAudienceRuleInput
  ): Promise<AudienceRule> {
    if (input.platform === 'google' || input.platform === 'linkedin') {
      throw new Error(
        `createAudienceRule: platform '${input.platform}' not supported (Meta-only in v1)`
      );
    }
    const supabase = this.supabase;
    const { data, error } = await untyped(supabase)
      .from('meta_audience_rules')
      .insert({
        institution_id: input.institution_id,
        name: input.name,
        platform: input.platform,
        ad_account_id: input.ad_account_id ?? '',
        criteria: input.criteria ?? {},
        sync_status: 'pending',
        audience_size: 0,
        is_enabled: true,
      })
      .select(RULE_COLUMNS)
      .single();

    if (error) {
      throw new Error(`createAudienceRule: ${error.message}`);
    }
    return rowToAudienceRule(data as unknown as DbAudienceRule);
  }

  // -------------------------------------------------------------------------
  // updateAudienceRule
  // -------------------------------------------------------------------------
  static async updateAudienceRule(
    id: string,
    patch: UpdateAudienceRuleInput
  ): Promise<AudienceRule> {
    const supabase = this.supabase;
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.platform !== undefined) update.platform = patch.platform;
    if (patch.is_enabled !== undefined) update.is_enabled = patch.is_enabled;
    if (patch.criteria !== undefined) update.criteria = patch.criteria;
    if (patch.ad_account_id !== undefined) {
      update.ad_account_id = patch.ad_account_id;
    }

    const { data, error } = await untyped(supabase)
      .from('meta_audience_rules')
      .update(update)
      .eq('id', id)
      .select(RULE_COLUMNS)
      .single();

    if (error) {
      throw new Error(`updateAudienceRule: ${error.message}`);
    }
    return rowToAudienceRule(data as unknown as DbAudienceRule);
  }

  // -------------------------------------------------------------------------
  // deleteAudienceRule
  // -------------------------------------------------------------------------
  static async deleteAudienceRule(id: string): Promise<void> {
    const supabase = this.supabase;
    const { error } = await untyped(supabase)
      .from('meta_audience_rules')
      .delete()
      .eq('id', id);
    if (error) {
      throw new Error(`deleteAudienceRule: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // syncAudience  (server-only path — uses service role + META_ACCESS_TOKEN)
  // -------------------------------------------------------------------------
  /**
   * Resolve the audience criteria into a user list, hand raw rows to the
   * Meta client (which hashes at the boundary), and write a sync_history row.
   * The history row is written even on failure so the admin UI can show
   * "last sync failed because…".
   */
  static async syncAudience(ruleId: string): Promise<SyncResult> {
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return {
        success: false,
        error:
          'META_ACCESS_TOKEN not configured. Set it before calling syncAudience.',
      };
    }

    // Service-role client — bypasses RLS for the audit log INSERT.
    const supabase = createServiceRoleClient();

    // 1. Load rule.
    const ruleResp = await untyped(supabase)
      .from('meta_audience_rules')
      .select(RULE_COLUMNS)
      .eq('id', ruleId)
      .single();
    if (ruleResp.error || !ruleResp.data) {
      return {
        success: false,
        error: `syncAudience: rule ${ruleId} not found`,
      };
    }
    const rule = ruleResp.data as unknown as DbAudienceRule;

    // 2. Open history row.
    const historyInsert = await untyped(supabase)
      .from('meta_audience_sync_history')
      .insert({
        rule_id: rule.id,
        batch_size: 0,
        status: 'syncing',
      })
      .select('id')
      .single();
    const historyId =
      (historyInsert.data as { id: string } | null)?.id ?? undefined;

    // 3. Flip rule to syncing.
    await untyped(supabase)
      .from('meta_audience_rules')
      .update({ sync_status: 'syncing' })
      .eq('id', rule.id);

    try {
      // 4. Resolve criteria → raw user payloads.
      const users = await resolveCriteriaToUsers(rule, supabase);

      // 5. Ensure Meta-side audience exists; create on first sync.
      const config: MetaAudienceCallConfig = { accessToken };
      let metaAudienceId = rule.meta_audience_id ?? null;
      if (!metaAudienceId) {
        const created = await createAudience(
          rule.ad_account_id,
          {
            name: rule.name,
            description: `MyJKKN sync — institution ${rule.institution_id}`,
          },
          config
        );
        metaAudienceId = created.id;
        await untyped(supabase)
          .from('meta_audience_rules')
          .update({ meta_audience_id: metaAudienceId })
          .eq('id', rule.id);
      }

      // 6. Push users to Meta. The client hashes at the boundary.
      const pushResult = await addUsersToAudience(metaAudienceId, users, config);

      const syncedSize = pushResult.num_received;

      // 7. Mark rule synced + write history.
      await untyped(supabase)
        .from('meta_audience_rules')
        .update({
          sync_status: 'synced',
          audience_size: syncedSize,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', rule.id);

      if (historyId) {
        await untyped(supabase)
          .from('meta_audience_sync_history')
          .update({
            batch_size: users.length,
            num_received: pushResult.num_received,
            num_invalid: pushResult.num_invalid_entries,
            num_skipped: pushResult.num_skipped_no_match_key,
            status: 'synced',
            finished_at: new Date().toISOString(),
          })
          .eq('id', historyId);
      }

      return { success: true, audience_size: syncedSize };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'syncAudience: unknown error';

      await untyped(supabase)
        .from('meta_audience_rules')
        .update({ sync_status: 'failed' })
        .eq('id', rule.id);

      if (historyId) {
        await untyped(supabase)
          .from('meta_audience_sync_history')
          .update({
            status: 'failed',
            error: message,
            finished_at: new Date().toISOString(),
          })
          .eq('id', historyId);
      }

      return { success: false, error: message };
    }
  }

  // -------------------------------------------------------------------------
  // getAdAccountStatus — derive from rules table
  // -------------------------------------------------------------------------
  static async getAdAccountStatus(): Promise<AdAccountStatus[]> {
    const supabase = this.supabase;
    const { data, error } = await untyped(supabase)
      .from('meta_audience_rules')
      .select('platform, ad_account_id, last_synced_at, meta_audience_id');

    if (error) {
      throw new Error(`getAdAccountStatus: ${error.message}`);
    }

    type Row = {
      platform: string;
      ad_account_id: string;
      last_synced_at: string | null;
      meta_audience_id: string | null;
    };

    const seen = new Map<string, AdAccountStatus>();
    for (const r of ((data ?? []) as unknown as Row[])) {
      const key = `${r.platform}|${r.ad_account_id}`;
      const existing = seen.get(key);
      const candidate: AdAccountStatus = {
        platform: r.platform as AdPlatform,
        account_id: r.ad_account_id,
        is_connected: Boolean(r.meta_audience_id),
        last_synced_at: r.last_synced_at,
      };
      if (!existing) {
        seen.set(key, candidate);
        continue;
      }
      const mergedConnected = existing.is_connected || candidate.is_connected;
      const mergedLast =
        candidate.last_synced_at &&
        (!existing.last_synced_at ||
          candidate.last_synced_at > existing.last_synced_at)
          ? candidate.last_synced_at
          : existing.last_synced_at;
      seen.set(key, {
        platform: existing.platform,
        account_id: existing.account_id,
        is_connected: mergedConnected,
        last_synced_at: mergedLast,
      });
    }

    return Array.from(seen.values());
  }

  // -------------------------------------------------------------------------
  // getSyncHistory
  // -------------------------------------------------------------------------
  static async getSyncHistory(
    ruleId: string,
    limit = 20
  ): Promise<SyncHistoryEntry[]> {
    const supabase = this.supabase;
    const { data, error } = await untyped(supabase)
      .from('meta_audience_sync_history')
      .select('id, rule_id, status, num_received, error, started_at, finished_at')
      .eq('rule_id', ruleId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`getSyncHistory: ${error.message}`);
    }

    type Row = {
      id: string;
      rule_id: string;
      status: string;
      num_received: number;
      error: string | null;
      started_at: string;
      finished_at: string | null;
    };

    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      rule_id: r.rule_id,
      status: (r.status || 'pending') as AudienceSyncStatus,
      audience_size: r.num_received ?? 0,
      synced_at: r.finished_at ?? r.started_at,
      error_message: r.error,
    }));
  }
}

// ---------------------------------------------------------------------------
// Criteria → users resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a rule's criteria.filters JSON into a list of raw user payloads
 * (the client then SHA-256 hashes them before sending to Meta).
 *
 * v1 supported sources (extensible via criteria.source field):
 *   - 'admission_leads': pulls from public.admission_leads scoped by
 *     institution_id (+ optional lifecycle_status filter).
 *
 * Unknown sources return [] — sync still runs (and lands an empty push, so
 * the audit row records "0 received" instead of an opaque error).
 */
async function resolveCriteriaToUsers(
  rule: DbAudienceRule,
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<RawUserPayload[]> {
  const criteria = (rule.criteria ?? {}) as {
    source?: string;
    filters?: Record<string, unknown>;
  };
  const source = criteria.source ?? 'admission_leads';
  const filters = criteria.filters ?? {};

  if (source === 'admission_leads') {
    let q = supabase
      .from('admission_leads')
      .select('email, phone, first_name, last_name')
      .eq('institution_id', rule.institution_id)
      .limit(10000);

    const status = filters.status;
    if (typeof status === 'string') {
      q = q.eq('lifecycle_status', status);
    }

    const { data, error } = await q;
    if (error) {
      throw new Error(
        `resolveCriteriaToUsers(admission_leads): ${error.message}`
      );
    }

    type LeadRow = {
      email: string | null;
      phone: string | null;
      first_name: string | null;
      last_name: string | null;
    };

    return ((data ?? []) as unknown as LeadRow[]).map((r) => ({
      email: r.email,
      phone: r.phone,
      firstName: r.first_name,
      lastName: r.last_name,
    }));
  }

  // Unknown source — return empty. Logged via num_skipped=0, num_received=0.
  return [];
}
