// =====================================================================
// PDE Tier 6 (T6.4) — KPI service tests
// =====================================================================
// Covers:
//   1. Empty data → ratio=0, no divide-by-zero, no crash.
//   2. 10 onboarded / 6 active → ratio = 60.0% exactly (target boundary).
//   3. Per-institution aggregation correctness.
//   4. Per-category aggregation correctness.
//   5. getKpiTarget returns the locked 60% / 90d shape.
// =====================================================================

import { describe, it, expect } from 'vitest';

import { computeKpiSnapshot, getKpiTarget } from '@/lib/services/pde-kpi-service';

type Row = Record<string, unknown>;

// Minimal in-memory Supabase mock supporting:
//   from(table).select(...).gte(col, val)
// and resolving to { data, error }.
function mockSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let working = [...rows];
      const builder: any = {
        select: (_cols: string) => builder,
        gte: (col: string, val: string) => {
          working = working.filter((r) => {
            const v = r[col];
            return typeof v === 'string' && v >= val;
          });
          return builder;
        },
        then: (resolve: (v: { data: Row[]; error: null }) => void) =>
          Promise.resolve({ data: working, error: null }).then(resolve),
      };
      return builder;
    },
  } as any;
}

const NOW_ISO = new Date().toISOString();

describe('pde-kpi-service', () => {
  describe('getKpiTarget', () => {
    it('returns the Director-locked 60% / 90d shape', () => {
      const t = getKpiTarget();
      expect(t.metric).toBe('active_use_ratio_90d');
      expect(t.target).toBe(0.6);
      expect(t.deadline_days).toBe(90);
    });
  });

  describe('computeKpiSnapshot — empty data', () => {
    it('returns ratio=0 without dividing by zero', async () => {
      const sb = mockSupabase({
        pde_coordinator_onboarding_log: [],
        pde_demonstrations: [],
        pde_bridge_audit: [],
        institutions: [],
      });
      const snap = await computeKpiSnapshot(sb);

      expect(snap.active_use_ratio).toBe(0);
      expect(snap.active_count).toBe(0);
      expect(snap.total_onboarded_count).toBe(0);
      expect(snap.per_institution).toEqual([]);
      expect(snap.per_category).toEqual([]);
      expect(Array.isArray(snap.rolling_trend)).toBe(true);
      // sanity: trend points still contain 90 entries, all ratio=0
      expect(snap.rolling_trend.length).toBe(90);
      for (const p of snap.rolling_trend) {
        expect(p.ratio).toBe(0);
        expect(p.active_count).toBe(0);
      }
    });
  });

  describe('computeKpiSnapshot — 10 onboarded / 6 active hits 60% target', () => {
    it('returns active_use_ratio = 60.0 exactly', async () => {
      const instA = '00000000-0000-0000-0000-00000000000a';
      // 10 unique coordinator uuids
      const coords = Array.from({ length: 10 }, (_, i) =>
        `c0000000-0000-0000-0000-${String(i).padStart(12, '0')}`
      );

      const onboarded = coords.map((c) => ({
        coordinator_id: c,
        institution_id: instA,
        onboarded_at: NOW_ISO,
      }));

      // First 6 coordinators have a demonstration in the lookback window.
      const demos = coords.slice(0, 6).map((c) => ({
        created_by: c,
        validator_ids: [],
        institution_id: instA,
        category_key: 'cat_x',
        scored_at: null,
        created_at: NOW_ISO,
      }));

      const sb = mockSupabase({
        pde_coordinator_onboarding_log: onboarded,
        pde_demonstrations: demos,
        pde_bridge_audit: [],
        institutions: [{ id: instA, name: 'College A' }],
      });

      const snap = await computeKpiSnapshot(sb);
      expect(snap.total_onboarded_count).toBe(10);
      expect(snap.active_count).toBe(6);
      expect(snap.active_use_ratio).toBe(60.0);
    });
  });

  describe('computeKpiSnapshot — per-institution aggregation', () => {
    it('splits active/total across institutions correctly', async () => {
      const instA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const instB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const c1 = 'c0000000-0000-0000-0000-000000000001';
      const c2 = 'c0000000-0000-0000-0000-000000000002';
      const c3 = 'c0000000-0000-0000-0000-000000000003';
      const c4 = 'c0000000-0000-0000-0000-000000000004';

      const onboarded = [
        { coordinator_id: c1, institution_id: instA, onboarded_at: NOW_ISO },
        { coordinator_id: c2, institution_id: instA, onboarded_at: NOW_ISO },
        { coordinator_id: c3, institution_id: instB, onboarded_at: NOW_ISO },
        { coordinator_id: c4, institution_id: instB, onboarded_at: NOW_ISO },
      ];
      // c1 and c3 are active (one per institution)
      const demos = [
        {
          created_by: c1,
          validator_ids: [],
          institution_id: instA,
          category_key: 'cat_x',
          scored_at: null,
          created_at: NOW_ISO,
        },
        {
          created_by: c3,
          validator_ids: [],
          institution_id: instB,
          category_key: 'cat_y',
          scored_at: NOW_ISO,
          created_at: NOW_ISO,
        },
      ];

      const sb = mockSupabase({
        pde_coordinator_onboarding_log: onboarded,
        pde_demonstrations: demos,
        pde_bridge_audit: [],
        institutions: [
          { id: instA, name: 'A College' },
          { id: instB, name: 'B College' },
        ],
      });

      const snap = await computeKpiSnapshot(sb);
      expect(snap.per_institution.length).toBe(2);
      const a = snap.per_institution.find((r) => r.institution_id === instA);
      const b = snap.per_institution.find((r) => r.institution_id === instB);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a!.active).toBe(1);
      expect(a!.total).toBe(2);
      expect(a!.ratio).toBe(50.0);
      expect(b!.active).toBe(1);
      expect(b!.total).toBe(2);
      expect(b!.ratio).toBe(50.0);
      // Names sorted alphabetically
      expect(snap.per_institution[0].name).toBe('A College');
      expect(snap.per_institution[1].name).toBe('B College');
    });
  });

  describe('computeKpiSnapshot — per-category aggregation', () => {
    it('counts demonstrations and scored per category', async () => {
      const c1 = 'c0000000-0000-0000-0000-000000000001';
      const inst = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const onboarded = [
        { coordinator_id: c1, institution_id: inst, onboarded_at: NOW_ISO },
      ];
      const demos = [
        { created_by: c1, validator_ids: [], institution_id: inst, category_key: 'authoring', scored_at: NOW_ISO, created_at: NOW_ISO },
        { created_by: c1, validator_ids: [], institution_id: inst, category_key: 'authoring', scored_at: null, created_at: NOW_ISO },
        { created_by: c1, validator_ids: [], institution_id: inst, category_key: 'mentorship', scored_at: NOW_ISO, created_at: NOW_ISO },
      ];
      const sb = mockSupabase({
        pde_coordinator_onboarding_log: onboarded,
        pde_demonstrations: demos,
        pde_bridge_audit: [],
        institutions: [{ id: inst, name: 'X' }],
      });

      const snap = await computeKpiSnapshot(sb);
      const authoring = snap.per_category.find((c) => c.category_key === 'authoring');
      const mentorship = snap.per_category.find((c) => c.category_key === 'mentorship');
      expect(authoring).toBeDefined();
      expect(authoring!.demonstration_count).toBe(2);
      expect(authoring!.scored_count).toBe(1);
      expect(mentorship).toBeDefined();
      expect(mentorship!.demonstration_count).toBe(1);
      expect(mentorship!.scored_count).toBe(1);
      // Sorted descending by count
      expect(snap.per_category[0].category_key).toBe('authoring');
    });
  });
});
