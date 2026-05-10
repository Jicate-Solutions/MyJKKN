// lib/services/ims/unit-conversion-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsUnitConversion,
  ImsUnitConversionWithRelations,
  ImsUnitConversionFilters,
  CreateImsUnitConversionDto,
  UpdateImsUnitConversionDto,
} from '@/types/ims';

export class ImsUnitConversionService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List unit conversions with from_unit and to_unit joins.
   */
  static async getConversions(filters: ImsUnitConversionFilters = {}): Promise<{
    data: ImsUnitConversionWithRelations[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_unit_conversions')
        .select(
          `*,
           from_unit:ims_units!ims_unit_conversions_from_unit_id_fkey(id,name,abbreviation),
           to_unit:ims_units!ims_unit_conversions_to_unit_id_fkey(id,name,abbreviation),
           item:ims_items!ims_unit_conversions_item_id_fkey(id,name)`,
          { count: 'exact' }
        );

      // Store isolation
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      }

      // Item-specific conversions
      if (filters.item_id) {
        query = query.or(`item_id.eq.${filters.item_id},item_id.is.null`);
      }

      // Search on unit names via text match
      if (filters.search) {
        // Search is applied post-query since it spans joined tables;
        // for now, we can filter on conversion factor or item name at the DB level.
        // We'll let the caller handle search client-side for unit conversion names.
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsUnitConversionWithRelations[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsUnitConversionService] Error in getConversions:', error);
      throw error;
    }
  }

  /**
   * Create a new unit conversion.
   */
  static async createConversion(
    data: CreateImsUnitConversionDto
  ): Promise<ImsUnitConversion> {
    try {
      const { data: conversion, error } = await this.supabase
        .from('ims_unit_conversions')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('This unit conversion already exists');
        }
        throw error;
      }

      return conversion as ImsUnitConversion;
    } catch (error) {
      console.error('[ImsUnitConversionService] Error in createConversion:', error);
      throw error;
    }
  }

  /**
   * Update an existing unit conversion.
   */
  static async updateConversion(
    id: string,
    data: UpdateImsUnitConversionDto
  ): Promise<ImsUnitConversion> {
    try {
      const { data: conversion, error } = await this.supabase
        .from('ims_unit_conversions')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return conversion as ImsUnitConversion;
    } catch (error) {
      console.error('[ImsUnitConversionService] Error in updateConversion:', error);
      throw error;
    }
  }

  /**
   * Delete a unit conversion by ID.
   */
  static async deleteConversion(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_unit_conversions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsUnitConversionService] Error in deleteConversion:', error);
      throw error;
    }
  }

  /**
   * Convert a quantity from one unit to another.
   *
   * Looks up the conversion factor, optionally scoped to a specific item.
   * Falls back to a generic (item_id IS NULL) conversion if no item-specific
   * conversion is found.
   */
  static async convert(
    fromUnitId: string,
    toUnitId: string,
    quantity: number,
    itemId?: string
  ): Promise<number> {
    try {
      // Same unit = no conversion needed
      if (fromUnitId === toUnitId) return quantity;

      // Try item-specific conversion first, then generic
      let conversionFactor: number | null = null;

      if (itemId) {
        const { data: itemConversion } = await this.supabase
          .from('ims_unit_conversions')
          .select('conversion_factor')
          .eq('from_unit_id', fromUnitId)
          .eq('to_unit_id', toUnitId)
          .eq('item_id', itemId)
          .maybeSingle();

        if (itemConversion) {
          conversionFactor = itemConversion.conversion_factor;
        }
      }

      // Fallback to generic conversion
      if (conversionFactor === null) {
        const { data: genericConversion } = await this.supabase
          .from('ims_unit_conversions')
          .select('conversion_factor')
          .eq('from_unit_id', fromUnitId)
          .eq('to_unit_id', toUnitId)
          .is('item_id', null)
          .maybeSingle();

        if (genericConversion) {
          conversionFactor = genericConversion.conversion_factor;
        }
      }

      // Try reverse conversion
      if (conversionFactor === null) {
        const { data: reverseConversion } = await this.supabase
          .from('ims_unit_conversions')
          .select('conversion_factor')
          .eq('from_unit_id', toUnitId)
          .eq('to_unit_id', fromUnitId)
          .or(itemId ? `item_id.eq.${itemId},item_id.is.null` : 'item_id.is.null')
          .limit(1)
          .maybeSingle();

        if (reverseConversion) {
          conversionFactor = 1 / reverseConversion.conversion_factor;
        }
      }

      if (conversionFactor === null) {
        throw new Error(
          `No conversion found from unit ${fromUnitId} to unit ${toUnitId}`
        );
      }

      return quantity * conversionFactor;
    } catch (error) {
      console.error('[ImsUnitConversionService] Error in convert:', error);
      throw error;
    }
  }
}
