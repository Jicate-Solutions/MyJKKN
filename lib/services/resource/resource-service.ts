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

// Mock data for development
const MOCK_RESOURCES: Resource[] = [
  {
    id: 'res-1',
    resource_name: 'Microscope Lab',
    resource_type: 'laboratory',
    category_id: 'cat-1',
    description: 'Advanced microscopy laboratory with electron microscopes',
    institution_id: 'inst-1',
    department_id: 'dept-1',
    building: 'Science Building',
    room: '301',
    specifications: { brand: 'Zeiss', model: 'EM900', year: 2020 },
    acquisition_date: '2020-05-15',
    value: 75000,
    condition: 'excellent',
    availability_schedule: { weekdays: '8:00-18:00', weekends: '10:00-16:00' },
    is_shareable: true,
    sharing_restrictions: 'Requires trained operator',
    maintenance_schedule: 'Quarterly',
    owner_type: 'department',
    owner_id: 'dept-1',
    is_active: true,
    created_at: '2020-05-15T00:00:00Z',
    updated_at: '2023-01-10T00:00:00Z',
    institution: {
      id: 'inst-1',
      name: 'University of Science',
      counselling_code: 'UOS'
    },
    department: {
      id: 'dept-1',
      department_code: 'BIO',
      department_name: 'Biology Department'
    },
    category: {
      id: 'cat-1',
      category_name: 'Laboratory Equipment'
    }
  },
  {
    id: 'res-2',
    resource_name: 'Chemistry Lab',
    resource_type: 'laboratory',
    category_id: 'cat-1',
    description: 'Fully equipped chemistry laboratory',
    institution_id: 'inst-1',
    department_id: 'dept-2',
    building: 'Science Building',
    room: '201',
    specifications: { capacity: 30, fume_hoods: 10 },
    acquisition_date: '2019-08-20',
    value: 120000,
    condition: 'good',
    availability_schedule: { weekdays: '9:00-17:00', weekends: 'closed' },
    is_shareable: true,
    sharing_restrictions: 'Requires supervision',
    maintenance_schedule: 'Monthly',
    owner_type: 'department',
    owner_id: 'dept-2',
    is_active: true,
    created_at: '2019-08-20T00:00:00Z',
    updated_at: '2023-02-15T00:00:00Z',
    institution: {
      id: 'inst-1',
      name: 'University of Science',
      counselling_code: 'UOS'
    },
    department: {
      id: 'dept-2',
      department_code: 'CHEM',
      department_name: 'Chemistry Department'
    },
    category: {
      id: 'cat-1',
      category_name: 'Laboratory Equipment'
    }
  }
];

export class ResourceService {
  private static supabase = createClientComponentClient();
  private static useMockData = false; // Set to false to use the actual database

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
      if (this.useMockData) {
        // Return mock data
        const {
          search,
          institution_id,
          department_id,
          resource_type,
          category_id,
          isActive,
          page = 1,
          limit = 10
        } = filters;

        let filteredResources = [...MOCK_RESOURCES];

        // Apply filters
        if (search) {
          filteredResources = filteredResources.filter((r) =>
            r.resource_name.toLowerCase().includes(search.toLowerCase())
          );
        }

        if (institution_id) {
          filteredResources = filteredResources.filter(
            (r) => r.institution_id === institution_id
          );
        }

        if (department_id) {
          filteredResources = filteredResources.filter(
            (r) => r.department_id === department_id
          );
        }

        if (resource_type) {
          filteredResources = filteredResources.filter(
            (r) => r.resource_type === resource_type
          );
        }

        if (category_id) {
          filteredResources = filteredResources.filter(
            (r) => r.category_id === category_id
          );
        }

        if (isActive !== undefined) {
          filteredResources = filteredResources.filter(
            (r) => r.is_active === isActive
          );
        }

        // Calculate pagination
        const total = filteredResources.length;
        const totalPages = Math.ceil(total / limit);
        const from = (page - 1) * limit;
        const to = Math.min(from + limit, total);

        return {
          data: filteredResources.slice(from, to),
          metadata: {
            total,
            page,
            limit,
            totalPages
          }
        };
      }

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
      const { data, error, count } = await query;

      if (error) throw error;

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
      if (this.useMockData) {
        // Find the resource in mock data or return the first one
        const resource = MOCK_RESOURCES.find((r) => r.id === id);
        if (!resource) {
          throw new Error('Resource not found');
        }
        return resource;
      }

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
      if (this.useMockData) {
        // Filter resources by owner type and id
        return MOCK_RESOURCES.filter(
          (r) => r.owner_type === ownerType && r.owner_id === ownerId
        );
      }

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
