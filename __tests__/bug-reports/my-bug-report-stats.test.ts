import { describe, it, expect } from 'vitest';
import { computeMyBugReportStats } from '@/app/(routes)/my-bug-reports/_components/report-stats';

// BUG-003465: a reporter's untouched (`new`) reports were counted in Total but
// in no other card, so "Total 3 · Resolved 1 · In Progress 0" left two
// still-open reports unaccounted for.
describe('My Bug Reports stat cards', () => {
  const reports = [
    { status: 'new' },
    { status: 'new' },
    { status: 'seen' },
    { status: 'in_progress' },
    { status: 'resolved' },
    { status: 'wont_fix' },
  ];

  it('counts a new (unopened) report as open', () => {
    const s = computeMyBugReportStats(reports);
    expect(s.open).toBe(4);
    expect(s.new).toBe(2);
  });

  it('every report lands in exactly one of open / resolved / closed-other', () => {
    const s = computeMyBugReportStats(reports);
    const closedOther = reports.length - s.open - s.resolved;
    expect(closedOther).toBe(1); // the wont_fix one
    expect(s.total).toBe(reports.length);
  });

  it('handles no reports', () => {
    expect(computeMyBugReportStats(undefined)).toMatchObject({ total: 0, open: 0, successRate: 0 });
  });

  it('keeps success rate as resolved / total', () => {
    expect(computeMyBugReportStats(reports).successRate).toBe(17);
  });
});
