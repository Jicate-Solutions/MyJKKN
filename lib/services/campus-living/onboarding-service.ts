import { createClientSupabaseClient } from '@/lib/supabase/client'
import { logger } from '@/lib/utils/enhanced-logger'
import type {
  HostelOnboardingTemplate,
  CreateOnboardingTemplateDTO,
  OnboardingTemplateItem,
  HostelOnboardingChecklist,
  OnboardingChecklistItem,
  OnboardingFilters,
  OnboardingStatus,
} from '@/types/campus-living'

const CHECKLIST_JOINS = `
  *,
  hostel_allocations(id, hostel_blocks(name, code), hostel_rooms(room_number), hostel_beds(bed_number)),
  profiles!hostel_onboarding_checklists_learner_id_fkey(full_name, email, phone)
`.replace(/\n\s*/g, '')

const DEFAULT_CHECKLIST_ITEMS: OnboardingChecklistItem[] = [
  { type: 'room_readiness', title: 'Verify room is clean and ready', required: true, order: 1, status: 'pending', completed_at: null, completed_by: null, notes: null },
  { type: 'document_collection', title: 'Collect admission documents', required: true, order: 2, status: 'pending', completed_at: null, completed_by: null, notes: null },
  { type: 'welcome_kit', title: 'Issue welcome kit', required: false, order: 3, status: 'pending', completed_at: null, completed_by: null, notes: null },
  { type: 'emergency_contact', title: 'Verify emergency contact details', required: true, order: 4, status: 'pending', completed_at: null, completed_by: null, notes: null },
  { type: 'rules_acknowledgment', title: 'Hostel rules acknowledgment signed', required: true, order: 5, status: 'pending', completed_at: null, completed_by: null, notes: null },
  { type: 'mess_registration', title: 'Register for mess service', required: false, order: 6, status: 'pending', completed_at: null, completed_by: null, notes: null },
  { type: 'wifi_setup', title: 'WiFi access credentials provided', required: false, order: 7, status: 'pending', completed_at: null, completed_by: null, notes: null },
]

