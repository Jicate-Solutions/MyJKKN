// The two writers of the "small fields" the 2026-10-01 rulings still allow on
// the record of someone with admin powers (photo, attendance machine code).
// Both write through the signed-in client, so the database guard decides; what
// is tested here is that a refusal is never reported as success and never
// leaves a machine half-saved by surprise.
//
//   BiometricMappingService.saveMappings — validate first, write only changed
//     people, name the person a refusal hit
//   StorageService.bulkUploadStaffPhotos — a refused photo write lands in failed

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; first_name: string; last_name: string; biometric_id: string | null; biometric_institution_id: string | null };

const m = vi.hoisted(() => ({
  rows: [] as Row[],
  refuse: new Set<string>(), // staff ids whose update the database refuses
  silent: new Set<string>(), // staff ids whose update matches no row (RLS)
  updates: [] as Array<{ id: string; values: Record<string, unknown> }>,
}));

// A Supabase client over m.rows that understands the calls these two writers make.
function fake() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'hr-1' } }, error: null }) },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/${p}` } }),
      }),
    },
    from: () => {
      const filters: Array<[string, string, unknown]> = [];
      let values: Record<string, unknown> | null = null;
      const result = () => {
        if (values) {
          const target = filters.find(([op, k]) => op === 'eq' && k === 'id')?.[2] as string;
          if (m.refuse.has(target)) return { data: null, error: { message: 'Only a super admin can change the record of someone with admin powers.' } };
          if (m.silent.has(target)) return { data: [], error: null };
          m.updates.push({ id: target, values });
          return { data: [{ id: target }], error: null };
        }
        // staff_id (the printed code) is the same as id in these fixtures
        const rows = m.rows
          .map((r) => ({ ...r, staff_id: r.id, institution: { name: 'JKKN' } }) as Record<string, unknown>)
          .filter((r) => filters.every(([op, k, v]) => (op === 'eq' ? r[k] === v : (v as unknown[]).includes(r[k]))));
        return { data: rows, error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        update: (v: Record<string, unknown>) => { values = v; return chain; },
        eq: (k: string, v: unknown) => { filters.push(['eq', k, v]); return chain; },
        in: (k: string, v: unknown) => { filters.push(['in', k, v]); return chain; },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => fake() }));

import { BiometricMappingService } from '@/lib/services/hr/biometric-mapping-service';
import { StorageService } from '@/lib/storage/storage-service';

const MACHINE = 'machine-1';
const person = (id: string, code: string | null): Row => ({
  id, first_name: id.toUpperCase(), last_name: 'X', biometric_id: code, biometric_institution_id: code ? MACHINE : null,
});

beforeEach(() => {
  m.rows = [person('a', '1'), person('b', '2'), person('c', null)];
  m.refuse = new Set();
  m.silent = new Set();
  m.updates = [];
});

describe('BiometricMappingService.saveMappings', () => {
  const save = (assignments: Array<{ code: string; staffId: string | null }>) =>
    BiometricMappingService.saveMappings(fake() as never, { institutionId: MACHINE, assignments });

  it('writes only the people whose code changes', async () => {
    const n = await save([{ code: '1', staffId: 'a' }, { code: '2', staffId: 'b' }, { code: '3', staffId: 'c' }]);
    expect(n).toBe(1);
    expect(m.updates).toEqual([{ id: 'c', values: { biometric_id: '3', biometric_institution_id: MACHINE } }]);
  });

  it('validates first: a code given twice, or a person twice, writes nothing', async () => {
    await expect(save([{ code: '7', staffId: 'a' }, { code: '7', staffId: 'c' }])).rejects.toThrow(/Code 7 is given to two people/);
    await expect(save([{ code: '7', staffId: 'a' }, { code: '8', staffId: 'a' }])).rejects.toThrow(/more than one code/);
    await expect(save([{ code: '7', staffId: 'nobody' }])).rejects.toThrow(/could not be found. Nothing was saved/);
    expect(m.updates).toHaveLength(0);
  });

  it('a refused write names the person and stops the save', async () => {
    m.refuse.add('c');
    await expect(save([{ code: '1', staffId: 'a' }, { code: '2', staffId: 'b' }, { code: '3', staffId: 'c' }]))
      .rejects.toThrow(/Could not save the code for C X: Only a super admin.*Nothing was saved/);
  });

  it('a write that matched no row is a refusal too, not a success', async () => {
    m.silent.add('c');
    await expect(save([{ code: '1', staffId: 'a' }, { code: '2', staffId: 'b' }, { code: '3', staffId: 'c' }]))
      .rejects.toThrow(/Could not save the code for C X/);
  });
});

describe('StorageService.bulkUploadStaffPhotos', () => {
  const photo = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });

  it('a refused photo write is reported as failed with the reason, not as success', async () => {
    m.refuse.add('a');
    const r = await StorageService.bulkUploadStaffPhotos([photo('a.jpg'), photo('b.jpg')]);
    expect(r.success.map((s) => s.staff_id)).toEqual(['b']);
    expect(r.failed).toEqual([
      { filename: 'a.jpg', staff_id: 'a', error: 'Only a super admin can change the record of someone with admin powers.' },
    ]);
  });

  it('a write that matched no row is failed too', async () => {
    m.silent.add('b');
    const r = await StorageService.bulkUploadStaffPhotos([photo('b.jpg')]);
    expect(r.success).toHaveLength(0);
    expect(r.failed[0].error).toMatch(/cannot change this person's record/);
  });
});
