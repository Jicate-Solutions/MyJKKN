import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import type {
  Batch,
  CreateBatchDto,
  UpdateBatchDto,
  BatchFilters,
  BatchListResponse
} from '@/types/academics';

export class BatchService {
  private static supabase = createClientSupabaseClient();

  static async createBatch(data: CreateBatchDto): Promise<Batch> {
    try {
      const { data: batch, error } = await this.supabase
        .from('batches')
        .insert([data])
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        // Preserve the error code for proper handling in the UI
        const enhancedError: any = new Error(
          error.message || 'Failed to create batch'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return batch;
    } catch (error) {
      console.error('Error creating batch:', error);
      throw error;
    }
  }

  static async updateBatch(
    id: string,
    data: UpdateBatchDto
  ): Promise<Batch> {
    try {
      const { data: batch, error } = await this.supabase
        .from('batches')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Database error:', error);
        const enhancedError: any = new Error(
          error.message || 'Failed to update batch'
        );
        enhancedError.code = error.code;
        enhancedError.details = error.details;
        throw enhancedError;
      }

      return batch;
    } catch (error) {
      console.error('Error updating batch:', error);
      throw error;
    }
  }

  static async deleteBatch(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('batches')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Batch deleted successfully');
    } catch (error) {
      console.error('Error deleting batch:', error);
      throw error;
    }
  }

  static async bulkDeleteBatches(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteBatch(id);
        success.push(id);
      } catch (error) {
        console.error(`Error deleting batch ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  static async getBatches(
    filters: BatchFilters = {}
  ): Promise<BatchListResponse> {
    try {
      let query = this.supabase.from('batches').select(
        `
          *,
          institution:institutions(id, name, counselling_code)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `batch_code.ilike.%${filters.search}%,batch_name.ilike.%${filters.search}%,batch_year.ilike.%${filters.search}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters.batch_year) {
        query = query.eq('batch_year', filters.batch_year);
      }

      // Apply sorting
      if (filters.sortBy) {
        const direction = filters.sortDirection || 'asc';
        query = query.order(filters.sortBy, { ascending: direction === 'asc' });
      } else {
        // Default sort by start_date descending
        query = query.order('start_date', { ascending: false });
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching batches:', error);
      throw error;
    }
  }

  static async getBatch(id: string): Promise<Batch> {
    try {
      const { data: batch, error } = await this.supabase
        .from('batches')
        .select(
          `
          *,
          institution:institutions(id, name, counselling_code)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return batch;
    } catch (error) {
      console.error('Error fetching batch:', error);
      throw error;
    }
  }

  // Enhanced method with institution filtering
  static async getBatchesWithAccess(
    filters: BatchFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<BatchListResponse> {
    try {
      let query = this.supabase.from('batches').select(
        `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
          `,
        { count: 'exact' }
      );

      // Apply institution filter based on user permissions
      if (!isSuperAdmin && userInstitutionId) {
        query = query.eq('institution_id', userInstitutionId);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Apply search filter
      if (filters.search) {
        query = query.or(
          `batch_code.ilike.%${filters.search}%,batch_name.ilike.%${filters.search}%,batch_year.ilike.%${filters.search}%`
        );
      }

      // Apply active filter
      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply year filter
      if (filters.batch_year) {
        query = query.eq('batch_year', filters.batch_year);
      }

      // Apply sorting
      query = query.order('start_date', { ascending: false });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data || [],
        metadata: {
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching batches with access control:', error);
      throw error;
    }
  }

  // Get batches by institution with access control
  static async getBatchesByInstitutionWithAccess(
    institutionId: string,
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<Batch[]> {
    try {
      // Check if user has access to the requested institution
      if (
        !isSuperAdmin &&
        userInstitutionId &&
        institutionId !== userInstitutionId
      ) {
        throw new Error(
          'Access denied: You can only access your own institution data'
        );
      }

      const { data, error } = await this.supabase
        .from('batches')
        .select('*')
        .eq('institution_id', institutionId)
        .order('start_date', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching batches by institution:', error);
      throw error;
    }
  }
}
