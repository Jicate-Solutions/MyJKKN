// Two live JKKN colleges share a display_name. This screen asks the user to
// rank which college yields a meeting slot, so identical rows are not cosmetic.
import { describe, it, expect, vi } from 'vitest';

// The meetings import chain builds Resend and a browser Supabase client at
// import time; without these the module dies before the first assertion.
vi.mock('@/lib/services/email/meeting-booking-email-service', () => ({}));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn(() => ({})) }));
vi.mock('@/lib/services/integrations/google-calendar-service', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));

import { labelInstitutions } from '@/lib/services/meetings/institution-labels';

// The real production rows, verified 2026-08-31.
const AIDED = { id: 'a33138b6', name: 'JKKN College of Arts and Science (Aided)', display_name: 'JKKN College of Arts and Science (Autonomous)' };
const SELF  = { id: 'b0b8a724', name: 'JKKN College of Arts and Science (Self)',  display_name: 'JKKN College of Arts and Science (Autonomous)' };
const DENTAL = { id: 'd1', name: 'JKKN Dental College', display_name: 'JKKN Dental College and Hospital' };

describe('labelInstitutions', () => {
  it('gives colliding display_names distinct labels', () => {
    const out = labelInstitutions([AIDED, SELF, DENTAL]);
    const aided = out.find((o) => o.id === 'a33138b6')!;
    const self = out.find((o) => o.id === 'b0b8a724')!;
    expect(aided.name).not.toBe(self.name);
    expect(aided.name).toContain('(Aided)');
    expect(self.name).toContain('(Self)');
  });

  it('would FAIL under the old display_name-always rule', () => {
    // Discrimination proof: the previous behaviour collapsed both to one label.
    const old = [AIDED, SELF].map((i) => i.display_name || i.name);
    expect(old[0]).toBe(old[1]); // the bug, reproduced
    const fixed = labelInstitutions([AIDED, SELF]).map((o) => o.name);
    expect(fixed[0]).not.toBe(fixed[1]); // the fix
  });

  it('keeps display_name where it is unique', () => {
    const out = labelInstitutions([AIDED, SELF, DENTAL]);
    expect(out.find((o) => o.id === 'd1')!.name).toBe('JKKN Dental College and Hospital');
  });

  it('falls back to name when display_name is missing', () => {
    const out = labelInstitutions([{ id: 'x', name: 'Only Name', display_name: null }]);
    expect(out[0].name).toBe('Only Name');
  });

  it('handles an empty list', () => {
    expect(labelInstitutions([])).toEqual([]);
  });

  it('disambiguates three-way collisions too', () => {
    const rows = ['A', 'B', 'C'].map((s) => ({ id: s, name: `Real ${s}`, display_name: 'Same Label' }));
    const names = labelInstitutions(rows).map((o) => o.name);
    expect(new Set(names).size).toBe(3);
  });
});
