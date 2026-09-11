/**
 * The applicant's approved / rejected email (2026-09-11): subjects, bodies,
 * escaping of approver-typed text, and bare-date formatting.
 */

import { describe, expect, it } from 'vitest';

import {
  buildDecisionEmail,
  formatEmailDate,
  formatEmailDateRange,
  type DecisionEmailDetails,
} from '@/lib/hr/leave/decision-email-template';

const leave = (p: Partial<DecisionEmailDetails> = {}): DecisionEmailDetails => ({
  kind: 'leave',
  decision: 'approved',
  staffName: 'Anita K',
  typeName: 'Casual Leave',
  startDate: '2026-09-14',
  endDate: '2026-09-15',
  totalDays: '2.00',
  decidedBy: 'Dr S. Principal',
  link: 'https://my.jkkn.ac.in/hr/leave/app-1',
  ...p,
});

describe('dates', () => {
  it('formats bare dates without a timezone shift', () => {
    expect(formatEmailDate('2026-09-01')).toBe('1 Sep 2026');
    expect(formatEmailDateRange('2026-09-14', '2026-09-14')).toBe('14 Sep 2026');
    expect(formatEmailDateRange('2026-09-14', '2026-09-15')).toBe('14–15 Sep 2026');
    expect(formatEmailDateRange('2026-09-30', '2026-10-02')).toBe('30 Sep – 2 Oct 2026');
    expect(formatEmailDateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
  });
});

describe('leave', () => {
  it('approved: subject, lead, details and link', () => {
    const e = buildDecisionEmail(leave());
    expect(e.subject).toBe('Approved: Casual Leave, 14–15 Sep 2026');
    expect(e.text).toContain('Your Casual Leave request for 14–15 Sep 2026 has been approved.');
    expect(e.text).toContain('Duration: 2 days');
    expect(e.text).toContain('Decided by: Dr S. Principal');
    expect(e.text).not.toContain('Reason:');
    expect(e.html).toContain('href="https://my.jkkn.ac.in/hr/leave/app-1"');
  });

  it('a half day says which half', () => {
    const e = buildDecisionEmail(
      leave({ endDate: '2026-09-14', totalDays: 0.5, durationLabel: 'First half (AM)' })
    );
    expect(e.subject).toBe('Approved: Casual Leave, 14 Sep 2026');
    expect(e.text).toContain('Duration: 0.5 days · First half (AM)');
  });

  it('rejected carries the reason, escaped in the HTML', () => {
    const e = buildDecisionEmail(
      leave({ decision: 'rejected', rejectionReason: '<script>alert(1)</script> & "exam week"' })
    );
    expect(e.subject).toBe('Rejected: Casual Leave, 14–15 Sep 2026');
    expect(e.text).toContain('Reason: <script>alert(1)</script> & "exam week"');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;exam week&quot;');
    expect(e.html).not.toContain('<script>alert(1)');
  });

  it('a rejection with no reason says so', () => {
    expect(buildDecisionEmail(leave({ decision: 'rejected' })).text).toContain('Reason: No reason given');
  });

  it('no link, no button', () => {
    expect(buildDecisionEmail(leave({ link: null })).html).not.toContain('View in MyJKKN');
  });
});

describe('short time off', () => {
  it('names the date and time window, and the hours', () => {
    const e = buildDecisionEmail(
      leave({
        kind: 'short_time_off',
        typeName: 'Permission',
        startDate: '2026-09-12',
        endDate: '2026-09-12',
        startTime: '10:00:00',
        endTime: '11:30:00',
        durationMinutes: 90,
        totalDays: null,
      })
    );
    expect(e.subject).toBe('Approved: Permission on 12 Sep 2026, 10:00–11:30');
    expect(e.text).toContain('Time: 10:00–11:30');
    expect(e.text).toContain('Duration: 1.5 hours');
  });
});

describe('comp-off', () => {
  const claim = (p: Partial<DecisionEmailDetails> = {}): DecisionEmailDetails => ({
    kind: 'comp_off',
    decision: 'approved',
    staffName: 'Priya Raman',
    workedDate: '2026-09-06',
    workLocation: 'Outside campus',
    workPlace: 'Chennai – NAAC visit',
    expiresOn: '2026-10-06',
    creditDays: 1,
    link: 'https://my.jkkn.ac.in/hr/leave/compensatory-off',
    ...p,
  });

  it('approved: the credit and how long it lasts', () => {
    const e = buildDecisionEmail(claim());
    expect(e.subject).toBe('Approved: Comp-off claim for 6 Sep 2026');
    expect(e.text).toContain('Your compensatory off claim for working on 6 Sep 2026 has been approved.');
    expect(e.text).toContain('Location: Outside campus — Chennai – NAAC visit');
    expect(e.text).toContain('usable until 6 Oct 2026');
  });

  it('rejected: no credit lines, the reason instead', () => {
    const e = buildDecisionEmail(claim({ decision: 'rejected', rejectionReason: 'No duty order' }));
    expect(e.subject).toBe('Rejected: Comp-off claim for 6 Sep 2026');
    expect(e.text).toContain('Reason: No duty order');
    expect(e.text).not.toContain('Use it by');
  });
});
