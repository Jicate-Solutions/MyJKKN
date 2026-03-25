// lib/services/whatsapp/whatsapp-routing-service.ts
// Smart Routing for Inbound WhatsApp Messages
// Gap 3 — P0 Critical (automation)

import { createClient } from '@supabase/supabase-js';
import { AssignmentRulesService } from '@/lib/services/admission/assignment-rules-service';

// =============================================================================
// Types
// =============================================================================

export type MessageCategory =
  | 'fee_inquiry'
  | 'program_inquiry'
  | 'admission_status'
  | 'hostel_inquiry'
  | 'document_query'
  | 'callback_request'
  | 'complaint'
  | 'general';

export type ConversationPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface RouteResult {
  assignedTo: string | null;
  routingReason: string;
}

export interface RoutingStats {
  byCategory: Record<MessageCategory, number>;
  autoAssigned: number;
  manuallyAssigned: number;
  unassigned: number;
}

// =============================================================================
// Category Keyword Dictionaries
// =============================================================================

const CATEGORY_KEYWORDS: Record<MessageCategory, string[]> = {
  complaint: ['complaint', 'problem', 'issue', 'unhappy', 'bad', 'worst', 'refund'],
  callback_request: ['call', 'callback', 'contact', 'speak', 'phone', 'ring', 'talk'],
  fee_inquiry: ['fee', 'payment', 'cost', 'amount', 'scholarship', 'tuition', 'price', 'rupee', 'inr'],
  program_inquiry: ['course', 'program', 'btech', 'mba', 'pharm', 'nursing', 'engineering', 'admission', 'syllabus'],
  admission_status: ['status', 'application', 'admit', 'accepted', 'seat', 'allotment', 'offer letter'],
  hostel_inquiry: ['hostel', 'accommodation', 'room', 'mess', 'food', 'stay', 'living'],
  document_query: ['document', 'certificate', 'marksheet', 'upload', 'aadhaar', '10th', '12th'],
  general: [],
};

// Priority order for category matching (first match wins)
const CATEGORY_PRIORITY: MessageCategory[] = [
  'complaint',
  'callback_request',
  'fee_inquiry',
  'program_inquiry',
  'admission_status',
  'hostel_inquiry',
  'document_query',
];

// Priority mapping per category
const PRIORITY_MAP: Record<MessageCategory, ConversationPriority> = {
  complaint: 'urgent',
  callback_request: 'high',
  fee_inquiry: 'normal',
  program_inquiry: 'normal',
  admission_status: 'normal',
  hostel_inquiry: 'normal',
  document_query: 'normal',
  general: 'normal',
};

// =============================================================================
// Service Client
// =============================================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase service role credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// Service
// =============================================================================

