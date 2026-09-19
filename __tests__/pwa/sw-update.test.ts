/**
 * Guards for the service-worker update wrapper.
 *
 * The bug this locks down (Sentry 7459568684 / JAVASCRIPT-NEXTJS-1J and
 * 7514970624 / JAVASCRIPT-NEXTJS-41): `registration.update()` was called as a
 * floating promise on a 30-minute timer, so a failed update check became an
 * unhandled rejection and was reported as a user-facing error — 309 events
 * across 23 users. A failed UPDATE is benign; the active worker keeps serving.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  safeServiceWorkerUpdate,
  __resetSwUpdateStateForTests
} from '@/components/pwa/sw-update';

type FakeRegistration = {
  active: unknown;
  update: () => Promise<void>;
};

function registrationThat(update: () => Promise<void>): FakeRegistration {
  return { active: {}, update };
}

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator'
);

function setOnline(onLine: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine },
    configurable: true,
    writable: true
  });
}

describe('safeServiceWorkerUpdate', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetSwUpdateStateForTests();
    setOnline(true);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator);
    } else {
      // Restoring an environment that had no navigator.
      Reflect.deleteProperty(globalThis, 'navigator');
    }
  });

  it('does not throw when update() rejects, and warns with the error name', async () => {
    const error = new TypeError(
      "Failed to update a ServiceWorker for scope ('https://www.jkkn.ai/') with script ('https://www.jkkn.ai/sw.js'): An unknown error occurred when fetching the script."
    );
    const registration = registrationThat(() => Promise.reject(error));

    const outcome = await safeServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration
    );

    expect(outcome).toBe('failed');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('TypeError');
  });

  it('swallows the InvalidStateError variant the same way', async () => {
    const error = new Error('Failed to update a ServiceWorker for scope (...)');
    error.name = 'InvalidStateError';
    const registration = registrationThat(() => Promise.reject(error));

    await expect(
      safeServiceWorkerUpdate(
        registration as unknown as ServiceWorkerRegistration
      )
    ).resolves.toBe('failed');
    expect(String(warn.mock.calls[0][0])).toContain('InvalidStateError');
  });

  it('calls update() and reports success when the check works', async () => {
    const update = vi.fn(() => Promise.resolve());
    const outcome = await safeServiceWorkerUpdate(
      registrationThat(update) as unknown as ServiceWorkerRegistration
    );

    expect(outcome).toBe('updated');
    expect(update).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips the call entirely when the browser reports itself offline', async () => {
    setOnline(false);
    const update = vi.fn(() => Promise.resolve());

    const outcome = await safeServiceWorkerUpdate(
      registrationThat(update) as unknown as ServiceWorkerRegistration
    );

    expect(outcome).toBe('offline');
    expect(update).not.toHaveBeenCalled();
  });

  it('skips a registration with no active worker — the InvalidStateError state', async () => {
    const update = vi.fn(() => Promise.resolve());

    expect(
      await safeServiceWorkerUpdate(
        { active: null, update } as unknown as ServiceWorkerRegistration
      )
    ).toBe('not-active');
    expect(await safeServiceWorkerUpdate(null)).toBe('not-active');
    expect(await safeServiceWorkerUpdate(undefined)).toBe('not-active');
    expect(update).not.toHaveBeenCalled();
  });

  it('allows at most one update check in flight at a time', async () => {
    // Every call to update() parks until its own resolver is called, so the
    // second call is measured while the first is genuinely still running.
    const resolvers: Array<() => void> = [];
    const update = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const registration = registrationThat(
      update
    ) as unknown as ServiceWorkerRegistration;

    const first = safeServiceWorkerUpdate(registration);
    const second = await safeServiceWorkerUpdate(registration);

    expect(second).toBe('in-flight');
    expect(update).toHaveBeenCalledTimes(1);

    resolvers[0]();
    expect(await first).toBe('updated');

    // The latch clears, so the next tick of the 30-minute poll still runs.
    const third = safeServiceWorkerUpdate(registration);
    expect(update).toHaveBeenCalledTimes(2);
    resolvers[1]();
    expect(await third).toBe('updated');
  });

  it('releases the in-flight latch after a rejection', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to update a ServiceWorker'))
      .mockResolvedValueOnce(undefined);
    const registration = registrationThat(
      update as unknown as () => Promise<void>
    ) as unknown as ServiceWorkerRegistration;

    expect(await safeServiceWorkerUpdate(registration)).toBe('failed');
    expect(await safeServiceWorkerUpdate(registration)).toBe('updated');
  });
});
