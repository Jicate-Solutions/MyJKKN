/**
 * CDC Sprint 3 — Placement Service
 *
 * Handles cdc_placements CRUD + status transitions + snapshot capture.
 * Multi-offer cascade is enforced DB-side via trg_cdc_multi_offer_cascade;
 * the service layer handles the UX prompt (other_offers count) so the UI
 * can inform the coordinator before they accept.
 *
 * Spec decisions: Round 2.2 (round_no + batch_no), 2.3 (multi-offer cascade),
 * 4.1 (tiered privacy), 5.4 (snapshots).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcPlacement,
  CdcPlacementRow,
  CdcPlacementInsert,
  CdcPlacementStatusUpdate,
  CdcPlacementFilters,
  CdcPlacementListResponse,
  CdcPlacementDetailResponse,
  CdcSnapshotCaptureResponse,
} from '@/types/cdc/placements';

// =====================================================================================
// Placement Service
// =====================================================================================

export class CdcPlacementService {
  // ----- List -----

  static async listPlacements(
    supabase: SupabaseClient,
    filters: CdcPlacementFilters = {}
  ): Promise<CdcPlacementListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const rangeFrom = (page - 1) * pageSize;
    const rangeTo = rangeFrom + pageSize - 1;

    let q = supabase
      .from('cdc_placements')
      .select('*', { count: 'exact' })
      .order('offered_at', { ascending: false })
      .range(rangeFrom, rangeTo);

    if (filters.drive_id) q = q.eq('drive_id', filters.drive_id);
    if (filters.learner_id) q = q.eq('learner_id', filters.learner_id);
    if (filters.recruiter_id) q = q.eq('recruiter_id', filters.recruiter_id);
    if (filters.offer_type_id) q = q.eq('offer_type_id', filters.offer_type_id);
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }

    const { data, count, error } = await q;
    if (error) throw error;

    const rows = data ?? [];

    // Denormalise recruiter names + drive titles + offer type labels in a single batch
    const recruiterIds = [...new Set(rows.map((r) => r.recruiter_id).filter(Boolean))];
    const driveIds = [...new Set(rows.map((r) => r.drive_id).filter(Boolean))];
    const offerTypeIds = [...new Set(rows.map((r) => r.offer_type_id).filter(Boolean))];

    const [recruitersRes, drivesRes, offerTypesRes] = await Promise.all([
      recruiterIds.length > 0
        ? supabase.from('cdc_recruiters').select('id, name').in('id', recruiterIds)
        : { data: [], error: null },
      driveIds.length > 0
        ? supabase.from('cdc_drives').select('id, title').in('id', driveIds)
        : { data: [], error: null },
      offerTypeIds.length > 0
        ? supabase.from('cdc_offer_types').select('id, display_name').in('id', offerTypeIds)
        : { data: [], error: null },
    ]);

    const recruiterMap = new Map(
      (recruitersRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name])
    );
    const driveMap = new Map(
      (drivesRes.data ?? []).map((d: { id: string; title: string }) => [d.id, d.title])
    );
    const offerTypeMap = new Map(
      (offerTypesRes.data ?? []).map((o: { id: string; display_name: string }) => [
        o.id,
        o.display_name,
      ])
    );

    const enriched: CdcPlacementRow[] = rows.map((p) => ({
      ...p,
      recruiter_name: recruiterMap.get(p.recruiter_id) ?? undefined,
      drive_title: p.drive_id ? (driveMap.get(p.drive_id) ?? null) : null,
      offer_type_label: offerTypeMap.get(p.offer_type_id) ?? undefined,
    }));

    return {
      data: enriched,
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  // ----- Get single -----

  static async getPlacement(
    supabase: SupabaseClient,
    id: string
  ): Promise<CdcPlacementDetailResponse | null> {
    const { data: placement, error } = await supabase
      .from('cdc_placements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;  // not found
      throw error;
    }

    // Fetch other offers for the same learner (for cascade-aware UI)
    const { data: otherOffers } = await supabase
      .from('cdc_placements')
      .select('id, status, drive_id, recruiter_id, package_lpa, offered_at')
      .eq('learner_id', placement.learner_id)
      .eq('status', 'offered')
      .neq('id', id);

    // Enrich with names
    const [recruiterRes, driveRes, offerTypeRes] = await Promise.all([
      supabase.from('cdc_recruiters').select('id, name').eq('id', placement.recruiter_id).single(),
      placement.drive_id
        ? supabase.from('cdc_drives').select('id, title').eq('id', placement.drive_id).single()
        : { data: null, error: null },
      supabase.from('cdc_offer_types').select('id, display_name').eq('id', placement.offer_type_id).single(),
    ]);

    const enriched: CdcPlacementRow = {
      ...placement,
      recruiter_name: recruiterRes.data?.name ?? undefined,
      drive_title: driveRes.data?.title ?? null,
      offer_type_label: offerTypeRes.data?.display_name ?? undefined,
    };

    return {
      placement: enriched,
      other_offers: otherOffers ?? [],
    };
  }

  // ----- Create -----

  static async createPlacement(
    supabase: SupabaseClient,
    payload: CdcPlacementInsert
  ): Promise<CdcPlacement> {
    const { data, error } = await supabase
      .from('cdc_placements')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as CdcPlacement;
  }

  // ----- Status transition -----

  /**
   * Update status with the correct audit timestamp.
   * Multi-offer cascade (offered→declined on sibling rows) is handled DB-side
   * via trg_cdc_multi_offer_cascade when status='accepted' is written.
   */
  static async updateStatus(
    supabase: SupabaseClient,
    id: string,
    update: CdcPlacementStatusUpdate
  ): Promise<CdcPlacement> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: update.status };

    if (update.status === 'accepted') {
      patch.accepted_at = now;
      if (update.acceptance_letter_url) {
        patch.acceptance_letter_url = update.acceptance_letter_url;
      }
    } else if (update.status === 'declined') {
      patch.declined_at = now;
      patch.decline_reason = update.decline_reason ?? null;
    } else if (update.status === 'rescinded') {
      patch.rescinded_at = now;
      patch.rescind_reason = update.rescind_reason ?? null;
    }

    const { data, error } = await supabase
      .from('cdc_placements')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as CdcPlacement;
  }

  // ----- Manual snapshot capture -----

  static async captureSnapshot(
    supabase: SupabaseClient,
    cycle: string
  ): Promise<CdcSnapshotCaptureResponse> {
    const { data, error } = await supabase.rpc('fn_capture_cdc_placement_snapshot', {
      p_cycle: cycle,
    });
    if (error) throw error;
    return { cycle, rows_inserted: data as number };
  }
}
