// ============================================================================
// Learner-facing error sanitation for Campus Living (2026-08-07).
//
// A learner saw `duplicate key value violates unique constraint
// "hostel_allocations_room_bed_active_uidx"` raw on her phone. No learner-facing
// surface may render raw database error text — no constraint names, SQLSTATE
// codes, or Postgres/Supabase prose. This module is the single shared pattern:
// log the FULL error server-side tagged with a short reference id, and hand the
// client only a plain sentence plus that reference.
// ============================================================================

import { logger } from '@/lib/utils/enhanced-logger';

/** Short reference id (8 hex chars) a learner can quote to the hostel office. */
export function newErrorReference(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * Log the full error server-side (enhanced-logger keeps `error` in production)
 * and return the reference id to embed in the learner-facing sentence.
 * The raw `error` must never be placed in a response body.
 */
export function logWithReference(moduleName: string, message: string, error: unknown): string {
  const reference = newErrorReference();
  logger.error(moduleName, `${message} [ref ${reference}]`, error);
  return reference;
}

/** Plain learner-facing sentence — no database prose, ever. */
export function learnerFacingError(action: string, reference: string): string {
  return `Something went wrong while ${action}. Please try again, or contact the hostel office quoting reference ${reference}.`;
}
