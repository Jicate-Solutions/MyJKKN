// lib/services/resource/resource-service.ts

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import type {
  Resource,
  CreateResourceDto,
  UpdateResourceDto,
  ResourceFilters,
  ResourceListResponse
} from '@/types/resources';

export class ResourceService {
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

  private static supabase = ResourceService.getSupabaseClient();
  private static useMockData = false; // Set to false to use real data from Supabase

  static async createResource(data: CreateResourceDto): Promise<Resource> {
    try {
      const { data: resource, error } = await this.supabase
        .from('resources')
        .insert({
          resource_name: data.resource_name,
          resource_type: data.resource_type,
          category_id: data.category_id,
          description: data.description,
          institution_id: data.institution_id,
          department_id: data.department_id,
          building: data.building,
          room: data.room,
          specifications: data.specifications,
          acquisition_date: data.acquisition_date,
          value: data.value,
          condition: data.condition,
          availability_schedule: data.availability_schedule,
          is_shareable: data.is_shareable,
          sharing_restrictions: data.sharing_restrictions,
          maintenance_schedule: data.maintenance_schedule,
          owner_type: data.owner_type,
          owner_id: data.owner_id,
          is_active: data.is_active ?? true
        })
        .select('*')
        .single();

      if (error) throw error;
      return resource as Resource;
    } catch (error) {
      console.error('Error creating resource:', error);
      toast.error('Failed to create resource');
      throw error;
    }
  }

  static async updateResource(
    id: string,
    data: UpdateResourceDto
  ): Promise<Resource> {
    try {
      const { data: resource, error } = await this.supabase
        .from('resources')
        .update({
          resource_name: data.resource_name,
          resource_type: data.resource_type,
          category_id: data.category_id,
          description: data.description,
          institution_id: data.institution_id,
          department_id: data.department_id,
          building: data.building,
          room: data.room,
          specifications: data.specifications,
          acquisition_date: data.acquisition_date,
          value: data.value,
          condition: data.condition,
          availability_schedule: data.availability_schedule,
          is_shareable: data.is_shareable,
          sharing_restrictions: data.sharing_restrictions,
          maintenance_schedule: data.maintenance_schedule,
          owner_type: data.owner_type,
          owner_id: data.owner_id,
          is_active: data.is_active
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return resource as Resource;
    } catch (error) {
      console.error('Error updating resource:', error);
      toast.error('Failed to update resource');
      throw error;
    }
  }

  static async deleteResource(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('resources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting resource:', error);
      toast.error('Failed to delete resource');
      throw error;
    }
  }

  static async getResources(
    filters: ResourceFilters = {}
  ): Promise<ResourceListResponse> {
    try {
      console.log('Fetching resources with filters:', filters);

      const {
        search,
        institution_id,
        department_id,
        resource_type,
        category_id,
        condition,
        is_shareable,
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
      let query = this.supabase.from('resources').select(
        `
          *,
          institution:institutions(id, name, counselling_code),
          department:departments(id, department_code, department_name),
          category:resource_categories(id, category_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (search) {
        query = query.ilike('resource_name', `%${search}%`);
      }

      if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      if (department_id) {
        query = query.eq('department_id', department_id);
      }

      if (resource_type) {
        query = query.eq('resource_type', resource_type);
      }

      if (category_id) {
        query = query.eq('category_id', category_id);
      }

      if (condition) {
        query = query.eq('condition', condition);
      }

      if (is_shareable !== undefined) {
        query = query.eq('is_shareable', is_shareable);
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

      console.log(`Query successful, received ${data?.length || 0} resources`);

      // Calculate total pages
      const totalPages = count ? Math.ceil(count / limit) : 0;

      return {
        data: data as Resource[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error fetching resources:', error);
      toast.error('Failed to fetch resources');
      throw error;
    }
  }

  static async getResource(id: string): Promise<Resource> {
    try {
      const { data, error } = await this.supabase
        .from('resources')
        .select(
          `
          *,
          institution:institutions(id, name, counselling_code),
          department:departments(id, department_code, department_name),
          category:resource_categories(id, category_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Resource;
    } catch (error) {
      console.error('Error fetching resource:', error);
      toast.error('Failed to fetch resource details');
      throw error;
    }
  }

  static async getResourcesByOwner(
    ownerType: string,
    ownerId: string
  ): Promise<Resource[]> {
    try {
      const { data, error } = await this.supabase
        .from('resources')
        .select(
          `
          *,
          institution:institutions(id, name, counselling_code),
          department:departments(id, department_code, department_name),
          category:resource_categories(id, category_name)
        `
        )
        .eq('owner_type', ownerType)
        .eq('owner_id', ownerId);

      if (error) throw error;
      return data as Resource[];
    } catch (error) {
      console.error('Error fetching resources by owner:', error);
      toast.error('Failed to fetch resources');
      throw error;
    }
  }

  static async checkResourceAvailability(
    resourceId: string,
    startDateTime: string,
    endDateTime: string,
    reservationId?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc(
        'check_reservation_conflict',
        {
          p_resource_id: resourceId,
          p_start_datetime: startDateTime,
          p_end_datetime: endDateTime,
          p_reservation_id: reservationId || null
        }
      );

      if (error) throw error;

      // Return true if there are no conflicts (data is false)
      return !data;
    } catch (error) {
      console.error('Error checking resource availability:', error);
      toast.error('Failed to check resource availability');
      throw error;
    }
  }
}
