// lib/services/staff/staff-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { Staff, StaffFilters, StaffListResponse } from '@/types/staff';

interface CreateStaffDto {
  first_name: string;
  last_name: string;
  gender: 'male' | 'female' | 'bigender';
  date_of_birth: string;
  marital_status: 'single' | 'married' | 'divorced' | 'widow';
  blood_group?: string;
  email: string;
  phone: string;
  staff_id?: string;
  profile_picture?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  date_of_joining: string;
  designation: string;
  category_id: string;
  institution_id: string;
  department_id: string;
  is_active: boolean;
}

interface UpdateStaffDto extends Partial<CreateStaffDto> {
  updated_at?: string;
}

export class StaffService {
  private static supabase = createClientSupabaseClient();

  static async createStaff(data: CreateStaffDto): Promise<Staff> {
    try {
      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('No authenticated user');

      // Check if staff_id already exists
      if (data.staff_id) {
        const { data: existing } = await this.supabase
          .from('staff')
          .select('id')
          .eq('staff_id', data.staff_id)
          .single();

        if (existing) {
          throw new Error('staff_staff_id_key');
        }
      }

      const { data: staff, error } = await this.supabase
        .from('staff')
        .insert([
          {
            ...data,
            created_by: session.user.id,
            updated_by: session.user.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      return staff;
    } catch (error) {
      console.error('Error creating staff:', error);
      throw error;
    }
  }

  static async updateStaff(id: string, data: UpdateStaffDto): Promise<Staff> {
    try {
      const {
        data: { session },
        error: sessionError
      } = await this.supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.user) throw new Error('No authenticated user');

      const { data: staff, error } = await this.supabase
        .from('staff')
        .update({
          ...data,
          updated_by: session.user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return staff;
    } catch (error) {
      console.error('Error updating staff:', error);
      throw error;
    }
  }

  static async deleteStaff(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.from('staff').delete().eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting staff:', error);
      throw error;
    }
  }

  static async getStaff(
    filters: StaffFilters = {}
  ): Promise<StaffListResponse> {
    try {
      let query = this.supabase.from('staff').select(
        `
          *,
          category:employment_categories(
            id,
            category_name
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,staff_id.ilike.%${filters.search}%`
        );
      }

      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: staff, error, count } = await query;

      if (error) throw error;

      return {
        data: staff || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }

  static async getStaffById(id: string): Promise<Staff> {
    try {
      const { data: staff, error } = await this.supabase
        .from('staff')
        .select(
          `
          *,
          category:employment_categories(
            id,
            category_name
          ),
          institution:institutions(
            id,
            name,
            counselling_code
          ),
          department:departments(
            id,
            department_name
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return staff;
    } catch (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }
  }
}