export class OnboardingService {
  // ── Get all templates for an institution ──────────────────────────
  static async getTemplates(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_templates')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to fetch templates', error)
        throw error
      }
      return data as HostelOnboardingTemplate[]
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in getTemplates', error)
      throw error
    }
  }

  // ── Get the active template for an institution ────────────────────
  static async getActiveTemplate(institutionId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_templates')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .limit(1)
        .single()

      if (error && error.code === 'PGRST116') {
        // No rows found — not an error, just no active template
        return null
      }
      if (error) {
        logger.error('campus-living/onboarding', 'Failed to fetch active template', error)
        throw error
      }
      return data as HostelOnboardingTemplate
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in getActiveTemplate', error)
      throw error
    }
  }

  // ── Create a new template ─────────────────────────────────────────
  static async createTemplate(payload: CreateOnboardingTemplateDTO) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_templates')
        .insert(payload)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to create template', error)
        throw error
      }
      return data as HostelOnboardingTemplate
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in createTemplate', error)
      throw error
    }
  }

  // ── Update an existing template ───────────────────────────────────
  static async updateTemplate(id: string, payload: Partial<HostelOnboardingTemplate>) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_templates')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to update template', error)
        throw error
      }
      return data as HostelOnboardingTemplate
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in updateTemplate', error)
      throw error
    }
  }

  // ── List checklists with filters and pagination ───────────────────
  static async getChecklists(
    institutionId: string,
    filters?: OnboardingFilters,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient()
      let query = (supabase as any)
        .from('hostel_onboarding_checklists')
        .select(CHECKLIST_JOINS, { count: 'exact' })
        .eq('institution_id', institutionId)

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.allocation_id) {
        query = query.eq('allocation_id', filters.allocation_id)
      }
      if (filters?.block_id) {
        query = query.eq('hostel_allocations.block_id', filters.block_id)
      }

      const from = (page - 1) * pageSize
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)

      const { data, error, count } = await query

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to fetch checklists', error)
        throw error
      }
      return { data: data as HostelOnboardingChecklist[], count: count ?? 0 }
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in getChecklists', error)
      throw error
    }
  }

  // ── Get a single checklist by ID ──────────────────────────────────
  static async getChecklist(id: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_checklists')
        .select(CHECKLIST_JOINS)
        .eq('id', id)
        .single()

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to fetch checklist', error)
        throw error
      }
      return data as HostelOnboardingChecklist
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in getChecklist', error)
      throw error
    }
  }

  // ── Get checklist by allocation ID ────────────────────────────────
  static async getChecklistByAllocation(allocationId: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_checklists')
        .select(CHECKLIST_JOINS)
        .eq('allocation_id', allocationId)
        .limit(1)
        .single()

      if (error && error.code === 'PGRST116') {
        return null
      }
      if (error) {
        logger.error('campus-living/onboarding', 'Failed to fetch checklist by allocation', error)
        throw error
      }
      return data as HostelOnboardingChecklist
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in getChecklistByAllocation', error)
      throw error
    }
  }

  // ── Create a checklist for a new allocation ───────────────────────
  static async createChecklist(
    allocationId: string,
    learnerId: string,
    institutionId: string,
    templateId?: string
  ) {
    try {
      let items: OnboardingChecklistItem[]
      let resolvedTemplateId: string | null = templateId ?? null

      if (templateId) {
        // Fetch specific template items
        const supabase = createClientSupabaseClient()
        const { data: template, error } = await (supabase as any)
          .from('hostel_onboarding_templates')
          .select('items')
          .eq('id', templateId)
          .single()

        if (error) {
          logger.error('campus-living/onboarding', 'Failed to fetch template for checklist', error)
          throw error
        }

        items = (template.items as OnboardingTemplateItem[]).map((item) => ({
          ...item,
          status: 'pending' as const,
          completed_at: null,
          completed_by: null,
          notes: null,
        }))
      } else {
        // Try to find the active template
        const activeTemplate = await OnboardingService.getActiveTemplate(institutionId)

        if (activeTemplate) {
          resolvedTemplateId = activeTemplate.id
          items = activeTemplate.items.map((item) => ({
            ...item,
            status: 'pending' as const,
            completed_at: null,
            completed_by: null,
            notes: null,
          }))
        } else {
          // Fall back to defaults
          items = [...DEFAULT_CHECKLIST_ITEMS]
        }
      }

      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_checklists')
        .insert({
          allocation_id: allocationId,
          learner_id: learnerId,
          institution_id: institutionId,
          template_id: resolvedTemplateId,
          status: 'not_started' as OnboardingStatus,
          items,
          started_at: null,
          completed_at: null,
          completed_by: null,
          notes: null,
        })
        .select()
        .single()

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to create checklist', error)
        throw error
      }
      return data as HostelOnboardingChecklist
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in createChecklist', error)
      throw error
    }
  }

  // ── Update a single checklist item by index ───────────────────────
  static async updateChecklistItem(
    checklistId: string,
    itemIndex: number,
    status: 'done' | 'skipped',
    completedBy: string,
    notes?: string
  ) {
    try {
      const supabase = createClientSupabaseClient()

      // Fetch current checklist
      const { data: checklist, error: fetchError } = await (supabase as any)
        .from('hostel_onboarding_checklists')
        .select('*')
        .eq('id', checklistId)
        .single()

      if (fetchError) {
        logger.error('campus-living/onboarding', 'Failed to fetch checklist for item update', fetchError)
        throw fetchError
      }

      const current = checklist as HostelOnboardingChecklist
      const items = [...current.items]

      if (itemIndex < 0 || itemIndex >= items.length) {
        throw new Error(`Item index ${itemIndex} out of range (0-${items.length - 1})`)
      }

      // Update the target item
      items[itemIndex] = {
        ...items[itemIndex],
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
        completed_by: completedBy,
        notes: notes ?? items[itemIndex].notes,
      }

      // Determine overall checklist status
      const isFirstAction = current.status === 'not_started'
      const allRequiredDone = items
        .filter((item) => item.required)
        .every((item) => item.status === 'done')

      const updates: Record<string, unknown> = { items }

      if (isFirstAction) {
        updates.status = 'in_progress'
        updates.started_at = new Date().toISOString()
      }

      if (allRequiredDone) {
        updates.status = 'completed'
        updates.completed_at = new Date().toISOString()
        updates.completed_by = completedBy
      }

      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_checklists')
        .update(updates)
        .eq('id', checklistId)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to update checklist item', error)
        throw error
      }
      return data as HostelOnboardingChecklist
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in updateChecklistItem', error)
      throw error
    }
  }

  // ── Mark the entire checklist as completed ────────────────────────
  static async completeChecklist(id: string, completedBy: string) {
    try {
      const supabase = createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('hostel_onboarding_checklists')
        .update({
          status: 'completed' as OnboardingStatus,
          completed_at: new Date().toISOString(),
          completed_by: completedBy,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('campus-living/onboarding', 'Failed to complete checklist', error)
        throw error
      }
      return data as HostelOnboardingChecklist
    } catch (error) {
      logger.error('campus-living/onboarding', 'Unexpected error in completeChecklist', error)
      throw error
    }
  }
}
