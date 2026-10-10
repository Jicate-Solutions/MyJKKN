// BUG-005948 — /billing/scholarships showed "Could not embed because more than
// one relationship was found for 'billing_scholarships' and 'profiles'"
// (PGRST201). billing_scholarships carries TWO foreign keys to profiles
// (fk_billing_scholarships_authorizer and fk_billing_scholarships_created_by), so a
// bare `authorizer:profiles(...)` embed is ambiguous and PostgREST refuses it.
// Every select in the service must name the authorizer FK.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const selects: string[] = [];

function chain(): any {
  const p: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: [], count: 0, error: null });
        }
        if (prop === 'select') {
          return (s: string) => {
            selects.push(s);
            return p;
          };
        }
        return () => p;
      }
    }
  );
  return p;
}

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ from: () => chain() })
}));
vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityForCurrentUser: vi.fn(),
  BillingActivityTemplates: {}
}));

import { BillingScholarshipService } from '@/lib/services/billing/scholarships/billing-scholarship-service';

beforeEach(() => {
  selects.length = 0;
});

describe('billing scholarships — authorizer embed names its foreign key', () => {
  it('the list query never sends a bare profiles embed', async () => {
    await BillingScholarshipService.getBillingScholarships({ page: 1, limit: 10 });
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      expect(s).toMatch(/authorizer:profiles!fk_billing_scholarships_authorizer\s*\(/);
      expect(s).not.toMatch(/authorizer:profiles\s*\(/);
    }
  });

  it('the single-scholarship query names it too', async () => {
    await BillingScholarshipService.getBillingScholarship('00000000-0000-0000-0000-000000000000').catch(() => undefined);
    expect(selects.some((s) => /authorizer:profiles!fk_billing_scholarships_authorizer\s*\(/.test(s))).toBe(true);
    expect(selects.some((s) => /authorizer:profiles\s*\(/.test(s))).toBe(false);
  });
});
