/**
 * SAML Service Provider Management Service
 *
 * Handles CRUD operations for trusted SAML Service Providers
 */

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  SamlServiceProvider,
  SamlServiceProviderInsert,
  SamlServiceProviderUpdate,
  SamlError,
  SamlStatusCode,
} from '@/types/saml';

export class SamlServiceProviderService {
  /**
   * Get all service providers
   */
  static async getServiceProviders(
    includeInactive = false
  ): Promise<SamlServiceProvider[]> {
    const supabase = await createClient();

    let query = supabase
      .from('saml_service_providers')
      .select('*')
      .order('name', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[saml-sp] Failed to fetch service providers:', error);
      throw new SamlError(
        'Failed to fetch service providers',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data as SamlServiceProvider[];
  }

  /**
   * Get service provider by entity ID
   * Uses service role client to bypass RLS — this lookup is called during the
   * SAML SSO flow BEFORE the user authenticates, so auth.uid() is NULL and
   * the "Admin users can view" policy would silently return 0 rows.
   */
  static async getServiceProviderByEntityId(
    entityId: string
  ): Promise<SamlServiceProvider | null> {
    // Service role bypasses RLS: SP metadata is a system read, not a user read
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('saml_service_providers')
      .select('*')
      .eq('entity_id', entityId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('[saml-sp] Failed to fetch service provider by ID:', error);
      throw new SamlError(
        'Failed to fetch service provider',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Get service provider by ID
   */
  static async getServiceProviderById(
    id: string
  ): Promise<SamlServiceProvider | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_service_providers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[saml-sp] Failed to fetch service provider by entity ID:', error);
      throw new SamlError(
        'Failed to fetch service provider',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Create new service provider
   */
  static async createServiceProvider(
    serviceProvider: SamlServiceProviderInsert,
    createdBy?: string
  ): Promise<SamlServiceProvider> {
    const supabase = await createClient();

    // Check if entity_id already exists
    const existing = await this.getServiceProviderByEntityId(
      serviceProvider.entity_id
    );

    if (existing) {
      throw new SamlError(
        `Service provider with entity ID ${serviceProvider.entity_id} already exists`,
        SamlStatusCode.REQUESTER,
        'invalid_request'
      );
    }

    const { data, error } = await supabase
      .from('saml_service_providers')
      .insert({
        ...serviceProvider,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('[saml-sp] Failed to create service provider:', error);
      throw new SamlError(
        'Failed to create service provider',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Update service provider
   */
  static async updateServiceProvider(
    id: string,
    updates: SamlServiceProviderUpdate,
    updatedBy?: string
  ): Promise<SamlServiceProvider> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('saml_service_providers')
      .update({
        ...updates,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[saml-sp] Failed to update service provider:', error);
      throw new SamlError(
        'Failed to update service provider',
        SamlStatusCode.RESPONDER,
        'database_error'
      );
    }

    return data as SamlServiceProvider;
  }

  /**
   * Delete service provider (soft delete by deactivating)
   */
  static async deleteServiceProvider(
    id: string,
    updatedBy?: string
  ): Promise<void> {
    await this.updateServiceProvider(
      id,
      { is_active: false },
      updatedBy
    );
  }

  /**
   * Validate service provider is active and allowed
   */
  static async validateServiceProvider(
    entityId: string
  ): Promise<SamlServiceProvider> {
    const sp = await this.getServiceProviderByEntityId(entityId);

    if (!sp) {
      throw new SamlError(
        `Unknown service provider: ${entityId}`,
        SamlStatusCode.REQUESTER,
        'unknown_service_provider'
      );
    }

    if (!sp.is_active) {
      throw new SamlError(
        `Service provider ${sp.name} is inactive`,
        SamlStatusCode.REQUESTER,
        'service_provider_inactive'
      );
    }

    return sp;
  }
}
