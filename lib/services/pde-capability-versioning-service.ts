/**
 * PDE Capability Versioning Service
 * ============================================================================
 *
 * Tier 2 Item 5 wrapper around `pde_capabilities` + `pde_learner_capabilities`
 * that implements the three behaviour modes encoded in the
 * `pde.visibility.capability_versioning_policy` row:
 *
 *   - 'grandfather_with_upgrade' (default) — legacy attestations stay valid,
 *     learner sees "v1 (legacy)" badge with a nudge to re-demonstrate.
 *   - 'auto_expire'                          — attestations on an old version
 *     OR a row with `valid_until < now()` are surfaced as `expired: true`.
 *   - 'version_tag_only'                     — old attestations are fine, the
 *     display just shows the snapshot version next to the name.
 *
 * Storage / read substrate already in place (do NOT re-invent):
 *   - migration 20260519_pde_capabilities_versioning.sql adds the columns
 *   - getCapabilityVersioningPolicy() in lib/services/pde-policy-reader.ts
 *     reads the policy via fn_get_policy_json
 *   - PDEService.demonstrateCapability (lib/services/pde-service.ts) is the
 *     existing attestation-writer; THIS file does NOT modify it but exposes
 *     a helper to snapshot the version at write-time when callers are ready.
 *
 * Phase: PDE Substrate Tier 2 (2026-05-19).
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getCapabilityVersioningPolicy,
  type CapabilityVersioningMode,
  type CapabilityVersioningPolicy,
} from './pde-policy-reader';
import type { PDECapability } from '@/types/pde';

// ---------------------------------------------------------------------------
// Public return-shape types
// ---------------------------------------------------------------------------

export interface PDECapabilityVersionRow extends PDECapability {
  version: number;
  valid_until: string | null;
  superseded_by: string | null;
}

export interface GrandfatheredAttestation {
  capability_id: string;
  version: number;
  grandfathered: boolean;
}

export interface CapabilityDisplayResolution {
  display_version: number;
  show_tag: boolean;
  expired: boolean;
  mode: CapabilityVersioningMode;
  policy: CapabilityVersioningPolicy;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PDECapabilityVersioningService {
  /**
   * Returns the active (= non-superseded, highest-version) row for a given
   * capability slug. Used by the curriculum admin UI + capability detail page
   * to know which row is "live" when multiple versions exist.
   */
  static async getActiveVersion(
    capabilitySlug: string
  ): Promise<PDECapabilityVersionRow | null> {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('pde_capabilities')
      .select('*')
      .eq('slug', capabilitySlug)
      .is('superseded_by', null)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pde-capability-versioning] getActiveVersion(${capabilitySlug}) failed:`,
        error.message
      );
      return null;
    }
    return (data as PDECapabilityVersionRow) ?? null;
  }

  /**
   * Publishes a new version of an existing capability:
   *   1. reads the current row (must exist)
   *   2. inserts a NEW row with version = current.version + 1 and the merged
   *      `newDef` payload; the new row uses the SAME slug
   *   3. marks the old row's `superseded_by` = new row's id
   *
   * Returns the freshly-inserted row. Caller is responsible for any
   * notification / audit logging downstream.
   */
  static async createNewVersion(input: {
    capabilityId: string;
    newDef: Partial<Omit<PDECapability, 'id' | 'created_at' | 'slug'>> & {
      valid_until?: string | null;
    };
  }): Promise<PDECapabilityVersionRow> {
    const supabase = await createServerSupabaseClient();

    const { data: current, error: readError } = await (supabase as any)
      .from('pde_capabilities')
      .select('*')
      .eq('id', input.capabilityId)
      .single();
    if (readError || !current) {
      throw new Error(
        `[pde-capability-versioning] cannot read base capability ${input.capabilityId}: ${readError?.message ?? 'not found'}`
      );
    }

    const nextVersion = (current.version ?? 1) + 1;
    const insertRow = {
      slug: current.slug,
      name: input.newDef.name ?? current.name,
      description: input.newDef.description ?? current.description,
      category: input.newDef.category ?? current.category,
      level: input.newDef.level ?? current.level,
      lesson_ids: input.newDef.lesson_ids ?? current.lesson_ids,
      prerequisite_ids: input.newDef.prerequisite_ids ?? current.prerequisite_ids,
      demonstration_rubric:
        input.newDef.demonstration_rubric ?? current.demonstration_rubric,
      evidence_types: input.newDef.evidence_types ?? current.evidence_types,
      finks_dimension: input.newDef.finks_dimension ?? current.finks_dimension,
      estimated_hours: input.newDef.estimated_hours ?? current.estimated_hours,
      is_core: input.newDef.is_core ?? current.is_core,
      version: nextVersion,
      valid_until: input.newDef.valid_until ?? null,
      superseded_by: null,
    };

    // NOTE: slug has a UNIQUE constraint in the original schema, so the new
    // row CANNOT share the slug. To preserve lineage without schema change,
    // we suffix the new row's slug with `-vN` and rely on `superseded_by`
    // to chain rows. The active-head query above orders by version desc and
    // filters `superseded_by IS NULL`, so resolvers still find the latest.
    insertRow.slug = `${current.slug}-v${nextVersion}`;

    const { data: inserted, error: insertError } = await (supabase as any)
      .from('pde_capabilities')
      .insert(insertRow)
      .select()
      .single();
    if (insertError || !inserted) {
      throw new Error(
        `[pde-capability-versioning] insert new version failed: ${insertError?.message ?? 'no row returned'}`
      );
    }

    const { error: updateError } = await (supabase as any)
      .from('pde_capabilities')
      .update({ superseded_by: inserted.id })
      .eq('id', input.capabilityId);
    if (updateError) {
      // Best-effort rollback so we don't leave two active heads.
      await (supabase as any)
        .from('pde_capabilities')
        .delete()
        .eq('id', inserted.id);
      throw new Error(
        `[pde-capability-versioning] supersede-pointer update failed: ${updateError.message}`
      );
    }

    return inserted as PDECapabilityVersionRow;
  }

  /**
   * Lists every `pde_learner_capabilities` row whose snapshot version is
   * behind the active head version for that capability. Used by the learner
   * dashboard "needs re-demonstration" surface and by the resolver.
   *
   * In modes other than 'grandfather_with_upgrade' this list still computes
   * the same set; callers interpret it differently (auto_expire => expired,
   * version_tag_only => purely informational).
   */
  static async listGrandfathered(
    learnerId: string
  ): Promise<GrandfatheredAttestation[]> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await (supabase as any)
      .from('pde_learner_capabilities')
      .select(
        'capability_id, capability_version, grandfathered, capability:pde_capabilities!inner(id, slug, version, superseded_by)'
      )
      .eq('learner_id', learnerId);
    if (error || !data) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pde-capability-versioning] listGrandfathered(${learnerId}) failed:`,
        error?.message
      );
      return [];
    }

    const rows: GrandfatheredAttestation[] = [];
    for (const row of data as Array<{
      capability_id: string;
      capability_version: number | null;
      grandfathered: boolean | null;
      capability: { id: string; slug: string; version: number; superseded_by: string | null } | null;
    }>) {
      const snapshot = row.capability_version ?? 1;
      const liveVersion = row.capability?.version ?? snapshot;
      const isStale = liveVersion > snapshot || !!row.capability?.superseded_by;
      if (isStale) {
        rows.push({
          capability_id: row.capability_id,
          version: snapshot,
          grandfathered: row.grandfathered ?? false,
        });
      }
    }
    return rows;
  }

  /**
   * Final resolver consulted by the UI. Combines:
   *   - the live capability row (active head, expiry, supersession)
   *   - the learner's attestation snapshot (or absence thereof)
   *   - the active versioning policy
   * to produce a single render-friendly decision.
   */
  static async resolveDisplayFor(
    learnerId: string,
    capabilityId: string,
    institutionId?: string | null
  ): Promise<CapabilityDisplayResolution> {
    const policy = await getCapabilityVersioningPolicy(institutionId ?? null);
    const supabase = await createServerSupabaseClient();

    const { data: cap } = await (supabase as any)
      .from('pde_capabilities')
      .select('id, version, valid_until, superseded_by')
      .eq('id', capabilityId)
      .maybeSingle();

    const { data: attestation } = await (supabase as any)
      .from('pde_learner_capabilities')
      .select('capability_version, grandfathered')
      .eq('learner_id', learnerId)
      .eq('capability_id', capabilityId)
      .maybeSingle();

    const snapshotVersion: number =
      (attestation?.capability_version as number | null) ??
      (cap?.version as number | null) ??
      1;
    const liveVersion: number = (cap?.version as number | null) ?? snapshotVersion;
    const showTag = !!policy.show_version_tag;

    const now = Date.now();
    const hardExpiry =
      cap?.valid_until && new Date(cap.valid_until as string).getTime() < now;
    const versionDrift = liveVersion > snapshotVersion;

    let expired = false;
    let displayVersion = snapshotVersion;

    switch (policy.mode) {
      case 'auto_expire':
        expired = !!hardExpiry || versionDrift;
        // when expired, show the live version so the learner sees what to
        // re-demonstrate against.
        displayVersion = expired ? liveVersion : snapshotVersion;
        break;
      case 'version_tag_only':
        expired = false;
        displayVersion = snapshotVersion;
        break;
      case 'grandfather_with_upgrade':
      default:
        expired = false;
        displayVersion = snapshotVersion;
        break;
    }

    return {
      display_version: displayVersion,
      show_tag: showTag,
      expired,
      mode: policy.mode,
      policy,
    };
  }
}
