// lib/services/procurement/rating-service.ts
//
// Vendor & item ratings — the closed feedback loop. Writes go through two
// SECURITY DEFINER RPCs (procurement_rate_delivery / procurement_rate_item);
// reads use definer RPCs that return aggregates, so every viewer sees the same
// vendor score. The score itself is computed in lib/procurement/vendor-score.ts.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { computeVendorScore, type RatingMeans, type VendorKpis, type VendorScore } from '@/lib/procurement/vendor-score';
import type {
  ItemVendorRating,
  MeetsSpec,
  ProcurementRating,
  RateableLine,
} from '@/types/procurement';

export class ProcurementRatingService {
  private static get supabase() {
    return createClientSupabaseClient() as any;
  }

  /** Store admin's delivery rating for a verified GRN (re-rating edits it). */
  static async rateDelivery(input: {
    grnId: string;
    stars: number;
    tags: string[];
    comment?: string | null;
  }): Promise<ProcurementRating> {
    const { data, error } = await this.supabase.rpc('procurement_rate_delivery', {
      p_grn_id: input.grnId,
      p_stars: input.stars,
      p_tags: input.tags,
      p_comment: input.comment ?? null,
    });
    if (error) throw error;
    return data as ProcurementRating;
  }

  /** Requester's quality rating for one accepted GRN line. */
  static async rateItem(input: {
    grnItemId: string;
    stars: number;
    meetsSpec: MeetsSpec;
    comment?: string | null;
  }): Promise<ProcurementRating> {
    const { data, error } = await this.supabase.rpc('procurement_rate_item', {
      p_grn_item_id: input.grnItemId,
      p_stars: input.stars,
      p_meets_spec: input.meetsSpec,
      p_comment: input.comment ?? null,
    });
    if (error) throw error;
    return data as ProcurementRating;
  }

  /** Score + grade per vendor. Vendors with no data still get an entry (score null, isNew). */
  static async getVendorScores(supplierIds: string[]): Promise<Map<string, VendorScore>> {
    const ids = [...new Set(supplierIds.filter(Boolean))];
    const out = new Map<string, VendorScore>();
    if (ids.length === 0) return out;
    const [kpis, means] = await Promise.all([
      this.supabase.rpc('procurement_vendor_kpis', { p_supplier_ids: ids }),
      this.supabase.rpc('procurement_rating_means'),
    ]);
    if (kpis.error) throw kpis.error;
    if (means.error) throw means.error;
    const m: RatingMeans = (means.data as RatingMeans[] | null)?.[0] ?? { delivery_mean: null, item_mean: null };
    for (const k of (kpis.data ?? []) as VendorKpis[]) out.set(k.supplier_id, computeVendorScore(k, m));
    return out;
  }

  static async getItemVendorRatings(itemIds: string[]): Promise<ItemVendorRating[]> {
    const ids = [...new Set(itemIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.rpc('procurement_item_vendor_ratings', { p_item_ids: ids });
    if (error) throw error;
    return (data ?? []) as ItemVendorRating[];
  }

  /** Accepted lines on a request the caller (its requester) can rate, with their current rating. */
  static async getRateableLines(requestId: string): Promise<RateableLine[]> {
    const { data, error } = await this.supabase.rpc('procurement_rateable_lines', { p_request_id: requestId });
    if (error) throw error;
    return (data ?? []) as RateableLine[];
  }

  /** request_id → number of the caller's lines still to rate. */
  static async getMyUnratedCounts(): Promise<Map<string, number>> {
    const { data, error } = await this.supabase.rpc('procurement_my_unrated_counts');
    if (error) throw error;
    return new Map(((data ?? []) as { request_id: string; unrated: number }[]).map((r) => [r.request_id, r.unrated]));
  }

  /** The caller's own delivery rating on a GRN, if any. */
  static async getMyDeliveryRating(grnId: string, userId: string): Promise<ProcurementRating | null> {
    const { data, error } = await this.supabase
      .from('procurement_ratings')
      .select('*')
      .eq('grn_id', grnId)
      .eq('kind', 'delivery')
      .eq('rater_id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as ProcurementRating | null) ?? null;
  }

  /** Latest ratings for a vendor (RLS: only GRNs the viewer can see). */
  static async getRecentVendorRatings(supplierId: string, limit = 10): Promise<ProcurementRating[]> {
    const { data, error } = await this.supabase
      .from('procurement_ratings')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ProcurementRating[];
  }
}
