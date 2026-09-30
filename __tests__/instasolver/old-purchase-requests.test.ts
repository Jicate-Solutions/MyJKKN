// __tests__/instasolver/old-purchase-requests.test.ts
// ============================================================================
// The Director's screen for the old InstaSolver site's purchase requests.
//
//  1. THE SUPER-ADMIN GATE on the API route. The history table has no write
//     policy, so the route writes with the service role — which means this gate
//     is the ONLY thing between a signed-in user and every decision. Pinned:
//     signed out -> 401, not a super admin -> 403, and in both cases the
//     service-role client is never even created.
//  2. The Procurement request an approval raises: one new-item line, quantity 1,
//     a reason (createPurchaseRequest refuses a new-item line without one), and
//     the marker that ties it back to the old row.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BULK_REJECT_OLDER_THAN_DAYS,
  buildPurchaseRequestDto,
  isOlderThanBulkCutoff,
  itemLabel,
  oldRequestMarker,
  rejectionBell,
  validateReason,
} from '@/lib/instasolver/old-purchase-requests';

let sessionUser: { id: string } | null = null;
let isSuperAdmin: boolean | null = null;
const serviceRoleCreated = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: isSuperAdmin === null ? null : { is_super_admin: isSuperAdmin },
            error: null,
          }),
        }),
      }),
    }),
  }),
  createServiceRoleClient: () => {
    serviceRoleCreated();
    throw new Error('the service-role client must not be reached in these tests');
  },
}));

vi.mock('@/lib/services/meetings/meeting-trigger-service', () => ({
  createBellNotification: vi.fn(),
}));

import { POST } from '@/app/api/instasolver/old-purchase-requests/route';

function req(body: unknown) {
  return new Request('http://localhost/api/instasolver/old-purchase-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('super-admin gate', () => {
  beforeEach(() => {
    serviceRoleCreated.mockClear();
  });

  it('refuses a signed-out caller with 401', async () => {
    sessionUser = null;
    const res = await POST(req({ action: 'reject', legacy_id: 1, reason: 'no longer needed' }));
    expect(res.status).toBe(401);
    expect(serviceRoleCreated).not.toHaveBeenCalled();
  });

  it('refuses a signed-in admin who is not a super admin with 403', async () => {
    sessionUser = { id: 'u-admin' };
    isSuperAdmin = false;
    for (const action of ['begin', 'complete', 'release', 'reject', 'bulk_reject']) {
      const res = await POST(req({ action, legacy_id: 1, reason: 'no longer needed' }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
    }
    expect(serviceRoleCreated).not.toHaveBeenCalled();
  });

  it('refuses a caller with no profile row with 403', async () => {
    sessionUser = { id: 'u-ghost' };
    isSuperAdmin = null;
    const res = await POST(req({ action: 'begin', legacy_id: 1 }));
    expect(res.status).toBe(403);
    expect(serviceRoleCreated).not.toHaveBeenCalled();
  });
});

describe('the Procurement request an approval raises', () => {
  const row = {
    legacy_id: 42,
    institution_id: 'inst-1',
    details: 'Two   steel chairs for the office',
    cause: 'Old ones broke',
    clean_category: 'Furniture Related',
    clean_site: 'Engineering College',
    clean_area: 'Offices',
    legacy_location: 'EEE office',
    priority: 'High',
    requested_at: '2025-03-04T09:00:00Z',
  };

  it('is one new-item line, quantity 1, with a reason and the marker', () => {
    const dto = buildPurchaseRequestDto(row);
    expect(dto.institution_id).toBe('inst-1');
    expect(dto.items).toHaveLength(1);
    expect(dto.items[0]).toMatchObject({
      domain_item_id: null,
      item_name: 'Two steel chairs for the office',
      required_quantity: 1,
      item_spec: 'Engineering College — Offices',
    });
    expect(dto.items[0].reason).toContain('Old ones broke');
    expect(dto.notes).toContain('From old InstaSolver, raised 2025-03-04');
    expect(dto.notes).toContain(oldRequestMarker(42));
  });

  it('still carries a reason when the old record had no details', () => {
    const dto = buildPurchaseRequestDto({ ...row, details: null, cause: null });
    expect(dto.items[0].reason?.trim().length).toBeGreaterThan(0);
  });

  it('refuses a row with no college', () => {
    expect(() => buildPurchaseRequestDto({ ...row, institution_id: null })).toThrow(/no college/);
  });

  it('keeps the item name to 120 characters', () => {
    expect(itemLabel({ details: 'y'.repeat(400), clean_category: null }).length).toBeLessThanOrEqual(120);
  });
});

describe('reject reason, bell text and the two-year cutoff', () => {
  it('needs a one-line reason', () => {
    expect(validateReason('')).not.toBeNull();
    expect(validateReason('no')).not.toBeNull();
    expect(validateReason('x'.repeat(301))).not.toBeNull();
    expect(validateReason('Bought already')).toBeNull();
  });

  it('bells the requester with the item and the reason', () => {
    const bell = rejectionBell('Two steel chairs', 'Bought already', '2025-03-04T00:00:00Z');
    expect(bell.title).toBe('Your old purchase request Two steel chairs was closed: Bought already');
    expect(bell.body).toContain('2025-03-04');
  });

  it('counts only requests older than two years', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const day = 86_400_000;
    expect(isOlderThanBulkCutoff(new Date(now.getTime() - (BULK_REJECT_OLDER_THAN_DAYS + 1) * day).toISOString(), now)).toBe(true);
    expect(isOlderThanBulkCutoff(new Date(now.getTime() - 400 * day).toISOString(), now)).toBe(false);
    expect(isOlderThanBulkCutoff(null, now)).toBe(false);
  });
});
