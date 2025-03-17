// lib/services/resource/digital-resource-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  DigitalResource,
  CreateDigitalResourceDto,
  UpdateDigitalResourceDto,
  DigitalResourceFilters,
  DigitalResourceListResponse
} from '@/types/digital-resources';

export class DigitalResourceService {
  private static getSupabaseClient() {
    try {
      const client = createClientComponentClient();
      console.log('Supabase client initialized successfully');
      return client;
    } catch (error) {
      console.error('Error initializing Supabase client:', error);
      toast.error('Failed to connect to the database');
      throw error;
    }
  }

  private static supabase = DigitalResourceService.getSupabaseClient();

  static async createDigitalResource(data: CreateDigitalResourceDto): Promise<DigitalResource> {
    try {
      const { data: resource, error } = await this.supabase
        .from('digital_resources')
        .insert({
          digital_resource_name: data.digital_resource_name,
          type: data.type,
          category_id: data.category_id,
          access_method: data.access_method,
          license_information: data.license_information,
          institution_id: data.institution_id,
          department_id: data.department_id,
          owner_type: data.owner_type,
          owner_id: data.owner_id,
          access_availability: data.access_availability,
          sharing_restrictions: data.sharing_restrictions,
          maintenance_schedule: data.maintenance_schedule,
          is_active: data.is_active ?? true
        })
        .select('*')
        .single();

      if (error) throw error;
      return resource as DigitalResource;
    } catch (error) {
      console.error('Error creating digital resource:', error);
      toast.error('Failed to create digital resource');
      throw error;
    }
  }

  static async updateDigitalResource(
    id: string,
    data: UpdateDigitalResourceDto
  ): Promise<DigitalResource> {
    try {
      const { data: resource, error } = await this.supabase
        .from('digital_resources')
        .update({
          digital_resource_name: data.digital_resource_name,
          type: data.type,
          category_id: data.category_id,
          access_method: data.access_method,
          license_information: data.license_information,
          institution_id: data.institution_id,
          department_id: data.department_id,
          owner_type: data.owner_type,
          owner_id: data.owner_id,
          access_availability: data.access_availability,
          sharing_restrictions: data.sharing_restrictions,
          maintenance_schedule: data.maintenance_schedule,
          is_active: data.is_active
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return resource as DigitalResource;
    } catch (error) {
      console.error('Error updating digital resource:', error);
      toast.error('Failed to update digital resource');
      throw error;
    }
  }

  static async deleteDigitalResource(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('digital_resources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting digital resource:', error);
      toast.error('Failed to delete digital resource');
      throw error;
    }
  }

  static async getDigitalResources(
    filters: DigitalResourceFilters = {}
  ): Promise<DigitalResourceListResponse> {
    try {
      console.log('Fetching digital resources with filters:', filters);

      const {
        search,
        institution_id,
        department_id,
        type,
        category_id,
        access_method,
        owner_type,
        owner_id,
        isActive,
        page = 1,
        limit = 10
      } = filters;

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Start building the query
      let query = this.supabase.from('digital_resources').select(
        `
          *,
          institution:institutions(id, name, counselling_code),
          department:departments(id, department_code, department_name),
          category:digital_resource_categories(id, category_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('digital_resource_name', `%${search}%`);
      }

      if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      if (department_id) {
        query = query.eq('department_id', department_id);
      }

      if (type) {
        query = query.eq('type', type);
      }

      if (category_id) {
        query = query.eq('category_id', category_id);
      }

      if (access_method) {
        query = query.eq('access_method', access_method);
      }

      if (owner_type) {
        query = query.eq('owner_type', owner_type);
      }

      if (owner_id) {
        query = query.eq('owner_id', owner_id);
      }

      if (isActive !== undefined) {
        query = query.eq('is_active', isActive);
      }

      // Apply pagination
      query = query.range(from, to);

      // Execute the query
      console.log('Executing Supabase query...');
      const { data, error, count } = await query;

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

      console.log(`Query successful, received ${data?.length || 0} digital resources`);

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as DigitalResource[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching digital resources:', error);
      toast.error('Failed to fetch digital resources');
      throw error;
    }
  }

  static async getDigitalResource(id: string): Promise<DigitalResource> {
    try {
      const { data, error } = await this.supabase
        .from('digital_resources')
        .select(
          `
          *,
          institution:institutions(id, name, counselling_code),
          department:departments(id, department_code, department_name),
          category:digital_resource_categories(id, category_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as DigitalResource;
    } catch (error) {
      console.error('Error fetching digital resource:', error);
      toast.error('Failed to fetch digital resource details');
      throw error;
    }
  }

  static async getDigitalResourcesByOwner(
    ownerType: string,
    ownerId: string
  ): Promise<DigitalResource[]> {
    try {
      const { data, error } = await this.supabase
        .from('digital_resources')
        .select(
          `
          *,
          institution:institutions(id, name, counselling_code),
          department:departments(id, department_code, department_name),
          category:digital_resource_categories(id, category_name)
        `
        )
        .eq('owner_type', ownerType)
        .eq('owner_id', ownerId);

      if (error) throw error;
      return data as DigitalResource[];
    } catch (error) {
      console.error('Error fetching digital resources by owner:', error);
      toast.error('Failed to fetch digital resources');
      throw error;
    }
  }

  static async checkDigitalResourceAvailability(
    digitalResourceId: string,
    startDateTime: string,
    endDateTime: string,
    maxConcurrentUsers: number,
    reservationId?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc(
        'check_digital_reservation_conflict',
        {
          p_digital_resource_id: digitalResourceId,
          p_start_datetime: startDateTime,
          p_end_datetime: endDateTime,
          p_max_concurrent_users: maxConcurrentUsers,
          p_reservation_id: reservationId || null
        }
      );

      if (error) throw error;

      // Return true if there are no conflicts (data is false)
      return !data;
    } catch (error) {
      console.error('Error checking digital resource availability:', error);
      toast.error('Failed to check digital resource availability');
      throw error;
    }
  }
}
