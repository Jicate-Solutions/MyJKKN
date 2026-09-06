/**
 * PDE Tier 4 — T4.1 Bridge Service tests
 * =============================================================================
 *
 * Covers:
 *   1. Mapping correctness for each legacy table.
 *   2. Idempotency (re-run with same source row → skipped).
 *   3. Dry-run does not write to pde_demonstrations.
 *   4. Malformed row → audited as failed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase server client BEFORE importing the service.
const insertRows: Array<{ table: string; row: Record<string, unknown> }> = [];
const updateRows: Array<{ table: string; patch: Record<string, unknown>; id: string }> = [];

const mkSelectChain = (returnRows: unknown[]) => {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: returnRows, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: returnRows[0] ?? null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: returnRows[0] ?? null, error: null })),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: returnRows, error: null }).then(resolve),
  };
  return chain;
};

const mockState = {
  capabilities: [] as unknown[],
  certificates: [] as unknown[],
  questEnrollments: [] as unknown[],
  appliedAudit: [] as unknown[],
  shouldFailInsert: false,
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from(table: string) {
      if (table === 'pde_learner_capabilities') {
        const chain = mkSelectChain(mockState.capabilities);
        chain.update = vi.fn((patch: Record<string, unknown>) => {
          return {
            eq: (col: string, val: string) => {
              updateRows.push({ table, patch, id: val });
              return Promise.resolve({ error: null });
            },
          };
        });
        return chain;
      }
      if (table === 'pde_certificates') return mkSelectChain(mockState.certificates);
      if (table === 'pde_quest_enrollments') return mkSelectChain(mockState.questEnrollments);
      if (table === 'pde_bridge_audit') {
        const chain = mkSelectChain(mockState.appliedAudit);
        chain.insert = vi.fn((row: Record<string, unknown>) => {
          insertRows.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        });
        return chain;
      }
      if (table === 'pde_demonstrations') {
        return {
          insert: (row: Record<string, unknown>) => {
            insertRows.push({ table, row });
            if (mockState.shouldFailInsert) {
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: null, error: { message: 'insert blew up' } }),
                }),
              };
            }
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'demo-uuid-' + insertRows.length },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      return mkSelectChain([]);
    },
  }),
}));

import {
  mapLegacyCapability,
  mapLegacyCertificate,
  mapLegacyQuestEnrollment,
  runBridge,
} from '@/lib/services/pde-bridge-service';

beforeEach(() => {
  insertRows.length = 0;
  updateRows.length = 0;
  mockState.capabilities = [];
  mockState.certificates = [];
  mockState.questEnrollments = [];
  mockState.appliedAudit = [];
  mockState.shouldFailInsert = false;
});

describe('mapLegacyCapability', () => {
  it('maps leadership keyword → social_leadership', () => {
    const m = mapLegacyCapability({
      id: 'a',
      learner_id: 'l1',
      capability_id: 'c1',
      status: 'mastered',
      demonstrated_at: null,
      demonstration_evidence: { foo: 'bar' },
      demonstration_score: 8,
      mastered_at: null,
      capability: { name: 'Peer Leadership in Lab', category: 'soft', level: 2 },
    });
    expect(m).not.toBeNull();
    expect(m!.target_category_key).toBe('social_leadership');
    expect(m!.target_passed).toBe(true);
    expect(m!.target_evidence_type).toBe('legacy_capability');
    expect(m!.target_weighted_score).toBe(8);
  });

  it('defaults to embodied when no keyword match', () => {
    const m = mapLegacyCapability({
      id: 'a',
      learner_id: 'l1',
      capability_id: 'c1',
      status: 'not_mastered',
      demonstrated_at: null,
      demonstration_evidence: null,
      demonstration_score: null,
      mastered_at: null,
      capability: { name: 'Sterile gowning', category: 'clinical', level: 1 },
    });
    expect(m!.target_category_key).toBe('embodied');
    expect(m!.target_passed).toBe(false);
  });

  it('returns null when learner_id is missing', () => {
    const m = mapLegacyCapability({
      id: 'a',
      learner_id: null,
      capability_id: null,
      status: null,
      demonstrated_at: null,
      demonstration_evidence: null,
      demonstration_score: null,
      mastered_at: null,
      capability: null,
    });
    expect(m).toBeNull();
  });
});

describe('mapLegacyCertificate', () => {
  it('NEP/civic keyword → cultural_civic', () => {
    const m = mapLegacyCertificate({
      id: 'cert1',
      learner_id: 'l1',
      course_id: 'co1',
      certificate_number: 'NEP-001',
      certificate_type: 'NEP heritage program',
      issued_at: '2025-01-01',
      final_score: 88,
      capabilities_demonstrated: null,
      metadata: null,
    });
    expect(m.target_category_key).toBe('cultural_civic');
    expect(m.target_passed).toBe(true);
    expect(m.target_evidence_type).toBe('legacy_certificate');
  });

  it('non-NEP cert → credential', () => {
    const m = mapLegacyCertificate({
      id: 'cert1',
      learner_id: 'l1',
      course_id: 'co1',
      certificate_number: 'AWS-001',
      certificate_type: 'AWS Cloud Practitioner',
      issued_at: null,
      final_score: null,
      capabilities_demonstrated: null,
      metadata: null,
    });
    expect(m.target_category_key).toBe('credential');
  });
});

describe('mapLegacyQuestEnrollment', () => {
  it('red/high risk → judgment', () => {
    const m = mapLegacyQuestEnrollment({
      id: 'q1',
      quest_id: 'qq1',
      learner_id: 'l1',
      status: 'passed',
      completed_at: '2025-01-01',
      quest: { title: 'Live patient demo', risk_tier: 'red', difficulty: 'hard' },
    });
    expect(m).not.toBeNull();
    expect(m!.target_category_key).toBe('judgment');
  });

  it('amber → problem_finding', () => {
    const m = mapLegacyQuestEnrollment({
      id: 'q1',
      quest_id: 'qq1',
      learner_id: 'l1',
      status: 'completed',
      completed_at: null,
      quest: { title: 'Design proposal', risk_tier: 'amber', difficulty: null },
    });
    expect(m!.target_category_key).toBe('problem_finding');
  });

  it('non-passed status returns null', () => {
    const m = mapLegacyQuestEnrollment({
      id: 'q1',
      quest_id: 'qq1',
      learner_id: 'l1',
      status: 'in_progress',
      completed_at: null,
      quest: { title: 'foo', risk_tier: 'red', difficulty: null },
    });
    expect(m).toBeNull();
  });
});

describe('runBridge — dry-run', () => {
  it('writes audit rows but NOT pde_demonstrations when dry_run=true', async () => {
    mockState.capabilities = [
      {
        id: 'cap1',
        learner_id: 'l1',
        capability_id: 'c1',
        status: 'mastered',
        demonstrated_at: null,
        demonstration_evidence: null,
        demonstration_score: 7,
        mastered_at: null,
        capability: { name: 'Leadership 101', category: 'soft', level: 1 },
      },
    ];
    const result = await runBridge({ scope: 'all', dry_run: true });
    expect(result.dry_run).toBe(true);
    expect(result.bridged).toBe(1);
    expect(result.failed).toBe(0);

    const demoInserts = insertRows.filter((r) => r.table === 'pde_demonstrations');
    expect(demoInserts).toHaveLength(0);
    const auditInserts = insertRows.filter((r) => r.table === 'pde_bridge_audit');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].row.status).toBe('dry_run');
  });
});

describe('runBridge — apply', () => {
  it('inserts pde_demonstrations + sets grandfathered=true on source capability', async () => {
    mockState.capabilities = [
      {
        id: 'cap1',
        learner_id: 'l1',
        capability_id: 'c1',
        status: 'mastered',
        demonstrated_at: null,
        demonstration_evidence: null,
        demonstration_score: 7,
        mastered_at: null,
        capability: { name: 'Sterile gowning', category: 'clinical', level: 1 },
      },
    ];
    const result = await runBridge({ scope: 'all', dry_run: false });
    expect(result.dry_run).toBe(false);
    expect(result.bridged).toBe(1);

    const demoInserts = insertRows.filter((r) => r.table === 'pde_demonstrations');
    expect(demoInserts).toHaveLength(1);
    expect(demoInserts[0].row.status).toBe('scored');
    expect(demoInserts[0].row.category_key).toBe('embodied');
    expect(demoInserts[0].row.passed).toBe(true);

    // grandfathered flip on the source capability.
    const grandfatherUpdate = updateRows.find(
      (u) => u.table === 'pde_learner_capabilities' && u.patch.grandfathered === true
    );
    expect(grandfatherUpdate).toBeDefined();
    expect(grandfatherUpdate!.id).toBe('cap1');

    const auditInserts = insertRows.filter((r) => r.table === 'pde_bridge_audit');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].row.status).toBe('applied');
  });
});

describe('runBridge — failure auditing', () => {
  it('captures insert failure in audit with status=failed', async () => {
    mockState.certificates = [
      {
        id: 'cert1',
        learner_id: 'l1',
        course_id: 'co1',
        certificate_number: 'X-001',
        certificate_type: 'AWS',
        issued_at: null,
        final_score: 90,
        capabilities_demonstrated: null,
        metadata: null,
      },
    ];
    mockState.shouldFailInsert = true;

    const result = await runBridge({ scope: 'all', dry_run: false });
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const auditInserts = insertRows.filter((r) => r.table === 'pde_bridge_audit');
    const failed = auditInserts.find((a) => a.row.status === 'failed');
    expect(failed).toBeDefined();
    expect(failed!.row.error_message).toContain('insert blew up');
  });
});

describe('runBridge — idempotency', () => {
  it('skips source rows already audited as applied', async () => {
    mockState.capabilities = [
      {
        id: 'cap1',
        learner_id: 'l1',
        capability_id: 'c1',
        status: 'mastered',
        demonstrated_at: null,
        demonstration_evidence: null,
        demonstration_score: 7,
        mastered_at: null,
        capability: { name: 'Leadership', category: null, level: 1 },
      },
    ];
    mockState.appliedAudit = [{ source_row_id: 'cap1' }];

    const result = await runBridge({ scope: 'all', dry_run: false });
    expect(result.skipped).toBe(1);
    expect(result.bridged).toBe(0);
    const demoInserts = insertRows.filter((r) => r.table === 'pde_demonstrations');
    expect(demoInserts).toHaveLength(0);
  });
});
