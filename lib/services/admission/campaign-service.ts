import { createClientSupabaseClient } from '@/lib/supabase/client';
import { generateCampaignToken } from '@/lib/utils/nanoid';
import type {
  Campaign,
  CampaignLink,
  CampaignFilters,
  CreateCampaignInput,
  UpdateCampaignInput,
  CreateLinkInput,
  UpdateLinkInput,
  AttributionMode,
  ChartGranularity,
  CampaignFunnel,
  TimeSeriesPoint,
  CampaignCompareRow,
  OverviewStats,
} from '@/types/admission/campaign';

export class CampaignService {
  private static client() {
    return createClientSupabaseClient();
  }

  // ─── Campaigns CRUD ───────────────────────────────────────
  static async list(filters?: CampaignFilters): Promise<Campaign[]> {
    let q = this.client().from('admission_campaigns').select('*');
    if (!filters?.includeArchived) q = q.is('archived_at', null);
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.source) q = q.eq('source', filters.source);
    if (filters?.search) q = q.ilike('name', `%${filters.search}%`);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Campaign[];
  }

  static async get(id: string): Promise<Campaign> {
    const { data, error } = await this.client()
      .from('admission_campaigns')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Campaign;
  }

  static async create(input: CreateCampaignInput): Promise<Campaign> {
    const slug = input.slug ?? this.autoSlug(input.name);
    const scope: 'institution' | 'global' =
      input.scope ?? (input.institution_id ? 'institution' : 'global');
    if (scope === 'institution' && !input.institution_id) {
      throw new Error('institution_id is required for institution-scope campaigns');
    }
    if (scope === 'global' && input.institution_id) {
      throw new Error('Global campaigns must not specify an institution_id');
    }

    // Enforce the category contract client-side BEFORE hitting the DB,
    // so users get a friendly error instead of a Postgres CHECK violation.
    const category = input.category ?? 'admission';
    const programId = category === 'admission' ? input.program_id ?? null : null;
    const admissionYearId =
      category === 'admission' ? input.admission_year_id ?? null : null;

    const { data, error } = await this.client()
      .from('admission_campaigns')
      .insert({
        ...input,
        institution_id: scope === 'global' ? null : input.institution_id,
        scope,
        category,
        program_id: programId,
        admission_year_id: admissionYearId,
        slug,
        status: 'draft',
      })
      .select()
      .single();
    if (error) throw error;
    return data as Campaign;
  }

  static async update(id: string, patch: UpdateCampaignInput): Promise<Campaign> {
    // If category is being changed (or is in the patch alongside
    // program/admission_year), enforce the same contract as create():
    // program_id and admission_year_id are only valid when category='admission'.
    // For any other category, force them to NULL so the DB CHECK doesn't reject.
    const next: UpdateCampaignInput & Record<string, unknown> = { ...patch };
    if (next.category !== undefined && next.category !== 'admission') {
      next.program_id = null;
      next.admission_year_id = null;
    }
    const { data, error } = await this.client()
      .from('admission_campaigns')
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Campaign;
  }

  static async pause(id: string) {
    return this.update(id, { status: 'paused' });
  }

  static async resume(id: string) {
    return this.update(id, { status: 'active' });
  }

  static async archive(id: string): Promise<Campaign> {
    const { data, error } = await this.client()
      .from('admission_campaigns')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Campaign;
  }

  private static autoSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);
  }

  // ─── Links CRUD ───────────────────────────────────────────
  static async listLinks(campaignId: string): Promise<CampaignLink[]> {
    const { data, error } = await this.client()
      .from('admission_campaign_links')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CampaignLink[];
  }

  static async getLinkByToken(token: string): Promise<CampaignLink | null> {
    const { data, error } = await this.client()
      .from('admission_campaign_links')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as CampaignLink | null;
  }

  static async createLink(
    campaignId: string,
    input: CreateLinkInput,
  ): Promise<CampaignLink> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = generateCampaignToken();
      const { data, error } = await this.client()
        .from('admission_campaign_links')
        .insert({ campaign_id: campaignId, token, ...input })
        .select()
        .single();
      if (!error) return data as CampaignLink;
      if ((error as { code?: string }).code !== '23505') throw error;
    }
    throw new Error('Failed to generate unique campaign token after 3 attempts');
  }

  static async updateLink(
    linkId: string,
    patch: UpdateLinkInput,
  ): Promise<CampaignLink> {
    const { data, error } = await this.client()
      .from('admission_campaign_links')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', linkId)
      .select()
      .single();
    if (error) throw error;
    return data as CampaignLink;
  }

  static async deactivateLink(linkId: string): Promise<CampaignLink> {
    return this.updateLink(linkId, { is_active: false });
  }

  // ─── Analytics (RPC wrappers) ─────────────────────────────
  static async getFunnel(
    campaignId: string,
    mode: AttributionMode = 'first',
    range?: { from: Date; to: Date },
  ): Promise<CampaignFunnel> {
    const { data, error } = await this.client().rpc('get_campaign_funnel', {
      p_campaign_id: campaignId,
      p_attribution_mode: mode,
      p_start_date: range?.from.toISOString() ?? null,
      p_end_date: range?.to.toISOString() ?? null,
    });
    if (error) throw error;
    return data as CampaignFunnel;
  }

  static async getTimeSeries(
    campaignId: string,
    mode: AttributionMode,
    granularity: ChartGranularity,
    range: { from: Date; to: Date },
  ): Promise<TimeSeriesPoint[]> {
    const { data, error } = await this.client().rpc('get_campaign_time_series', {
      p_campaign_id: campaignId,
      p_attribution_mode: mode,
      p_granularity: granularity,
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
    });
    if (error) throw error;
    return (data ?? []) as TimeSeriesPoint[];
  }

  static async compare(
    campaignIds: string[],
    mode: AttributionMode = 'first',
    range?: { from: Date; to: Date },
  ): Promise<CampaignCompareRow[]> {
    if (campaignIds.length === 0) return [];
    if (campaignIds.length > 5) {
      throw new Error('Compare supports max 5 campaigns');
    }
    const { data, error } = await this.client().rpc('get_campaigns_compare', {
      p_campaign_ids: campaignIds,
      p_attribution_mode: mode,
      p_start_date: range?.from.toISOString() ?? null,
      p_end_date: range?.to.toISOString() ?? null,
    });
    if (error) throw error;
    return (data ?? []) as CampaignCompareRow[];
  }

  static async getOverviewStats(range?: {
    from: Date;
    to: Date;
  }): Promise<OverviewStats> {
    const { data, error } = await this.client().rpc(
      'get_campaigns_overview_stats',
      {
        p_start_date: range?.from.toISOString() ?? null,
        p_end_date: range?.to.toISOString() ?? null,
      },
    );
    if (error) throw error;
    return data as OverviewStats;
  }
}
