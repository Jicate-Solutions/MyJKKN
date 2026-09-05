/**
 * lib/resend.ts must be importable without RESEND_API_KEY.
 *
 * The Resend constructor throws when the key is absent. While the client was
 * built at module load, that throw happened at IMPORT time — so `next build`
 * died during page-data collection in any environment without the key, naming a
 * route (typically /api/bug-reports/[id]) that had nothing to do with the change
 * being built. CI carries the key and never saw it; the trap was local-only,
 * which is exactly where it made the build gate untrustworthy.
 *
 * These tests pin the three properties that matter: importing never throws, a
 * missing key still fails loudly at first use, and a present key constructs
 * exactly as before.
 *
 * The `resend` package is mocked, so nothing here touches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Every apiKey the constructor was called with, in order. The length is the
  // assertion that matters: 0 means construction has not happened yet.
  constructorCalls: [] as Array<string | undefined>,
}));

vi.mock('resend', () => {
  class Resend {
    key: string | undefined;
    emails: { send: () => Promise<unknown> };
    batch: { send: () => Promise<unknown> };

    constructor(apiKey?: string) {
      mocks.constructorCalls.push(apiKey);
      // Mirrors the real constructor message verbatim (resend 6.9.4).
      if (!apiKey) {
        throw new Error(
          'Missing API key. Pass it to the constructor `new Resend("re_123")`'
        );
      }
      this.key = apiKey;
      this.emails = { send: async () => ({ data: null, error: null }) };
      this.batch = { send: async () => ({ data: null, error: null }) };
    }
  }

  return { Resend };
});

const ORIGINAL_KEY = process.env.RESEND_API_KEY;

function restoreKey() {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIGINAL_KEY;
  }
}

describe('lib/resend lazy initialisation', () => {
  beforeEach(() => {
    // Each test needs a fresh module instance, because the client is memoised.
    vi.resetModules();
    mocks.constructorCalls.length = 0;
  });

  afterEach(restoreKey);

  it('imports without throwing when RESEND_API_KEY is absent', async () => {
    delete process.env.RESEND_API_KEY;

    const mod = await import('@/lib/resend');

    expect(mod.resend).toBeDefined();
    // The whole point: nothing was constructed by the import itself.
    expect(mocks.constructorCalls).toHaveLength(0);
  });

  it('throws with a clear message on first use when the key is absent', async () => {
    delete process.env.RESEND_API_KEY;

    const { resend } = await import('@/lib/resend');

    expect(() => resend.emails).toThrow(/Missing API key/);
    expect(mocks.constructorCalls).toEqual([undefined]);
  });

  it('constructs normally when the key is present', async () => {
    process.env.RESEND_API_KEY = 're_unit_test_key';

    const { resend } = await import('@/lib/resend');
    expect(mocks.constructorCalls).toHaveLength(0);

    expect(resend.emails).toBeDefined();
    expect(mocks.constructorCalls).toEqual(['re_unit_test_key']);
  });

  it('constructs once and reuses the client across property accesses', async () => {
    process.env.RESEND_API_KEY = 're_unit_test_key';

    const { resend } = await import('@/lib/resend');

    const first = resend.emails;
    const second = resend.emails;
    void resend.batch;

    expect(first).toBe(second);
    expect(mocks.constructorCalls).toHaveLength(1);
  });

  it('keeps sends working through the proxied client', async () => {
    process.env.RESEND_API_KEY = 're_unit_test_key';

    const { resend } = await import('@/lib/resend');

    await expect(resend.emails.send({} as never)).resolves.toEqual({
      data: null,
      error: null,
    });
  });
});
