/**
 * LTI Tool Service
 *
 * Manages LTI 1.3 tool registrations (MATLAB Grader, MATLAB Online, etc.)
 * Provides CRUD operations for lti_tools table
 *
 * Created: 2026-01-12
 */

import { createClient } from '@/lib/supabase/server';
import {
  LtiTool,
  LtiToolInsert,
  LtiToolUpdate,
  LtiError,
  LTI_ERROR_CODES
} from '@/types/lti';

export class LtiToolService {
  /**
   * Get all LTI tools
   * @param includeInactive - Whether to include inactive tools (default: false)
   */
  static async getAllTools(includeInactive = false): Promise<LtiTool[]> {
    const supabase = await createClient();

    let query = supabase
      .from('lti_tools')
      .select('*')
      .order('created_at', { ascending: false });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw new LtiError(
        'Failed to fetch LTI tools',
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        500,
        error
      );
    }

    return data as LtiTool[];
  }

  /**
   * Get a single LTI tool by ID
   */
  static async getToolById(toolId: string): Promise<LtiTool> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('lti_tools')
      .select('*')
      .eq('id', toolId)
      .single();

    if (error || !data) {
      throw new LtiError(
        `LTI tool not found: ${toolId}`,
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        404,
        error
      );
    }

    return data as LtiTool;
  }

  /**
   * Get LTI tool by client ID
   */
  static async getToolByClientId(clientId: string): Promise<LtiTool> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('lti_tools')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (error || !data) {
      throw new LtiError(
        `LTI tool not found with client_id: ${clientId}`,
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        404,
        error
      );
    }

    return data as LtiTool;
  }

  /**
   * Get tools by type
   */
  static async getToolsByType(toolType: string): Promise<LtiTool[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('lti_tools')
      .select('*')
      .eq('tool_type', toolType)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new LtiError(
        'Failed to fetch LTI tools by type',
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        500,
        error
      );
    }

    return data as LtiTool[];
  }

  /**
   * Create a new LTI tool registration
   */
  static async createTool(
    toolData: LtiToolInsert,
    userId: string
  ): Promise<LtiTool> {
    const supabase = await createClient();

    // Check if client_id already exists
    const { data: existing } = await supabase
      .from('lti_tools')
      .select('id')
      .eq('client_id', toolData.client_id)
      .single();

    if (existing) {
      throw new LtiError(
        `Tool with client_id ${toolData.client_id} already exists`,
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        409
      );
    }

    const { data, error } = await supabase
      .from('lti_tools')
      .insert({
        ...toolData,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();

    if (error || !data) {
      throw new LtiError(
        'Failed to create LTI tool',
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        500,
        error
      );
    }

    return data as LtiTool;
  }

  /**
   * Update an existing LTI tool
   */
  static async updateTool(
    toolId: string,
    updates: LtiToolUpdate,
    userId: string
  ): Promise<LtiTool> {
    const supabase = await createClient();

    // Check if tool exists
    await this.getToolById(toolId);

    const { data, error } = await supabase
      .from('lti_tools')
      .update({
        ...updates,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', toolId)
      .select()
      .single();

    if (error || !data) {
      throw new LtiError(
        'Failed to update LTI tool',
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        500,
        error
      );
    }

    return data as LtiTool;
  }

  /**
   * Delete an LTI tool (soft delete by setting is_active = false)
   */
  static async deleteTool(toolId: string, userId: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('lti_tools')
      .update({
        is_active: false,
        updated_by: userId,
        updated_at: new Date().toISOString()
      })
      .eq('id', toolId);

    if (error) {
      throw new LtiError(
        'Failed to delete LTI tool',
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        500,
        error
      );
    }
  }

  /**
   * Activate a tool
   */
  static async activateTool(toolId: string, userId: string): Promise<LtiTool> {
    return this.updateTool(toolId, { is_active: true }, userId);
  }

  /**
   * Deactivate a tool
   */
  static async deactivateTool(toolId: string, userId: string): Promise<LtiTool> {
    return this.updateTool(toolId, { is_active: false }, userId);
  }

  /**
   * Check if a tool is active
   */
  static async isToolActive(toolId: string): Promise<boolean> {
    const tool = await this.getToolById(toolId);
    return tool.is_active;
  }

  /**
   * Check if tool license is expired
   */
  static async isLicenseExpired(toolId: string): Promise<boolean> {
    const tool = await this.getToolById(toolId);

    if (!tool.license_expiry_date) {
      return false; // No expiry date set
    }

    const expiryDate = new Date(tool.license_expiry_date);
    const today = new Date();

    return today > expiryDate;
  }

  /**
   * Get tools with expiring licenses (within next 30 days)
   */
  static async getToolsWithExpiringLicenses(): Promise<LtiTool[]> {
    const supabase = await createClient();

    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const { data, error } = await supabase
      .from('lti_tools')
      .select('*')
      .eq('is_active', true)
      .not('license_expiry_date', 'is', null)
      .gte('license_expiry_date', today.toISOString().split('T')[0])
      .lte('license_expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
      .order('license_expiry_date', { ascending: true });

    if (error) {
      throw new LtiError(
        'Failed to fetch tools with expiring licenses',
        LTI_ERROR_CODES.TOOL_NOT_FOUND,
        500,
        error
      );
    }

    return data as LtiTool[];
  }

  /**
   * Validate tool configuration
   */
  static validateToolConfig(tool: LtiToolInsert | LtiToolUpdate): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate URLs
    const urlFields = ['launch_url', 'public_keyset_url', 'oidc_auth_url', 'redirect_uri'];
    urlFields.forEach(field => {
      const value = tool[field as keyof typeof tool];
      if (value && typeof value === 'string') {
        try {
          new URL(value);
        } catch {
          errors.push(`${field} is not a valid URL`);
        }
      }
    });

    // Validate client_id format (if present)
    if ('client_id' in tool && tool.client_id) {
      if (tool.client_id.length < 10) {
        errors.push('client_id must be at least 10 characters');
      }
    }

    // Validate deployment_id (if present)
    if ('deployment_id' in tool && tool.deployment_id) {
      if (tool.deployment_id.length < 1) {
        errors.push('deployment_id cannot be empty');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
