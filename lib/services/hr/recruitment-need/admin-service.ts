/**
 * HR Recruitment Need — Admin Service
 *
 * Static class providing CRUD for foundation tables:
 *   - hr_regulatory_bodies
 *   - hr_regulatory_norms
 *   - hr_specializations
 *   - hr_peer_benchmarks
 *   - platform_policies (weight keys only)
 *
 * Pattern: static class, SupabaseClient as first arg (matches signal-service.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRegulatoryBody,
  HRRegulatoryNorm,
  HRSpecialization,
  HRPeerBenchmark,
} from '@/types/hr-recruitment-need';

// ─── Insert / Update shapes ────────────────────────────────────────────────────

export type RegulatoryBodyInsert = Omit<HRRegulatoryBody, 'id' | 'created_at' | 'updated_at'>;
export type RegulatoryBodyUpdate = Partial<RegulatoryBodyInsert>;

export type RegulatoryNormInsert = Omit<HRRegulatoryNorm, 'id' | 'created_at' | 'updated_at'>;
export type RegulatoryNormUpdate = Partial<RegulatoryNormInsert>;

export type SpecializationInsert = Omit<HRSpecialization, 'id' | 'created_at' | 'updated_at'>;
export type SpecializationUpdate = Partial<SpecializationInsert>;

export type PeerBenchmarkInsert = Omit<HRPeerBenchmark, 'id' | 'created_at' | 'updated_at'>;
export type PeerBenchmarkUpdate = Partial<PeerBenchmarkInsert>;

export interface WeightPolicy {
  key: string;
  value: string;
  label?: string;
}

// ─── Policy key prefixes ──────────────────────────────────────────────────────

const WEIGHT_POLICY_PREFIX = 'hr_recruitment.weight_';
const THRESHOLD_POLICY_PREFIX = 'hr_recruitment.threshold_';

export interface ThresholdPolicy {
  key: string;
  value: string;
  label?: string;
}

export class RecruitmentNeedAdminService {
  // ═══════════════════════════════════════════════════════════════════════════
  // Regulatory Bodies
  // ═══════════════════════════════════════════════════════════════════════════

  static async listBodies(supabase: SupabaseClient): Promise<HRRegulatoryBody[]> {
    const { data, error } = await supabase
      .from('hr_regulatory_bodies')
      .select('*')
      .order('name');
    if (error) throw error;
    return data ?? [];
  }

  static async getBody(supabase: SupabaseClient, id: string): Promise<HRRegulatoryBody> {
    const { data, error } = await supabase
      .from('hr_regulatory_bodies')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  static async createBody(supabase: SupabaseClient, body: RegulatoryBodyInsert): Promise<HRRegulatoryBody> {
    const { data, error } = await supabase
      .from('hr_regulatory_bodies')
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async updateBody(supabase: SupabaseClient, id: string, updates: RegulatoryBodyUpdate): Promise<HRRegulatoryBody> {
    const { data, error } = await supabase
      .from('hr_regulatory_bodies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteBody(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_regulatory_bodies')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Regulatory Norms
  // ═══════════════════════════════════════════════════════════════════════════

  static async listNorms(supabase: SupabaseClient): Promise<(HRRegulatoryNorm & { body?: HRRegulatoryBody })[]> {
    const { data, error } = await supabase
      .from('hr_regulatory_norms')
      .select('*, body:hr_regulatory_bodies(*)')
      .order('program_type');
    if (error) throw error;
    return data ?? [];
  }

  static async getNorm(supabase: SupabaseClient, id: string): Promise<HRRegulatoryNorm> {
    const { data, error } = await supabase
      .from('hr_regulatory_norms')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  static async createNorm(supabase: SupabaseClient, norm: RegulatoryNormInsert): Promise<HRRegulatoryNorm> {
    const { data, error } = await supabase
      .from('hr_regulatory_norms')
      .insert(norm)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async updateNorm(supabase: SupabaseClient, id: string, updates: RegulatoryNormUpdate): Promise<HRRegulatoryNorm> {
    const { data, error } = await supabase
      .from('hr_regulatory_norms')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteNorm(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_regulatory_norms')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Specializations
  // ═══════════════════════════════════════════════════════════════════════════

  static async listSpecializations(
    supabase: SupabaseClient,
    bodyId?: string
  ): Promise<HRSpecialization[]> {
    let query = supabase
      .from('hr_specializations')
      .select('*')
      .order('name');
    if (bodyId) query = query.eq('body_id', bodyId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  static async createSpecialization(supabase: SupabaseClient, spec: SpecializationInsert): Promise<HRSpecialization> {
    const { data, error } = await supabase
      .from('hr_specializations')
      .insert(spec)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async updateSpecialization(supabase: SupabaseClient, id: string, updates: SpecializationUpdate): Promise<HRSpecialization> {
    const { data, error } = await supabase
      .from('hr_specializations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteSpecialization(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_specializations')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Peer Benchmarks
  // ═══════════════════════════════════════════════════════════════════════════

  static async listBenchmarks(supabase: SupabaseClient): Promise<HRPeerBenchmark[]> {
    const { data, error } = await supabase
      .from('hr_peer_benchmarks')
      .select('*')
      .order('institution_name');
    if (error) throw error;
    return data ?? [];
  }

  static async createBenchmark(supabase: SupabaseClient, bm: PeerBenchmarkInsert): Promise<HRPeerBenchmark> {
    const { data, error } = await supabase
      .from('hr_peer_benchmarks')
      .insert(bm)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async updateBenchmark(supabase: SupabaseClient, id: string, updates: PeerBenchmarkUpdate): Promise<HRPeerBenchmark> {
    const { data, error } = await supabase
      .from('hr_peer_benchmarks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteBenchmark(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('hr_peer_benchmarks')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Signal Weight Policies
  // ═══════════════════════════════════════════════════════════════════════════

  static async listWeightPolicies(supabase: SupabaseClient): Promise<WeightPolicy[]> {
    const { data, error } = await supabase
      .from('platform_policies')
      .select('key, value, description')
      .like('key', `${WEIGHT_POLICY_PREFIX}%`)
      .order('key');
    if (error) throw error;
    return (data ?? []).map((r: { key: string; value: string; description?: string | null }) => ({
      key: r.key,
      value: r.value,
      label: r.description ?? r.key.replace(WEIGHT_POLICY_PREFIX, ''),
    }));
  }

  static async updateWeightPolicies(
    supabase: SupabaseClient,
    weights: { key: string; value: string }[]
  ): Promise<void> {
    // Validate sum = 100
    const sum = weights.reduce((acc, w) => acc + Number(w.value), 0);
    if (sum !== 100) throw new Error(`Weight sum must equal 100, got ${sum}`);

    // Update each policy row individually (platform_policies has no bulk-upsert RPC)
    for (const w of weights) {
      const { error } = await supabase
        .from('platform_policies')
        .update({ value: w.value })
        .eq('key', w.key);
      if (error) throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Per-Input Threshold Policies
  // ═══════════════════════════════════════════════════════════════════════════

  static async listThresholdPolicies(supabase: SupabaseClient): Promise<ThresholdPolicy[]> {
    const { data, error } = await supabase
      .from('platform_policies')
      .select('key, value, description')
      .like('key', `${THRESHOLD_POLICY_PREFIX}%`)
      .order('key');
    if (error) throw error;
    return (data ?? []).map((r: { key: string; value: string; description?: string | null }) => ({
      key: r.key,
      value: r.value,
      label: r.description ?? r.key.replace(THRESHOLD_POLICY_PREFIX, ''),
    }));
  }

  static async updateThresholdPolicies(
    supabase: SupabaseClient,
    thresholds: { key: string; value: string }[]
  ): Promise<void> {
    for (const t of thresholds) {
      const numVal = Number(t.value);
      if (isNaN(numVal) || numVal < 0 || numVal > 100) {
        throw new Error(`Threshold value for ${t.key} must be between 0 and 100`);
      }
      const { error } = await supabase
        .from('platform_policies')
        .update({ value: t.value })
        .eq('key', t.key);
      if (error) throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Counts (for hub page badges)
  // ═══════════════════════════════════════════════════════════════════════════

  static async getCounts(supabase: SupabaseClient): Promise<{
    bodies: number;
    norms: number;
    specializations: number;
    benchmarks: number;
  }> {
    const [bodies, norms, specs, benchmarks] = await Promise.all([
      supabase.from('hr_regulatory_bodies').select('id', { count: 'exact', head: true }),
      supabase.from('hr_regulatory_norms').select('id', { count: 'exact', head: true }),
      supabase.from('hr_specializations').select('id', { count: 'exact', head: true }),
      supabase.from('hr_peer_benchmarks').select('id', { count: 'exact', head: true }),
    ]);
    return {
      bodies: bodies.count ?? 0,
      norms: norms.count ?? 0,
      specializations: specs.count ?? 0,
      benchmarks: benchmarks.count ?? 0,
    };
  }
}
