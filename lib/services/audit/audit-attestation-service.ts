// Audit Attestation Service — per-parameter sign-off with cosign enforcement
// Thrash T9: CAO + CEO required for NAAC/NBA (DB CHECK constraint backstops this)
// Thrash T3: optimistic lock via expected_updated_at

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  AuditAttestation,
  CosignAttestationDto,
  CosignersMap,
  SignAttestationDto,
} from '@/lib/types/audit';

export class AuditAttestationService {
  private static supabase = createClientSupabaseClient();

  static async list(cycleId: string): Promise<AuditAttestation[]> {
    const { data, error } = await (this.supabase as any)
      .from('audit_attestations')
      .select('*')
      .eq('audit_cycle_id', cycleId)
      .order('parameter_code', { ascending: true });
    if (error) throw error;
    return (data ?? []) as AuditAttestation[];
  }

  static async get(
    cycleId: string,
    parameterCode: string,
    institutionId: string
  ): Promise<AuditAttestation | null> {
    const { data, error } = await (this.supabase as any)
      .from('audit_attestations')
      .select('*')
      .eq('audit_cycle_id', cycleId)
      .eq('parameter_code', parameterCode)
      .eq('institution_id', institutionId)
      .maybeSingle();
    if (error) throw error;
    return (data as AuditAttestation) ?? null;
  }

  /**
   * Sign (or upsert) a parameter attestation.
   * Resolves framework_mapping from catalog; cosign-enforcement CHECK constraint in DB
   * will reject the insert if NAAC/NBA-mapped and CAO+CEO not yet in cosigners.
   */
  static async sign(
    input: SignAttestationDto,
    opts: { userId: string }
  ): Promise<AuditAttestation> {
    // Resolve framework_mapping from catalog (institution override wins)
    const { data: param, error: paramErr } = await (this.supabase as any)
      .from('audit_parameter_catalog')
      .select('framework_mapping')
      .eq('code', input.parameter_code)
      .or(`institution_id.eq.${input.institution_id},institution_id.is.null`)
      .order('institution_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (paramErr) throw paramErr;
    const frameworkMapping = param?.framework_mapping ?? {};

    // Check existing attestation — optimistic lock (thrash T3)
    const existing = await this.get(input.audit_cycle_id, input.parameter_code, input.institution_id);
    if (existing && input.expected_updated_at && existing.updated_at !== input.expected_updated_at) {
      throw new Error(
        'This attestation was just modified by someone else. Please refresh and try again.'
      );
    }

    const payload = {
      audit_cycle_id: input.audit_cycle_id,
      parameter_code: input.parameter_code,
      institution_id: input.institution_id,
      attestation: input.attestation,
      attested_by: opts.userId,
      attested_at: new Date().toISOString(),
      framework_mapping: frameworkMapping,
      notes: input.notes ?? existing?.notes ?? null,
      cosigners: existing?.cosigners ?? {},
    };

    const { data, error } = await (this.supabase as any)
      .from('audit_attestations')
      .upsert(payload, { onConflict: 'audit_cycle_id,parameter_code,institution_id' })
      .select('*')
      .single();
    if (error) {
      if (error.message?.includes('audit_attestations_naac_nba_cosign')) {
        throw new Error(
          'NAAC/NBA attestation requires BOTH CAO and CEO co-signatures before it can be marked final. Ask them to cosign first.'
        );
      }
      throw error;
    }
    return data as AuditAttestation;
  }

  /**
   * Cosign an existing attestation. Merges into cosigners JSONB.
   */
  static async cosign(
    input: CosignAttestationDto,
    opts: { userId: string }
  ): Promise<AuditAttestation> {
    const { data: current, error: fetchErr } = await (this.supabase as any)
      .from('audit_attestations')
      .select('*')
      .eq('id', input.attestation_id)
      .single();
    if (fetchErr) throw fetchErr;

    if (input.expected_updated_at && current.updated_at !== input.expected_updated_at) {
      throw new Error('Attestation was modified by someone else. Refresh and retry.');
    }

    const nextCosigners: CosignersMap = {
      ...(current.cosigners ?? {}),
      [input.role]: {
        user_id: opts.userId,
        at: new Date().toISOString(),
      },
    };

    const { data, error } = await (this.supabase as any)
      .from('audit_attestations')
      .update({ cosigners: nextCosigners })
      .eq('id', input.attestation_id)
      .select('*')
      .single();
    if (error) throw error;
    return data as AuditAttestation;
  }

  /**
   * Rollup: for a cycle, count by attestation level across all (parameter × institution) pairs.
   */
  static async rollup(cycleId: string): Promise<{
    total: number;
    compliant: number;
    partial: number;
    non_compliant: number;
    pending: number;
  }> {
    const rows = await this.list(cycleId);
    const out = { total: rows.length, compliant: 0, partial: 0, non_compliant: 0, pending: 0 };
    for (const r of rows) {
      if (r.attestation === 'compliant') out.compliant++;
      else if (r.attestation === 'partial') out.partial++;
      else if (r.attestation === 'non-compliant') out.non_compliant++;
      else out.pending++;
    }
    return out;
  }
}
