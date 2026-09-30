// __tests__/campus-walk/my-reports.test.ts
// ============================================================================
// lib/campus-walk/my-reports.ts — what the reporter sees, and when the
// "Not fixed" button shows. The page and the route share these helpers so the
// button on screen and the rule behind it cannot disagree about the 7 days.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { canSayNotFixed, reportStatusOf, withinNotFixedWindow } from '@/lib/campus-walk/my-reports';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe('the Not fixed window', () => {
  it('is open for 7 days after the job was closed, and shut after', () => {
    expect(withinNotFixedWindow(ago(0), NOW)).toBe(true);
    expect(withinNotFixedWindow(ago(7), NOW)).toBe(true);
    expect(withinNotFixedWindow(ago(7.01), NOW)).toBe(false);
    expect(withinNotFixedWindow(null, NOW)).toBe(false);
    expect(withinNotFixedWindow('not a date', NOW)).toBe(false);
  });

  it('shows the button only on a closed job inside the window', () => {
    expect(canSayNotFixed({ status_key: 'done', completed_at: ago(2) }, NOW)).toBe(true);
    expect(canSayNotFixed({ status_key: 'done', completed_at: ago(9) }, NOW)).toBe(false);
    expect(canSayNotFixed({ status_key: 'in_progress', completed_at: null }, NOW)).toBe(false);
    expect(canSayNotFixed({ status_key: 'review', completed_at: null }, NOW)).toBe(false);
  });
});

describe('the status in plain words', () => {
  it('reads each state the way a reporter would say it', () => {
    expect(reportStatusOf({ status_key: 'done', metadata: {} })).toBe('fixed');
    expect(reportStatusOf({ status_key: 'todo', metadata: {} })).toBe('open');
    expect(reportStatusOf({ status_key: 'review', metadata: {} })).toBe('being_checked');
    expect(reportStatusOf({ status_key: 'cancelled', metadata: {} })).toBe('cancelled');
    expect(
      reportStatusOf({
        status_key: 'in_progress',
        metadata: { fix: { approval: { state: 'changes_requested', reopened_by_reporter: true } } },
      })
    ).toBe('reopened');
    // A manager's old "send back" is not the reporter reopening it.
    expect(
      reportStatusOf({ status_key: 'in_progress', metadata: { fix: { approval: { state: 'changes_requested' } } } })
    ).toBe('open');
  });
});
