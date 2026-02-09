/**
 * Service Type Service
 *
 * Manages service type definitions including their dynamic form fields
 * and approval step configurations.
 *
 * @module services/service-requests/service-type-service
 * @created 2026-02-09
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ServiceType,
  CreateServiceTypeDto,
  UpdateServiceTypeDto,
} from '@/types/service-request';

const getSupabase = async () => await createServerSupabaseClient() as any;

export class ServiceTypeService {
  /**
   * List service types with their fields and approval steps
   */
  static async getServiceTypes(filters?: {
    is_active?: boolean;
  }): Promise<ServiceType[]> {
    const supabase = await getSupabase();

    let query = supabase
      .from('service_types')
      .select(
        `*,
        fields:service_type_fields(*),
        approval_steps:service_request_approval_steps(*)`
      )
      .order('name', { ascending: true });

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[service-requests/types] Failed to fetch service types:', error);
      throw new Error(`Failed to fetch service types: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get a single service type by ID with fields and approval steps
   */
  static async getServiceType(id: string): Promise<ServiceType> {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('service_types')
      .select(
        `*,
        fields:service_type_fields(*),
        approval_steps:service_request_approval_steps(*)`
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('[service-requests/types] Failed to fetch service type:', error);
      throw new Error(`Service type not found: ${error.message}`);
    }

    return data;
  }

  /**
   * Look up a service type by its unique slug
   */
  static async getServiceTypeBySlug(slug: string): Promise<ServiceType | null> {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('service_types')
      .select(
        `*,
        fields:service_type_fields(*),
        approval_steps:service_request_approval_steps(*)`
      )
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.error('[service-requests/types] Failed to fetch service type by slug:', error);
      throw new Error(`Failed to fetch service type: ${error.message}`);
    }

    return data;
  }

  /**
   * Create a new service type with its fields and approval steps atomically
   */
  static async createServiceType(
    dto: CreateServiceTypeDto,
    userId: string
  ): Promise<ServiceType> {
    const supabase = await getSupabase();

    // Step 1: Insert the service type
    const { fields, approval_steps, ...typeData } = dto;

    const { data: serviceType, error: typeError } = await supabase
      .from('service_types')
      .insert({
        ...typeData,
        created_by: userId,
      })
      .select()
      .single();

    if (typeError) {
      console.error('[service-requests/types] Failed to create service type:', typeError);
      throw new Error(`Failed to create service type: ${typeError.message}`);
    }

    // Step 2: Insert fields with the new service_type_id
    if (fields && fields.length > 0) {
      const fieldsToInsert = fields.map((field) => ({
        ...field,
        service_type_id: serviceType.id,
      }));

      const { error: fieldsError } = await supabase
        .from('service_type_fields')
        .insert(fieldsToInsert);

      if (fieldsError) {
        console.error('[service-requests/types] Failed to create fields:', fieldsError);
        // Clean up: delete the service type we just created
        await supabase.from('service_types').delete().eq('id', serviceType.id);
        throw new Error(`Failed to create service type fields: ${fieldsError.message}`);
      }
    }

    // Step 3: Insert approval steps with the new service_type_id
    if (approval_steps && approval_steps.length > 0) {
      const stepsToInsert = approval_steps.map((step) => ({
        ...step,
        service_type_id: serviceType.id,
      }));

      const { error: stepsError } = await supabase
        .from('service_request_approval_steps')
        .insert(stepsToInsert);

      if (stepsError) {
        console.error('[service-requests/types] Failed to create approval steps:', stepsError);
        // Clean up
        await supabase.from('service_type_fields').delete().eq('service_type_id', serviceType.id);
        await supabase.from('service_types').delete().eq('id', serviceType.id);
        throw new Error(`Failed to create approval steps: ${stepsError.message}`);
      }
    }

    // Return the complete service type with relations
    return this.getServiceType(serviceType.id);
  }

  /**
   * Update a service type; optionally replace fields and/or approval steps
   */
  static async updateServiceType(
    id: string,
    dto: UpdateServiceTypeDto
  ): Promise<ServiceType> {
    const supabase = await getSupabase();

    const { fields, approval_steps, ...typeData } = dto;

    // Update the service type record itself
    if (Object.keys(typeData).length > 0) {
      const { error: typeError } = await supabase
        .from('service_types')
        .update(typeData)
        .eq('id', id);

      if (typeError) {
        console.error('[service-requests/types] Failed to update service type:', typeError);
        throw new Error(`Failed to update service type: ${typeError.message}`);
      }
    }

    // Replace fields if provided (delete + recreate)
    if (fields) {
      const { error: deleteFieldsError } = await supabase
        .from('service_type_fields')
        .delete()
        .eq('service_type_id', id);

      if (deleteFieldsError) {
        console.error('[service-requests/types] Failed to delete old fields:', deleteFieldsError);
        throw new Error(`Failed to update fields: ${deleteFieldsError.message}`);
      }

      if (fields.length > 0) {
        const fieldsToInsert = fields.map((field) => ({
          ...field,
          service_type_id: id,
        }));

        const { error: insertFieldsError } = await supabase
          .from('service_type_fields')
          .insert(fieldsToInsert);

        if (insertFieldsError) {
          console.error('[service-requests/types] Failed to insert new fields:', insertFieldsError);
          throw new Error(`Failed to update fields: ${insertFieldsError.message}`);
        }
      }
    }

    // Replace approval steps if provided (delete + recreate)
    if (approval_steps) {
      const { error: deleteStepsError } = await supabase
        .from('service_request_approval_steps')
        .delete()
        .eq('service_type_id', id);

      if (deleteStepsError) {
        console.error('[service-requests/types] Failed to delete old steps:', deleteStepsError);
        throw new Error(`Failed to update approval steps: ${deleteStepsError.message}`);
      }

      if (approval_steps.length > 0) {
        const stepsToInsert = approval_steps.map((step) => ({
          ...step,
          service_type_id: id,
        }));

        const { error: insertStepsError } = await supabase
          .from('service_request_approval_steps')
          .insert(stepsToInsert);

        if (insertStepsError) {
          console.error('[service-requests/types] Failed to insert new steps:', insertStepsError);
          throw new Error(`Failed to update approval steps: ${insertStepsError.message}`);
        }
      }
    }

    return this.getServiceType(id);
  }

  /**
   * Soft-deactivate a service type
   */
  static async deactivateServiceType(id: string): Promise<void> {
    const supabase = await getSupabase();

    const { error } = await supabase
      .from('service_types')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[service-requests/types] Failed to deactivate service type:', error);
      throw new Error(`Failed to deactivate service type: ${error.message}`);
    }
  }

  /**
   * Hard delete a service type (only if no requests exist for it)
   */
  static async deleteServiceType(id: string): Promise<void> {
    const supabase = await getSupabase();

    // Check if any service requests reference this type
    const { count, error: countError } = await supabase
      .from('service_requests')
      .select('*', { count: 'exact', head: true })
      .eq('service_type_id', id);

    if (countError) {
      console.error('[service-requests/types] Failed to check request count:', countError);
      throw new Error(`Failed to check request count: ${countError.message}`);
    }

    if (count && count > 0) {
      throw new Error(
        'Cannot delete service type with existing requests. Deactivate it instead.'
      );
    }

    // Delete fields and steps first (cascade should handle, but be explicit)
    await supabase.from('service_type_fields').delete().eq('service_type_id', id);
    await supabase.from('service_request_approval_steps').delete().eq('service_type_id', id);

    const { error } = await supabase
      .from('service_types')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[service-requests/types] Failed to delete service type:', error);
      throw new Error(`Failed to delete service type: ${error.message}`);
    }
  }
}
