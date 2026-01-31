// app/actions/whatsapp/template-actions.ts
// Server actions for WhatsApp message templates

'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { WhatsAppTemplateService } from '@/lib/services/whatsapp/whatsapp-template-service';
import type {
  WhatsAppTemplate,
  WhatsAppTemplateFilters,
  WhatsAppTemplateListResponse,
  CreateWhatsAppTemplateDto,
  UpdateWhatsAppTemplateDto,
  WhatsAppTemplateCategory
} from '@/types/whatsapp';

// Response types
interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get current user's session and institution
 */
async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get user's institution
  const { data: profile } = await supabase
    .from('profiles')
    .select('institution_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.institution_id) {
    throw new Error('No institution assigned');
  }

  return {
    userId: user.id,
    institutionId: profile.institution_id,
    role: profile.role
  };
}

/**
 * Check if user has admin permissions for WhatsApp templates
 */
async function checkTemplatePermission(userId: string, institutionId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .eq('institution_id', institutionId)
    .single();

  if (!profile) return false;

  // Admin roles that can manage templates
  const adminRoles = ['super_admin', 'institution_admin', 'admin'];
  return adminRoles.includes(profile.role);
}

/**
 * Get all templates for the current institution
 */
export async function getTemplates(
  filters: Omit<WhatsAppTemplateFilters, 'institution_id'> = {}
): Promise<ActionResponse<WhatsAppTemplateListResponse>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check basic permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to view templates'
      };
    }

    // Force institution filter
    const response = await WhatsAppTemplateService.getTemplates({
      ...filters,
      institution_id: institutionId
    });

    return {
      success: true,
      data: response
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error getting templates:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates'
    };
  }
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(
  id: string
): Promise<ActionResponse<WhatsAppTemplate>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check basic permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to view templates'
      };
    }

    const template = await WhatsAppTemplateService.getTemplateById(id);

    if (!template) {
      return {
        success: false,
        error: 'Template not found'
      };
    }

    // Verify institution access
    if (template.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error getting template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get template'
    };
  }
}

/**
 * Create a new template
 */
export async function createTemplate(
  data: {
    name: string;
    category: WhatsAppTemplateCategory;
    content: string;
    description?: string;
    is_active?: boolean;
  }
): Promise<ActionResponse<WhatsAppTemplate>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to create templates'
      };
    }

    // Extract variables from content
    const variables = WhatsAppTemplateService.extractVariables(data.content);

    // Create template (service handles createdBy as second parameter)
    const template = await WhatsAppTemplateService.createTemplate({
      institution_id: institutionId,
      name: data.name,
      category: data.category,
      content: data.content,
      variables: variables,
      is_active: data.is_active ?? true,
    }, userId);

    revalidatePath('/whatsapp/templates');

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error creating template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template'
    };
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  id: string,
  data: {
    name?: string;
    category?: WhatsAppTemplateCategory;
    content?: string;
    description?: string;
    is_active?: boolean;
  }
): Promise<ActionResponse<WhatsAppTemplate>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to update templates'
      };
    }

    // Verify template exists and belongs to institution
    const existing = await WhatsAppTemplateService.getTemplateById(id);
    if (!existing) {
      return {
        success: false,
        error: 'Template not found'
      };
    }

    if (existing.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    // Prepare update data
    const updateData: UpdateWhatsAppTemplateDto = { ...data };

    // If content is being updated, re-extract variables
    if (data.content) {
      updateData.variables = WhatsAppTemplateService.extractVariables(data.content);
    }

    // Update template
    const template = await WhatsAppTemplateService.updateTemplate(id, updateData);

    revalidatePath('/whatsapp/templates');

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error updating template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template'
    };
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(
  id: string
): Promise<ActionResponse<void>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to delete templates'
      };
    }

    // Verify template exists and belongs to institution
    const existing = await WhatsAppTemplateService.getTemplateById(id);
    if (!existing) {
      return {
        success: false,
        error: 'Template not found'
      };
    }

    if (existing.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    // Delete template
    await WhatsAppTemplateService.deleteTemplate(id);

    revalidatePath('/whatsapp/templates');

    return {
      success: true
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error deleting template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template'
    };
  }
}

/**
 * Toggle template active status
 */
export async function toggleTemplateActive(
  id: string,
  isActive: boolean
): Promise<ActionResponse<WhatsAppTemplate>> {
  return updateTemplate(id, { is_active: isActive });
}

/**
 * Get template categories
 */
export async function getTemplateCategories(): Promise<ActionResponse<WhatsAppTemplateCategory[]>> {
  const categories: WhatsAppTemplateCategory[] = [
    'reminder',
    'announcement',
    'follow_up',
    'fee_reminder',
    'attendance_alert',
    'event_invite',
    'general'
  ];

  return {
    success: true,
    data: categories
  };
}

/**
 * Preview template with variables
 */
export async function previewTemplate(
  templateId: string,
  variables: Record<string, string>
): Promise<ActionResponse<{ preview: string }>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to preview templates'
      };
    }

    // Get template
    const template = await WhatsAppTemplateService.getTemplateById(templateId);
    if (!template) {
      return {
        success: false,
        error: 'Template not found'
      };
    }

    if (template.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    // Render template
    const preview = WhatsAppTemplateService.renderTemplate(template.content, variables);

    return {
      success: true,
      data: { preview }
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error previewing template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preview template'
    };
  }
}

/**
 * Duplicate a template
 */
export async function duplicateTemplate(
  id: string,
  newName?: string
): Promise<ActionResponse<WhatsAppTemplate>> {
  try {
    const { userId, institutionId } = await getCurrentUser();

    // Check permission
    const hasPermission = await checkTemplatePermission(userId, institutionId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'You do not have permission to duplicate templates'
      };
    }

    // Get original template
    const original = await WhatsAppTemplateService.getTemplateById(id);
    if (!original) {
      return {
        success: false,
        error: 'Template not found'
      };
    }

    if (original.institution_id !== institutionId) {
      return {
        success: false,
        error: 'Access denied'
      };
    }

    // Create duplicate
    const template = await WhatsAppTemplateService.createTemplate({
      institution_id: institutionId,
      name: newName || `${original.name} (Copy)`,
      category: original.category,
      content: original.content,
      variables: original.variables,
      is_active: false, // Start as inactive
    }, userId);

    revalidatePath('/whatsapp/templates');

    return {
      success: true,
      data: template
    };
  } catch (error) {
    console.error('[whatsapp/template-actions] Error duplicating template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to duplicate template'
    };
  }
}