export class WhatsAppRoutingService {
  /**
   * Categorize an inbound message based on keyword matching.
   * Returns the first matching category in priority order.
   */
  static categorizeMessage(text: string): MessageCategory {
    if (!text) return 'general';

    const lowerText = text.toLowerCase();

    for (const category of CATEGORY_PRIORITY) {
      const keywords = CATEGORY_KEYWORDS[category];
      const matched = keywords.some((kw) => lowerText.includes(kw));
      if (matched) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Route a conversation to a counselor using assignment rules + round-robin fallback.
   */
  static async routeConversation(params: {
    conversationId: string;
    institutionId: string;
    messageCategory: MessageCategory;
    leadData?: {
      interested_programs?: string[];
      source?: string;
      score?: number;
      region?: string;
    };
  }): Promise<RouteResult> {
    const supabase = getServiceClient();

    // Step 1: Check if conversation already has assigned_to
    const { data: conversation } = await supabase
      .from('wa_conversations')
      .select('assigned_to')
      .eq('id', params.conversationId)
      .single();

    if (conversation?.assigned_to) {
      return { assignedTo: conversation.assigned_to, routingReason: 'already_assigned' };
    }

    // Step 2: Evaluate assignment rules if lead data exists
    if (params.leadData) {
      try {
        const rules = await AssignmentRulesService.getActiveAssignmentRules(params.institutionId);

        for (const rule of rules) {
          const criteriaMatch = this.evaluateCriteria(rule.criteria, params.leadData, params.messageCategory);
          if (criteriaMatch && rule.action) {
            if (rule.action.type === 'assign_to_counselor' && rule.action.counselor_ids?.length) {
              // Pick first available counselor from the rule
              const counselorId = rule.action.counselor_ids[0];
              return { assignedTo: counselorId, routingReason: `rule_match:${rule.name}` };
            }
            if (rule.action.type === 'round_robin' && rule.action.counselor_ids?.length) {
              // Round-robin among the rule's counselor pool
              const counselorId = await this.roundRobinSelect(
                params.institutionId,
                rule.action.counselor_ids
              );
              if (counselorId) {
                return { assignedTo: counselorId, routingReason: `rule_round_robin:${rule.name}` };
              }
            }
          }
        }
      } catch (err) {
        console.error('[wa-routing] Error evaluating assignment rules:', err);
      }
    }

    // Step 3: Round-robin among all counselors with admission role
    try {
      const counselorId = await this.roundRobinFromAllCounselors(params.institutionId);
      if (counselorId) {
        return { assignedTo: counselorId, routingReason: 'round_robin_fallback' };
      }
    } catch (err) {
      console.error('[wa-routing] Error in round-robin fallback:', err);
    }

    // Step 4: No counselors found — leave unassigned, mark as urgent
    await supabase
      .from('wa_conversations')
      .update({
        metadata: { priority: 'urgent' },
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.conversationId);

    return { assignedTo: null, routingReason: 'no_counselors_available' };
  }

  /**
   * Set conversation priority based on message category
   */
  static async setConversationPriority(
    conversationId: string,
    category: MessageCategory
  ): Promise<void> {
    const supabase = getServiceClient();
    const priority = PRIORITY_MAP[category] || 'normal';

    // Merge priority into existing metadata
    const { data: conv } = await supabase
      .from('wa_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();

    const currentMetadata = (conv?.metadata as Record<string, unknown>) || {};

    await supabase
      .from('wa_conversations')
      .update({
        metadata: { ...currentMetadata, priority, message_category: category },
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  }

  /**
   * Get routing statistics for an institution
   */
  static async getRoutingStats(institutionId: string): Promise<RoutingStats> {
    const supabase = getServiceClient();

    const { data: conversations } = await supabase
      .from('wa_conversations')
      .select('assigned_to, metadata, tags')
      .eq('institution_id', institutionId);

    const convs = conversations || [];

    // Count by category from tags
    const byCategory: Record<MessageCategory, number> = {
      fee_inquiry: 0,
      program_inquiry: 0,
      admission_status: 0,
      hostel_inquiry: 0,
      document_query: 0,
      callback_request: 0,
      complaint: 0,
      general: 0,
    };

    let autoAssigned = 0;
    let manuallyAssigned = 0;
    let unassigned = 0;

    for (const conv of convs) {
      // Count categories from tags
      const tags = (conv.tags as string[]) || [];
      for (const tag of tags) {
        if (tag in byCategory) {
          byCategory[tag as MessageCategory]++;
        }
      }

      // Count assignment types
      if (!conv.assigned_to) {
        unassigned++;
      } else {
        const metadata = (conv.metadata as Record<string, unknown>) || {};
        if (metadata.routing_reason) {
          autoAssigned++;
        } else {
          manuallyAssigned++;
        }
      }
    }

    return { byCategory, autoAssigned, manuallyAssigned, unassigned };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Evaluate assignment rule criteria against lead data + message category
   */
  private static evaluateCriteria(
    criteria: Array<{ field: string; operator: string; value: string | number | string[] }>,
    leadData: {
      interested_programs?: string[];
      source?: string;
      score?: number;
      region?: string;
    },
    messageCategory: MessageCategory
  ): boolean {
    if (!criteria || criteria.length === 0) return true;

    for (const c of criteria) {
      const fieldValue = c.field === 'message_category'
        ? messageCategory
        : (leadData as Record<string, unknown>)[c.field];

      let match = false;
      switch (c.operator) {
        case 'equals':
          match = fieldValue === c.value;
          break;
        case 'contains':
          if (Array.isArray(fieldValue)) {
            match = fieldValue.some((v) => String(v).includes(String(c.value)));
          } else {
            match = String(fieldValue || '').includes(String(c.value));
          }
          break;
        case 'in':
          match = Array.isArray(c.value) && c.value.includes(String(fieldValue));
          break;
        case 'greater_than':
          match = Number(fieldValue) > Number(c.value);
          break;
        case 'less_than':
          match = Number(fieldValue) < Number(c.value);
          break;
        default:
          match = true;
      }

      if (!match) return false;
    }
    return true;
  }

  /**
   * Round-robin select from a specific list of counselor IDs.
   * Picks the counselor with fewest open conversations.
   */
  private static async roundRobinSelect(
    institutionId: string,
    counselorIds: string[]
  ): Promise<string | null> {
    if (counselorIds.length === 0) return null;

    const supabase = getServiceClient();

    // Get open conversation counts for each counselor
    const { data: conversations } = await supabase
      .from('wa_conversations')
      .select('assigned_to')
      .eq('institution_id', institutionId)
      .in('status', ['open', 'waiting'])
      .in('assigned_to', counselorIds);

    const counts: Record<string, number> = {};
    for (const cid of counselorIds) {
      counts[cid] = 0;
    }
    for (const conv of conversations || []) {
      if (conv.assigned_to && counts[conv.assigned_to] !== undefined) {
        counts[conv.assigned_to]++;
      }
    }

    // Pick the one with fewest open conversations
    let minCount = Infinity;
    let selectedId: string | null = null;
    for (const cid of counselorIds) {
      if (counts[cid] < minCount) {
        minCount = counts[cid];
        selectedId = cid;
      }
    }

    return selectedId;
  }

  /**
   * Round-robin among all admission counselors in the institution.
   */
  private static async roundRobinFromAllCounselors(
    institutionId: string
  ): Promise<string | null> {
    const supabase = getServiceClient();

    // Get all users with admission roles for this institution
    const { data: counselors } = await supabase
      .from('user_institution_access')
      .select('user_id')
      .eq('institution_id', institutionId)
      .in('role', ['admission_counselor', 'admission_manager', 'admin']);

    if (!counselors || counselors.length === 0) return null;

    const counselorIds = counselors.map((c) => c.user_id as string);
    return this.roundRobinSelect(institutionId, counselorIds);
  }
}
