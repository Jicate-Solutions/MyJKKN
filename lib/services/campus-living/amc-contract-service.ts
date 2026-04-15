import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Read-only view of `resources` rows that behave as AMC contracts:
 * rows under the "Hostel Infrastructure" parent category that have
 * `vendor_contract_details` populated. Ordered by warranty expiry
 * descending, nulls last.
 */
export interface AmcContract {
  id: string;
  name: string;
  resource_code?: string | null;
  block_number?: string | null;
  room_number?: string | null;
  floor_number?: string | null;
  vendor_name?: string | null;
  vendor_email?: string | null;
  vendor_mobile?: string | null;
  vendor_contract_details?: string | null;
  vendor_support_contact?: string | null;
  warranty_expiry_date?: string | null;
  purchase_date?: string | null;
  status?: string | null;
  subcategory_id?: string | null;
  parent_category_id?: string | null;
  sub_category?: { id: string; name: string } | null;
  [k: string]: unknown;
}

export class AmcContractService {
  /** Look up the 'Hostel Infrastructure' parent category id once. */
  static async getHostelInfraCategoryId(): Promise<string | null> {
    try {
      const supabase = createClientSupabaseClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('resource_parent_categories')
        .select('id')
        .eq('name', 'Hostel Infrastructure')
        .maybeSingle();

      if (error) {
        logger.error(
          'campus-living/amc-contracts',
          'Failed to resolve Hostel Infrastructure category id',
          error,
        );
        throw error;
      }
      return data?.id ?? null;
    } catch (error) {
      logger.error(
        'campus-living/amc-contracts',
        'Unexpected error in getHostelInfraCategoryId',
        error,
      );
      throw error;
    }
  }

  /**
   * List resources under Hostel Infrastructure whose vendor_contract_details
   * is not null. Sub-category name is joined in via `resource_sub_categories`.
   */
  static async getContracts(institutionId?: string): Promise<AmcContract[]> {
    try {
      const parentId = await this.getHostelInfraCategoryId();
      if (!parentId) return [];

      const supabase = createClientSupabaseClient();
      // Use `any` to avoid deep-generic grief across joined selects.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = supabase
        .from('resources')
        .select(
          `id, name, resource_code, block_number, room_number, floor_number,
           vendor_name, vendor_email, vendor_mobile, vendor_contract_details,
           vendor_support_contact, warranty_expiry_date, purchase_date, status,
           subcategory_id, parent_category_id,
           sub_category:resource_sub_categories!resources_subcategory_id_fkey(id, name)`,
        )
        .eq('parent_category_id', parentId)
        .not('vendor_contract_details', 'is', null)
        .order('warranty_expiry_date', { ascending: false, nullsFirst: false });

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/amc-contracts', 'Failed to fetch AMC contracts', error);
        throw error;
      }
      return (data ?? []) as AmcContract[];
    } catch (error) {
      logger.error('campus-living/amc-contracts', 'Unexpected error in getContracts', error);
      throw error;
    }
  }
}
