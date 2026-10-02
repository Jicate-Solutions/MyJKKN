// lib/notifications/mark-read-best-effort.ts
//
// Marking a notification read is BEST-EFFORT. The click it belongs to must
// still navigate, and a failed write must never escape as a promise rejection.
//
// Sentry JAVASCRIPT-NEXTJS-3N (32 events, first 2026-05-18, culprit /dashboard):
// "UnhandledRejection: Object captured as promise rejection with keys: code,
// details, hint, message". A student on an intermittently-offline Android phone
// tapped a row in the notification bell; the PATCH to user_notifications failed
// with a network error, supabase-js returned its PostgrestError shape
// ({ code, details, hint, message }), notification-service.markAsRead() rethrew
// it, and the bell's async onClick handler had nobody awaiting or catching the
// promise it returned. The read never got marked AND the navigation never ran.
//
// Degrading here keeps both halves of the click honest: the row stays unread
// (the server is the source of truth and it did not accept the write), and the
// caller carries on to the destination.

import { logger } from '@/lib/utils/enhanced-logger';

/**
 * Run a mark-as-read write without letting it reject.
 *
 * @param markRead        performs the write (e.g. a React Query `mutateAsync`)
 * @param notificationId  the row being marked
 * @returns true when the write succeeded, false when it was swallowed
 */
export async function markReadBestEffort(
  markRead: (notificationId: string) => Promise<unknown>,
  notificationId: string
): Promise<boolean> {
  try {
    await markRead(notificationId);
    return true;
  } catch (error) {
    // Supabase hands back { code, details, hint, message }; a thrown Error has
    // `message` only. Read both shapes defensively — this path exists precisely
    // because something already went wrong.
    const shape = (error ?? {}) as {
      code?: unknown;
      details?: unknown;
      message?: unknown;
    };
    logger.warn(
      'notifications',
      'mark-as-read failed; leaving the row unread and continuing',
      {
        notificationId,
        code: typeof shape.code === 'string' ? shape.code : null,
        details: typeof shape.details === 'string' ? shape.details : null,
        message:
          typeof shape.message === 'string' ? shape.message : String(error)
      }
    );
    return false;
  }
}
