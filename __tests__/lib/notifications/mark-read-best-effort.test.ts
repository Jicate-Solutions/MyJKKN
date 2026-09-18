/**
 * Notification bell — a failed mark-as-read degrades, it does not reject.
 *
 * Sentry JAVASCRIPT-NEXTJS-3N, culprit /dashboard, 32 events since 2026-05-18:
 * "UnhandledRejection: Object captured as promise rejection with keys: code,
 * details, hint, message". A student tapped a notification row on a phone that
 * had lost the network; the PATCH to user_notifications failed, supabase-js
 * returned its PostgrestError shape, notification-service.markAsRead() rethrew
 * it, and the bell's async onClick handler returned a promise nobody awaited.
 *
 * The rejected value in these tests is the REAL shape supabase-js produces for
 * a failed fetch — the four keys Sentry named in the title.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { markReadBestEffort } from '@/lib/notifications/mark-read-best-effort';

// The exact object supabase-js hands back when the fetch itself fails.
const SUPABASE_FETCH_ERROR = {
  code: '',
  details: 'TypeError: Failed to fetch',
  hint: '',
  message: 'TypeError: Failed to fetch'
};

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('markReadBestEffort', () => {
  it('resolves to false instead of rejecting when the write fails', async () => {
    const markRead = vi.fn().mockRejectedValue(SUPABASE_FETCH_ERROR);

    // The assertion that pins the bug: this call must SETTLE, not reject.
    await expect(
      markReadBestEffort(markRead, 'n-1')
    ).resolves.toBe(false);

    expect(markRead).toHaveBeenCalledWith('n-1');
  });

  it('leaves no unhandled rejection behind for the runtime to report', async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      await markReadBestEffort(
        () => Promise.reject(SUPABASE_FETCH_ERROR),
        'n-2'
      );
      // Let the microtask queue drain so a genuine escape would be reported.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(seen).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('logs the Supabase error code and message so the failure is diagnosable', async () => {
    await markReadBestEffort(
      () => Promise.reject({ ...SUPABASE_FETCH_ERROR, code: 'PGRST301' }),
      'n-3'
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [prefix, , data] = warnSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>
    ];
    expect(prefix).toBe('[notifications]');
    expect(data).toMatchObject({
      notificationId: 'n-3',
      code: 'PGRST301',
      message: 'TypeError: Failed to fetch'
    });
  });

  it('survives a thrown Error, which carries no code', async () => {
    await expect(
      markReadBestEffort(() => Promise.reject(new Error('boom')), 'n-4')
    ).resolves.toBe(false);

    const [, , data] = warnSpy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>
    ];
    expect(data).toMatchObject({ code: null, message: 'boom' });
  });

  it('reports true when the write succeeds', async () => {
    const markRead = vi.fn().mockResolvedValue(undefined);

    await expect(markReadBestEffort(markRead, 'n-5')).resolves.toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
