// lib/services/ims/store-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsStore,
  ImsStoreWithRelations,
  ImsStoreFilters,
  CreateImsStoreDto,
  UpdateImsStoreDto,
} from '@/types/ims';

export class ImsStoreService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List stores with pagination and filtering.
   * Joins institution name and manager name.
   */
  static async getStores(filters: ImsStoreFilters = {}): Promise<{
    data: ImsStoreWithRelations[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      // Guard: if the Supabase browser client hasn't yet restored the session
      // from cookies (race on cold mount), getSession() returns null and the
      // query would run as 'anon', silently returning 0 rows due to RLS.
      // Throwing here lets React Query retry with backoff until the session
      // is available — without making an extra HTTP round-trip to /auth/v1/user.
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        throw new Error('[ImsStoreService] Session not yet available — will retry');
      }

      let query = this.supabase
        .from('ims_stores')
        .select(
          '*, institution:institutions(id, name), manager:profiles!ims_stores_manager_id_fkey(id, full_name)',
          { count: 'exact' }
        );

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.is_central_supply_store !== undefined) {
        query = query.eq('is_central_supply_store', filters.is_central_supply_store);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsStoreWithRelations[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      const e = error as { message?: string; code?: string; details?: string; hint?: string };
      console.error(
        '[ImsStoreService] Error in getStores:',
        e?.message ?? String(error),
        '| code:', e?.code,
        '| details:', e?.details,
        '| hint:', e?.hint,
        '| raw:', JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}))
      );
      throw error;
    }
  }

  /**
   * Get a single store by ID with relations.
   */
  static async getStore(id: string): Promise<ImsStoreWithRelations> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .select(
          '*, manager:profiles!ims_stores_manager_id_fkey(id, full_name)'
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return data as ImsStoreWithRelations;
    } catch (error) {
      const e = error as { message?: string; code?: string; details?: string; hint?: string };
      console.error(
        '[ImsStoreService] Error in getStore:',
        e?.message ?? String(error),
        '| code:', e?.code,
        '| details:', e?.details,
        '| hint:', e?.hint,
        '| raw:', JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}))
      );
      throw error;
    }
  }

  /**
   * Create a new store. Catches duplicate code violations.
   */
  static async createStore(data: CreateImsStoreDto): Promise<ImsStore> {
    try {
      const { data: store, error } = await this.supabase
        .from('ims_stores')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Two different unique constraints can fire here — don't report the
          // warehouse collision as a duplicate store code.
          const detail = `${error.message ?? ''} ${error.details ?? ''}`;
          if (detail.includes('one_warehouse_per_institution')) {
            throw new Error(
              'This institution already has a warehouse. Turn off the warehouse flag on the existing store first.'
            );
          }
          throw new Error(`Store code "${data.code}" already exists`);
        }
        throw error;
      }

      return store as ImsStore;
    } catch (error) {
      console.error('[ImsStoreService] Error in createStore:', error);
      throw error;
    }
  }

  /**
   * Update an existing store.
   * Non-super-admins have sensitive fields (GSTIN, UPI, receipt branding)
   * stripped server-side as a defense-in-depth guard.
   */
  static async updateStore(
    id: string,
    data: UpdateImsStoreDto
  ): Promise<ImsStore> {
    try {
      const updateData = { ...data };

      // Derive isSuperAdmin from the database — never trust a caller-supplied value.
      const { data: { user } } = await this.supabase.auth.getUser();
      const userId = user?.id;
      let isSuperAdmin = false;
      if (userId) {
        const { data: profile } = await this.supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        isSuperAdmin = profile?.role === 'super_admin';
      }

      // Strip sensitive fields for non-super-admins
      if (!isSuperAdmin) {
        delete updateData.gstin;
        delete updateData.upi_vpa;
        delete updateData.upi_merchant_name;
        delete updateData.receipt_header;
        delete updateData.receipt_footer;
      }

      const { data: store, error } = await this.supabase
        .from('ims_stores')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return store as ImsStore;
    } catch (error) {
      console.error('[ImsStoreService] Error in updateStore:', error);
      throw error;
    }
  }

  /**
   * Delete a store by ID.
   */
  static async deleteStore(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_stores')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsStoreService] Error in deleteStore:', error);
      throw error;
    }
  }

  /**
   * Toggle store active/inactive status.
   */
  static async toggleStoreActive(id: string, is_active: boolean): Promise<ImsStore> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsStore;
    } catch (error) {
      console.error('[ImsStoreService] Error in toggleStoreActive:', error);
      throw error;
    }
  }

  /**
   * Lightweight store list for the switcher dropdown.
   * Super admins see all active stores; regular users see their institution's
   * stores PLUS any store explicitly granted to them via ims_user_store_grants.
   */
  static async getStoresForSelect(
    institutionId?: string | null,
    isSuperAdmin?: boolean
  ): Promise<{ id: string; name: string; code: string; institution_id: string | null }[]> {
    try {
      // Guard: if the Supabase browser client hasn't yet restored the session
      // from cookies (race on cold mount), getSession() returns null and the
      // query would run as 'anon', silently returning 0 rows due to RLS.
      // Throwing here lets React Query retry with backoff until the session
      // is available — without making an extra HTTP round-trip to /auth/v1/user.
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        throw new Error('[ImsStoreService] Session not yet available — will retry');
      }

      let query = this.supabase
        .from('ims_stores')
        // is_pos_store rides along so the switcher can label counters and the
        // routing rule can tell a shop from a lab without another round-trip.
        .select('id, name, code, institution_id, is_pos_store')
        .eq('is_active', true)
        .order('name');

      if (!isSuperAdmin && institutionId) {
        // Cross-institution grants: a user may be allowed to operate a store
        // outside their own institution. RLS already permits reading those rows
        // (ims_stores SELECT is USING(true)); this filter is what makes them
        // appear in the switcher. Kept as a separate round-trip rather than an
        // embedded join because ims_user_store_grants has no FK path to
        // ims_stores that PostgREST can traverse in this direction.
        const grantedStoreIds = await this.getGrantedStoreIds();

        query = grantedStoreIds.length
          ? query.or(
              `institution_id.eq.${institutionId},id.in.(${grantedStoreIds.join(',')})`
            )
          : query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoresForSelect:', error);
      throw error;
    }
  }

  /**
   * Store ids granted to the current user beyond their own institution.
   *
   * Returns [] on error rather than throwing: a failure here should degrade the
   * switcher to "own institution only" — the pre-grants behaviour — not blank
   * the dropdown and strand the user on the store picker.
   */
  static async getGrantedStoreIds(): Promise<string[]> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) return [];

    // Filtered by user_id explicitly even though the SELECT policy already
    // scopes to auth.uid(): that same policy lets a super_admin read EVERY
    // user's grants, so an unfiltered query here would leak other people's
    // stores into the switcher the day this is called on a super-admin path.
    const { data, error } = await this.supabase
      .from('ims_user_store_grants')
      .select('store_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    if (error) {
      console.error('[ImsStoreService] Error loading store grants:', error);
      return [];
    }

    return (data || []).map((row) => row.store_id as string);
  }

  /**
   * All active stores for the admin "allocate a store to this user" UI, each
   * carrying its institution name.
   *
   * The name matters here in a way it does not in the switcher: these controls
   * hand out access ACROSS institutions, so "JKKN Pharmacy" alone is ambiguous
   * — the admin needs to see which institution they are opening up.
   */
  static async getStoresForAssignment(): Promise<
    {
      id: string;
      name: string;
      code: string;
      institution_id: string | null;
      institution_name: string | null;
    }[]
  > {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .select('id, name, code, institution_id, institutions(name)')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        institution_id: row.institution_id,
        institution_name: row.institutions?.name ?? null,
      }));
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoresForAssignment:', error);
      throw error;
    }
  }

  /**
   * Cross-institution store grants held by a specific user.
   * Admin-facing: readable only by a super_admin (RLS on ims_user_store_grants).
   */
  static async getUserStoreGrants(userId: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('ims_user_store_grants')
        .select('store_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      return (data || []).map((row: any) => row.store_id as string);
    } catch (error) {
      console.error('[ImsStoreService] Error in getUserStoreGrants:', error);
      throw error;
    }
  }

  /**
   * Find the first active store for a specific institution.
   * Backward-compatible — returns single store or null.
   */
  static async getStoreByInstitution(
    institutionId: string
  ): Promise<ImsStore | null> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stores')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data as ImsStore | null;
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoreByInstitution:', error);
      throw error;
    }
  }

  /**
   * Get ALL active stores for an institution (multi-store support).
   */
  static async getStoresByInstitution(
    institutionId: string
  ): Promise<ImsStore[]> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        throw new Error('[ImsStoreService] Session not yet available — will retry');
      }

      const { data, error } = await this.supabase
        .from('ims_stores')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []) as ImsStore[];
    } catch (error) {
      console.error('[ImsStoreService] Error in getStoresByInstitution:', error);
      throw error;
    }
  }
}
