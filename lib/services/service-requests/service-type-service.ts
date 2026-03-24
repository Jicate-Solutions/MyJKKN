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
   * List service types with their fields and approval steps.
   * When userRoleKeys is provided (non-superadmin users), only service types
   * whose allowed_roles overlaps with the user's roles are returned.
   */
  static async getServiceTypes(filters?: {
    is_active?: boolean;
    userRoleKeys?: string[];
    isSuperAdmin?: boolean;
    /** User's org context — used to filter scoped service types for requesters */
    userScope?: {
      institution_id?: string;
      degree_id?: string;
      department_id?: string;
      program_id?: string;
    };
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

    // Filter by allowed_roles unless the user is a superadmin.
    // Uses Postgres && (overlaps) operator: returns types where at least
    // one of the user's role keys is in the service type's allowed_roles array.
    if (!filters?.isSuperAdmin && filters?.userRoleKeys && filters.userRoleKeys.length > 0) {
      query = query.overlaps('allowed_roles', filters.userRoleKeys);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[service-requests/types] Failed to fetch service types:', error);
      throw new Error(`Failed to fetch service types: ${error.message}`);
    }

    // For admin views (superadmin or no userScope), return all types unfiltered
    if (filters?.isSuperAdmin || !filters?.userScope) {
      return data || [];
    }

    // For requester views, filter scoped types by user's org context.
    // Common types always pass. Scoped types only pass if user matches the scope.
    const scope = filters.userScope;
    return (data || []).filter((type) => {
      if (type.scope_level === 'common') return true;

      if (type.scope_level === 'institution' && scope.institution_id) {
        return type.institution_ids?.includes(scope.institution_id);
      }
      if (type.scope_level === 'degree' && scope.degree_id) {
        return type.degree_ids?.includes(scope.degree_id);
      }
      if (type.scope_level === 'department' && scope.department_id) {
        return type.department_ids?.includes(scope.department_id);
      }
      if (type.scope_level === 'program' && scope.program_id) {
        return type.program_ids?.includes(scope.program_id);
      }

      return false;
    });
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

    // Upsert approval steps if provided.
    // Cannot delete-all + re-insert because service_request_approvals may reference
    // existing steps via approval_step_id FK (Postgres error 23503).
    // Strategy: update existing steps in-place, insert new ones, and only delete
    // unreferenced steps that were removed from the form.
    if (approval_steps) {
      // Fetch existing step IDs for this service type
      const { data: existingSteps } = await supabase
        .from('service_request_approval_steps')
        .select('id, step_order')
        .eq('service_type_id', id);

      const existingStepIds = (existingSteps || []).map((s: any) => s.id);

      // Match incoming steps to existing ones by step_order for stable updates
      const existingByOrder = new Map(
        (existingSteps || []).map((s: any) => [s.step_order, s.id])
      );

      const stepsToUpdate: Array<{ id: string; [key: string]: any }> = [];
      const stepsToInsert: Array<Record<string, any>> = [];
      const keptStepIds = new Set<string>();

      for (const step of approval_steps) {
        const existingId = existingByOrder.get(step.step_order);
        if (existingId) {
          // Update the existing step in-place
          stepsToUpdate.push({ id: existingId, ...step, service_type_id: id });
          keptStepIds.add(existingId);
        } else {
          // New step — will be inserted
          stepsToInsert.push({ ...step, service_type_id: id });
        }
      }

      // Update existing steps
      for (const step of stepsToUpdate) {
        const { id: stepId, ...stepData } = step;
        const { error: updateStepError } = await supabase
          .from('service_request_approval_steps')
          .update(stepData)
          .eq('id', stepId);

        if (updateStepError) {
          console.error('[service-requests/types] Failed to update step:', updateStepError);
          throw new Error(`Failed to update approval step: ${updateStepError.message}`);
        }
      }

      // Insert new steps
      if (stepsToInsert.length > 0) {
        const { error: insertStepsError } = await supabase
          .from('service_request_approval_steps')
          .insert(stepsToInsert);

        if (insertStepsError) {
          console.error('[service-requests/types] Failed to insert new steps:', insertStepsError);
          throw new Error(`Failed to update approval steps: ${insertStepsError.message}`);
        }
      }

      // Delete removed steps that are NOT referenced by any approvals
      const removedStepIds = existingStepIds.filter((sid: string) => !keptStepIds.has(sid));
      if (removedStepIds.length > 0) {
        // Check which removed steps are still referenced by approvals
        const { data: referencedApprovals } = await supabase
          .from('service_request_approvals')
          .select('approval_step_id')
          .in('approval_step_id', removedStepIds);

        const referencedIds = new Set(
          (referencedApprovals || []).map((a: any) => a.approval_step_id)
        );

        const safeToDelete = removedStepIds.filter((sid: string) => !referencedIds.has(sid));

        if (safeToDelete.length > 0) {
          const { error: deleteStepsError } = await supabase
            .from('service_request_approval_steps')
            .delete()
            .in('id', safeToDelete);

          if (deleteStepsError) {
            console.error('[service-requests/types] Failed to delete unreferenced steps:', deleteStepsError);
            // Non-fatal: steps are orphaned but not blocking
          }
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
