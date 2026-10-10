/**
 * GoogleCalendarService.patchEventTimeOutcome: which kind of "no" it was
 * (10 Oct 2026, the three-lens pass on #4300). moveDirect puts the meeting
 * back only on 'refused'; on 'unknown' Google may already have told invitees.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));

import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';

const svc = GoogleCalendarService as unknown as { accessTokenForHost: (...a: unknown[]) => Promise<string | null> };
const realToken = svc.accessTokenForHost;
const fetchMock = vi.fn();

beforeEach(() => {
  svc.accessTokenForHost = vi.fn(async () => 'tok');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  svc.accessTokenForHost = realToken;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const call = () =>
  GoogleCalendarService.patchEventTimeOutcome({} as never, 'h', 'ev', '2099-01-01T05:00:00Z', '2099-01-01T05:30:00Z', 'Asia/Kolkata');

describe('patchEventTimeOutcome', () => {
  it('2xx = applied', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    expect(await call()).toBe('applied');
  });
  it('4xx = refused (Google did not apply it)', async () => {
    for (const status of [400, 403, 404, 409]) {
      fetchMock.mockResolvedValue({ ok: false, status });
      expect(await call()).toBe('refused');
    }
  });
  it('5xx or 408 = unknown (Google may have applied it)', async () => {
    for (const status of [408, 500, 502, 503, 504]) {
      fetchMock.mockResolvedValue({ ok: false, status });
      expect(await call()).toBe('unknown');
    }
  });
  it('no answer to the PATCH = unknown', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    expect(await call()).toBe('unknown');
  });
  it('the PATCH carries an abort signal, so a hung Google call ends (and counts as unknown)', async () => {
    let signal: unknown;
    fetchMock.mockImplementation(async (_url: string, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    });
    expect(await call()).toBe('unknown');
    // checked outside the fake, so a missing signal fails the test
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('a hung token step gives up after 5 s as refused (the PATCH was never sent)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      svc.accessTokenForHost = vi.fn(() => new Promise<string | null>(() => {}));
      const pending = call();
      await vi.advanceTimersByTimeAsync(5_100);
      expect(await pending).toBe('refused');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('no calendar access, or the token step failing before the PATCH = refused (never sent)', async () => {
    svc.accessTokenForHost = vi.fn(async () => null);
    expect(await call()).toBe('refused');
    svc.accessTokenForHost = vi.fn(async () => {
      throw new Error('token fetch failed');
    });
    expect(await call()).toBe('refused');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
