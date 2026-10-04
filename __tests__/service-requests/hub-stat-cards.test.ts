import { describe, it, expect } from 'vitest';
import { buildHubStatCards } from '@/app/(routes)/service-requests/_components/hub-stat-cards';

// BUG-006055 / BUG-006014 / BUG-006007: an approver saw "4 Pending" on the hub
// while the Pending Approvals tab listed 1 — the card counted every visible
// request still in flight (including ones waiting on another approver), the
// tab only the ones waiting on them.
describe('service-requests hub stat cards', () => {
  // 4 requests in flight across the institution; 1 is waiting on this viewer.
  const counts = { draft: 0, submitted: 1, in_review: 3, approved: 5, rejected: 2 };

  it('does not call the institution-wide in-flight count "Pending"', () => {
    const cards = buildHubStatCards(counts, 1);
    expect(cards.map((c) => c.label)).not.toContain('Pending');
    const inFlight = cards.find((c) => c.key === 'in_progress')!;
    expect(inFlight.label).toBe('In progress');
    expect(inFlight.value).toBe(4);
  });

  it("states the approver's own queue total, the number the Pending Approvals tab shows", () => {
    const inFlight = buildHubStatCards(counts, 1).find((c) => c.key === 'in_progress')!;
    expect(inFlight.caption).toBe('1 waiting on you');
  });

  it('says whose step it is when the viewer cannot approve', () => {
    const inFlight = buildHubStatCards(counts, null).find((c) => c.key === 'in_progress')!;
    expect(inFlight.caption).toBe('Waiting on any approver');
  });

  it('keeps total, approved and rejected as before', () => {
    const byKey = Object.fromEntries(buildHubStatCards(counts, 1).map((c) => [c.key, c.value]));
    expect(byKey).toEqual({ total: 11, in_progress: 4, approved: 5, rejected: 2 });
  });

  // Types with auto_fulfill_on_approval jump straight to 'fulfilled' and never
  // occupy 'approved' — Dental had 39 fulfilled requests under "Approved 0".
  it('counts fulfilled requests as approved', () => {
    const approved = buildHubStatCards({ ...counts, fulfilled: 39 }, null).find(
      (c) => c.key === 'approved'
    )!;
    expect(approved.value).toBe(44);
  });

  it("states the approver's own decisions under Approved and Rejected", () => {
    const byKey = Object.fromEntries(
      buildHubStatCards(counts, 1, { approved: 7, rejected: 2 }).map((c) => [c.key, c.caption])
    );
    expect(byKey.approved).toBe('7 by you');
    expect(byKey.rejected).toBe('2 by you');
  });

  it('adds no decision captions when the viewer cannot approve or they are not loaded', () => {
    for (const cards of [buildHubStatCards(counts, null), buildHubStatCards(counts, 1, null)]) {
      const byKey = Object.fromEntries(cards.map((c) => [c.key, c.caption]));
      expect(byKey.approved).toBeNull();
      expect(byKey.rejected).toBeNull();
    }
  });
});
