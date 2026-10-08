/**
 * setIgAccountRunner must give up on a save that never answers, so the
 * "Who runs this account" dialog cannot stay stuck on "Saving…" (review on #4270).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { setIgAccountRunner, IG_RUNNER_SAVE_TIMEOUT_MS } from '@/services/instagram-service';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('setIgAccountRunner', () => {
  it('rejects with a retryable message when the request never answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
      )
    );
    const pending = setIgAccountRunner('acc', 'person');
    const settled = expect(pending).rejects.toThrow(/took too long/);
    await vi.advanceTimersByTimeAsync(IG_RUNNER_SAVE_TIMEOUT_MS + 1);
    await settled;
  });

  it('returns the saved row when the request answers in time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ success: true, data: { id: 'acc', connected_by: 'person', connected_by_name: 'Priya' } }),
            { status: 200 }
          )
        )
      )
    );
    await expect(setIgAccountRunner('acc', 'person')).resolves.toEqual({
      id: 'acc',
      connected_by: 'person',
      connected_by_name: 'Priya',
    });
  });
});
