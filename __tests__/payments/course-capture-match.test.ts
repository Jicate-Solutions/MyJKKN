import { describe, it, expect } from 'vitest';
import { courseCaptureMatches } from '@/lib/services/payments/course-settlement';

describe('courseCaptureMatches', () => {
  it('accepts an exact capture (UPI, no fee)', () => {
    expect(courseCaptureMatches(14000000, 0, 14000000)).toBe(true);
  });
  it('accepts order amount plus customer-borne fee (net banking, pay_Tf1JGJEs8rQdSh)', () => {
    expect(courseCaptureMatches(14001888, 1888, 14000000)).toBe(true);
  });
  it('rejects a short capture', () => {
    expect(courseCaptureMatches(13000000, 0, 14000000)).toBe(false);
  });
  it('rejects an overcapture the fee does not explain', () => {
    expect(courseCaptureMatches(14001888, 0, 14000000)).toBe(false);
    expect(courseCaptureMatches(14005000, 1888, 14000000)).toBe(false);
  });
});
