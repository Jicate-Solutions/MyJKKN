import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { checkRateLimit, _resetForTesting } from '../../../lib/api-keys/rate-limiter';

// ---------------------------------------------------------------------------
// Time control
// ---------------------------------------------------------------------------
let mockTime = 1_000_000;
const originalDateNow = Date.now;

beforeEach(() => {
  mockTime = 1_000_000; // reset to a known epoch-ms value
  Date.now = () => mockTime;
  _resetForTesting(); // clear in-memory state between tests
});

afterEach(() => {
  Date.now = originalDateNow;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  it('allows the first request with remaining: 59', () => {
    const result = checkRateLimit('key-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it('allows requests up to the limit and the 60th has remaining: 0', () => {
    for (let i = 0; i < 59; i++) {
      const r = checkRateLimit('key-limit');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(59 - i);
    }

    // 60th request
    const last = checkRateLimit('key-limit');
    expect(last.allowed).toBe(true);
    expect(last.remaining).toBe(0);
  });

  it('blocks the 61st request', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-blocked');
    }

    const result = checkRateLimit('key-blocked');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.resetAt.getTime()).toBeGreaterThan(mockTime);
  });

  it('resets after 60 seconds have elapsed', () => {
    // Fill the window to the limit
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-reset');
    }

    // Confirm blocked before time advance
    expect(checkRateLimit('key-reset').allowed).toBe(false);
    _resetForTesting(); // clear so the 61st block doesn't pollute; re-fill below

    // Refill after reset so the window starts at mockTime
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-reset');
    }

    // Advance time past the 60-second window
    mockTime += 60_001;

    const result = checkRateLimit('key-reset');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });

  it('different keys are independent', () => {
    // Fill key-A to the limit
    for (let i = 0; i < 60; i++) {
      checkRateLimit('key-A');
    }
    expect(checkRateLimit('key-A').allowed).toBe(false);

    // key-B should be completely unaffected
    const result = checkRateLimit('key-B');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
  });
});
