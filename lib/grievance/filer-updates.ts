// lib/grievance/filer-updates.ts
// ============================================================================
// SERVER-ONLY. Sends the person who raised a complaint one bell each time its
// status or its handler changes (Director ruling, 30 Sep 2026).
//
// Called from every server-side place a grievance_tickets status/assignee is
// written:
//   1. lib/grievance/actions.ts — updateGrievanceStatusAction, which
//      GrievanceService.updateStatus (the handler pages) now goes through;
//   2. app/api/learners-council/issues/[id]/route.ts — the Learners Council
//      board's Move / Assign.
//
// Never on an anonymous complaint: those are followed on /instasolver/track.
// Never fails the write that triggered it — a lost bell is logged, not thrown.
//
// createdBy is the FILER, not the handler — the same choice
// app/api/campus-walk/review/route.ts makes, so no "From: <staff name>" line is
// rendered by any notification surface; the body names the handler only as
// the Director's ruling asks ("handled by <name>").
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  FILER_UPDATE_URL,
  describeFilerUpdate,
  type FilerUpdateAfter,
  type FilerUpdateBefore,
} from './complaint-display';

const MODULE = 'grievance/filer-updates';

export type FilerUpdateOutcome = 'sent' | 'skipped' | 'not-sent';

type SendBell = typeof createBellNotification;

/**
 * @param admin a SERVICE-ROLE client, or a function that makes one: the filer's
 *              bell rows and the handler's name are written/read on the filer's
 *              behalf, not the handler's. Pass the function (e.g.
 *              createServiceRoleClient) when the caller's write has already
 *              committed: making the client can throw (missing key), and that
 *              must land in the catch below, not fail the write.
 * @param sendBell injectable for tests; defaults to the live bell path.
 */
export async function notifyFilerOfChange(
  admin: SupabaseClient | (() => SupabaseClient),
  change: { before: FilerUpdateBefore | null; after: FilerUpdateAfter },
  sendBell: SendBell = createBellNotification
): Promise<FilerUpdateOutcome> {
  try {
    const { before, after } = change;

    // Cheap exits first, so an anonymous or unchanged ticket costs no query.
    if (!describeFilerUpdate(before, after, null)) return 'skipped';

    const db = typeof admin === 'function' ? admin() : admin;

    let handlerName: string | null = null;
    if (after.assigned_to) {
      const { data } = await db
        .from('profiles')
        .select('full_name')
        .eq('id', after.assigned_to)
        .maybeSingle();
      handlerName = (data as { full_name?: string | null } | null)?.full_name ?? null;
    }

    const message = describeFilerUpdate(before, after, handlerName);
    if (!message) return 'skipped';

    const id = await sendBell(db, {
      recipientIds: [message.recipientId],
      createdBy: message.recipientId,
      title: message.title,
      body: message.body,
      url: FILER_UPDATE_URL,
      category: 'grievance:filer-update',
      metadata: {
        source: 'grievance_filer_update',
        ticket_id: after.id,
        ticket_number: after.ticket_number,
        status: after.status,
      },
    });

    // null = the insert failed (logged inside).
    return id ? 'sent' : 'not-sent';
  } catch (err) {
    logger.error(MODULE, 'Filer update could not be sent', err);
    return 'not-sent';
  }
}
