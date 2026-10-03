// lib/instasolver/no-caretaker-note.ts
// ============================================================================
// "This item has no caretaker — please assign one."
//
// Director ruling (1 Oct 2026): when a scanned item has no ACTIVE caretaker
// (none recorded, the caretaker left JKKN, or is inactive), the job goes to
// that college's estate office AND the estate office gets a separate note
// asking them to assign one, with a link to the item's resource page. One note
// per item per 30 days.
//
// "Once per 30 days" is held two ways:
//   1. a rolling read: no note for this item in the last 30 days;
//   2. the database's own guard: notifications.idempotency_key has a partial
//      UNIQUE index, and the key carries a 30-day window number, so two
//      reports landing at the same moment cannot both send one. If the read
//      in (1) fails, (2) still holds — the read fails toward sending.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createBellNotification } from '@/lib/services/meetings/meeting-trigger-service';

export const NO_CARETAKER_CATEGORY = 'instasolver:no-caretaker';
export const NO_CARETAKER_WINDOW_DAYS = 30;
const WINDOW_MS = NO_CARETAKER_WINDOW_DAYS * 86_400_000;

/** The DB-level once-per-window key: same item + same 30-day window = same key. */
export function noCaretakerIdempotencyKey(resourceId: string, now: number = Date.now()): string {
  return `${NO_CARETAKER_CATEGORY}:${resourceId}:${Math.floor(now / WINDOW_MS)}`;
}

/** The note's wording, as the Director gave it. */
export function noCaretakerNoteText(itemName: string, place: string | null | undefined): string {
  const where = (place ?? '').trim();
  return `This item has no caretaker — please assign one: ${itemName.slice(0, 80)}${where ? `, ${where}` : ''}`;
}

export function resourcePageUrl(resourceId: string): string {
  return `/resource-management/resources/${resourceId}`;
}

export type NoCaretakerNoteOutcome = 'sent' | 'already_sent' | 'not_sent' | 'failed';

/**
 * Sends the note unless one went out for this item in the last 30 days.
 * Never throws: the report itself has already been filed.
 */
export async function sendNoCaretakerNote(
  admin: SupabaseClient,
  opts: {
    recipientId: string;
    resourceId: string;
    itemName: string;
    place: string | null;
    taskId: string;
    now?: number;
  }
): Promise<NoCaretakerNoteOutcome> {
  const now = opts.now ?? Date.now();
  try {
    const since = new Date(now - WINDOW_MS).toISOString();
    const { data, error } = await admin
      .from('notifications')
      .select('id')
      .eq('category', NO_CARETAKER_CATEGORY)
      .eq('metadata->>resource_id', opts.resourceId)
      .gte('created_at', since)
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) return 'already_sent';
    if (error) {
      console.warn('[instasolver] no-caretaker note: recent-note read failed, relying on the key:', error.message);
    }
  } catch (e: unknown) {
    console.warn(
      '[instasolver] no-caretaker note: recent-note read threw, relying on the key:',
      e instanceof Error ? e.message : e
    );
  }

  const text = noCaretakerNoteText(opts.itemName, opts.place);
  try {
    const id = await createBellNotification(admin, {
      recipientIds: [opts.recipientId],
      // D10: a campus-walk bell is "from" its own recipient, never the reporter.
      createdBy: opts.recipientId,
      title: text.slice(0, 200),
      body: `${text}. A problem was just reported on it and the job came to you. Open the item to set its caretaker.`,
      url: resourcePageUrl(opts.resourceId),
      category: NO_CARETAKER_CATEGORY,
      metadata: { resource_id: opts.resourceId, task_id: opts.taskId, source: 'campus-walk' },
      idempotencyKey: noCaretakerIdempotencyKey(opts.resourceId, now),
    });
    // null = the unique key already holds a note for this window (23505, not
    // logged), or the insert failed (createBellNotification logged it).
    return id ? 'sent' : 'not_sent';
  } catch (e: unknown) {
    console.error('[instasolver] no-caretaker note failed:', e instanceof Error ? e.message : e);
    return 'failed';
  }
}
