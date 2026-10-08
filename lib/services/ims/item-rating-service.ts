// lib/services/ims/item-rating-service.ts
//
// IMS item ratings. Same pool as Procurement (procurement_ratings), so an item has one
// average and a vendor one score across both modules. Writes: ims_rate_indent_item.

import { createClientSupabaseClient } from '@/lib/supabase/client';

export type ImsMeetsSpec = 'yes' | 'no';

export interface ImsRateableLine {
  indent_item_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  delivered_on: string;
  my_stars: number | null;
  my_meets_spec: string | null;
  my_comment: string | null;
}

export interface ImsItemRatingSummary {
  item_id: string;
  star_sum: number;
  star_n: number;
  meets_no: number;
}

export interface ImsRecentRating {
  stars: number;
  meets_spec: string | null;
  comment: string | null;
  supplier_name: string | null;
  rated_at: string;
}

export class ImsItemRatingService {
  private static get supabase() {
    return createClientSupabaseClient() as any;
  }

  static async getRateableLines(indentId: string): Promise<ImsRateableLine[]> {
    const { data, error } = await this.supabase.rpc('ims_rateable_indent_lines', { p_indent_id: indentId });
    if (error) throw error;
    return (data ?? []) as ImsRateableLine[];
  }

  static async rateIndentItem(input: {
    indentItemId: string;
    stars: number;
    meetsSpec: ImsMeetsSpec;
    comment?: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.rpc('ims_rate_indent_item', {
      p_indent_item_id: input.indentItemId,
      p_stars: input.stars,
      p_meets_spec: input.meetsSpec,
      p_comment: input.comment ?? null,
    });
    if (error) throw error;
  }

  static async getSummaries(itemIds: string[]): Promise<Map<string, ImsItemRatingSummary>> {
    const ids = [...new Set(itemIds.filter(Boolean))];
    const out = new Map<string, ImsItemRatingSummary>();
    if (ids.length === 0) return out;
    const { data, error } = await this.supabase.rpc('ims_item_rating_summary', { p_item_ids: ids });
    if (error) throw error;
    for (const r of (data ?? []) as ImsItemRatingSummary[]) out.set(r.item_id, r);
    return out;
  }

  static async getRecent(itemId: string, limit = 5): Promise<ImsRecentRating[]> {
    const { data, error } = await this.supabase.rpc('ims_item_recent_ratings', {
      p_item_id: itemId,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as ImsRecentRating[];
  }
}
