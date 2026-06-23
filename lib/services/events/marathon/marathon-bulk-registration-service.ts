// lib/services/events/marathon/marathon-bulk-registration-service.ts
// MARATHON ADAPTER over the shared bulk-register engine (Events Platform Promotion PR7).
//
// Bulk import was promoted to lib/services/events/shared/event-bulk-register-service.ts. This file
// keeps the marathon-specific behavior — the BIB-number scheme (T/F/K prefixes, seeded per event) and
// a required category code — by delegating to EventBulkRegisterService with an injected CodeGenerator.
// Public method names and return shapes are unchanged so existing marathon callers (the bulk-register
// API route + use-marathon-registrations hook) keep working untouched.

import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  EventBulkRegisterService,
  type BulkImportResult,
  type RowValidationError,
  type EventCategoryInfo,
  type CodeGenerator,
} from '@/lib/services/events/shared/event-bulk-register-service';
import { MarathonRegistrationService } from './marathon-registration-service';

// Re-export the canonical types so legacy imports of these names from this module still resolve.
export type { BulkImportResult, RowValidationError };

// Marathon's row shape is the shared row with a REQUIRED category_code.
export interface BulkRegistrationRow {
  participant_name: string;
  participant_phone: string;
  participant_email?: string;
  participant_age?: number;
  participant_gender?: string;
  institution_name?: string;
  department?: string;
  category_code: string;
  tshirt_size?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  payment_status?: string;
  payment_amount?: number;
  payment_method?: string;
  payment_reference?: string;
}

/**
 * Build a stateful BIB code generator seeded from the event's existing per-prefix counts.
 * Reproduces the original marathon scheme: T (10K), F (5K paid), K (5K free).
 */
async function buildMarathonBibGenerator(eventId: string): Promise<CodeGenerator> {
  const supabase = createServiceRoleClient();

  const bibCounts = new Map<string, number>();
  for (const prefix of ['T', 'F', 'K']) {
    const { count } = await supabase
      .from('events_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .like('bib_number', `${prefix}%`);
    bibCounts.set(prefix, (count ?? 0) + 1);
  }

  return {
    next: ({ row, category }) => {
      const categoryCode = row.category_code ?? '';
      const feeAmount = category?.fee_amount ?? 0;
      const payStatus = row.payment_status ?? (feeAmount > 0 ? 'pending' : 'not_required');
      const prefix = MarathonRegistrationService.getBibPrefix(categoryCode, payStatus);
      const seq = bibCounts.get(prefix) ?? 1;
      bibCounts.set(prefix, seq + 1);
      // eventCode/year are unused by generateBibNumber's prefix scheme but kept for signature parity.
      return MarathonRegistrationService.generateBibNumber('', 0, categoryCode, seq, payStatus);
    },
  };
}

export class MarathonBulkRegistrationService {
  /** Delegates to the shared template generator (category dropdown + instructions). */
  static generateTemplate(eventId: string, eventName: string): Promise<Buffer> {
    return EventBulkRegisterService.generateTemplate(eventId, eventName);
  }

  /** Marathon requires a category code on every row. */
  static validateRows(
    rows: Record<string, unknown>[],
    validCategoryCodes: string[]
  ): { validRows: BulkRegistrationRow[]; errors: RowValidationError[] } {
    const { validRows, errors } = EventBulkRegisterService.validateRows(rows, validCategoryCodes, {
      requireCategory: true,
    });
    // Shared rows carry an optional category_code; marathon's enforced it, so the cast is safe.
    return { validRows: validRows as BulkRegistrationRow[], errors };
  }

  /** Bulk register external marathon participants using the BIB scheme. */
  static async bulkRegister(
    eventId: string,
    rows: BulkRegistrationRow[]
  ): Promise<BulkImportResult> {
    const codeGenerator = await buildMarathonBibGenerator(eventId);
    return EventBulkRegisterService.bulkRegister(eventId, rows, { codeGenerator });
  }
}

// Surface the category-info type for any legacy marathon imports.
export type { EventCategoryInfo as CategoryInfo };
