import { describe, it, expect } from 'vitest';

import { formatFirstTouchResponse } from '@/lib/admission/first-touch-response';

// All fixtures are written as UTC instants and asserted in Asia/Kolkata
// (UTC+5:30), which is the timezone every JKKN campus operates in.

describe('formatFirstTouchResponse', () => {
  it('shows the arrival time beside the answer time, not a duration', () => {
    // Sunday 2026-09-06 23:04 IST  ->  Monday 2026-09-07 09:12 IST
    const result = formatFirstTouchResponse(
      '2026-09-06T17:34:00Z',
      '2026-09-07T03:42:00Z',
      { now: new Date('2026-09-07T06:00:00Z') },
    );

    expect(result).not.toBeNull();
    expect(result!.state).toBe('answered');
    expect(result!.arrivedAt).toBe('11:04pm Sun');
    expect(result!.answeredAt).toBe('9:12am Mon');
    expect(result!.label).toBe('Arrived 11:04pm Sun · answered 9:12am Mon');
  });

  it('counts real time across a night — the label spans Sunday to Monday and no working-hours window is applied', () => {
    const result = formatFirstTouchResponse(
      '2026-09-06T17:30:00Z', // Sun 23:00 IST
      '2026-09-07T03:30:00Z', // Mon 09:00 IST — ten real hours later
      { now: new Date('2026-09-07T06:00:00Z') },
    );

    // The ten hours are visible as two clock times on two different days.
    expect(result!.label).toBe('Arrived 11:00pm Sun · answered 9:00am Mon');
    // And no computed duration is emitted for anyone to argue about.
    expect(result!.label).not.toMatch(/hour|hr|min/i);
  });

  it('reads as never contacted — not zero and not blank — when first_touch_at is NULL', () => {
    const result = formatFirstTouchResponse(
      '2026-09-06T17:34:00Z',
      null,
      { now: new Date('2026-09-07T06:00:00Z') },
    );

    expect(result!.state).toBe('awaiting');
    expect(result!.answeredAt).toBeNull();
    expect(result!.label).toBe('Arrived 11:04pm Sun · not yet contacted');
  });

  it('treats an empty string the same as NULL', () => {
    const result = formatFirstTouchResponse(
      '2026-09-06T17:34:00Z',
      '',
      { now: new Date('2026-09-07T06:00:00Z') },
    );

    expect(result!.state).toBe('awaiting');
  });

  it('switches from a weekday to a date once the arrival is more than a week old', () => {
    const result = formatFirstTouchResponse(
      '2026-09-06T17:34:00Z', // Sun 6 Sep 23:04 IST
      '2026-09-07T03:42:00Z',
      { now: new Date('2026-09-20T06:00:00Z') },
    );

    expect(result!.arrivedAt).toBe('11:04pm 6 Sep');
    expect(result!.answeredAt).toBe('9:12am 7 Sep');
  });

  it('renders in Asia/Kolkata regardless of the machine timezone', () => {
    const ist = formatFirstTouchResponse('2026-09-06T17:34:00Z', null, {
      now: new Date('2026-09-07T06:00:00Z'),
    });
    const utc = formatFirstTouchResponse('2026-09-06T17:34:00Z', null, {
      now: new Date('2026-09-07T06:00:00Z'),
      timeZone: 'UTC',
    });

    expect(ist!.arrivedAt).toBe('11:04pm Sun');
    expect(utc!.arrivedAt).toBe('5:34pm Sun');
  });

  it('prints both facts even when first_touch_at precedes created_at, rather than hiding the anomaly', () => {
    const result = formatFirstTouchResponse(
      '2026-09-07T03:42:00Z',
      '2026-09-06T17:34:00Z',
      { now: new Date('2026-09-07T06:00:00Z') },
    );

    expect(result!.state).toBe('answered');
    expect(result!.label).toBe('Arrived 9:12am Mon · answered 11:04pm Sun');
  });

  it('returns null when the arrival time is missing or unparseable, so nothing is rendered', () => {
    expect(formatFirstTouchResponse(null, '2026-09-07T03:42:00Z')).toBeNull();
    expect(formatFirstTouchResponse(undefined, null)).toBeNull();
    expect(formatFirstTouchResponse('not-a-date', null)).toBeNull();
  });

  it('shows midnight as 12:00am, not 0:00am', () => {
    const result = formatFirstTouchResponse(
      '2026-09-06T18:30:00Z', // Mon 00:00 IST
      null,
      { now: new Date('2026-09-07T06:00:00Z') },
    );

    expect(result!.arrivedAt).toBe('12:00am Mon');
  });
});
