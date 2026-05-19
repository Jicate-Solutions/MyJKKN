import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock supabase client.
// ---------------------------------------------------------------------------

let mockRows: any[] = [];
let mockError: any = null;

function buildSupabaseMock() {
  return {
    from: (_table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        then: (resolve: any) =>
          Promise.resolve({ data: mockRows, error: mockError }).then(resolve),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(buildSupabaseMock()),
}));

import {
  PDEAccreditationEvidenceService,
} from '@/lib/services/pde-accreditation-evidence-service';
import { PDE_CATEGORY_KEYS } from '@/lib/services/pde-cohort-types';

beforeEach(() => {
  mockRows = [];
  mockError = null;
});

describe('PDEAccreditationEvidenceService.getEvidenceForBody', () => {
  it('returns 7 zero-buckets when pde_demonstrations is empty', async () => {
    const packet = await PDEAccreditationEvidenceService.getEvidenceForBody(
      'NAAC'
    );

    expect(packet.body).toBe('NAAC');
    expect(packet.total_demonstrations).toBe(0);
    expect(packet.by_category).toHaveLength(7);

    for (const bucket of packet.by_category) {
      expect(bucket.counts).toEqual({
        submitted: 0,
        validated: 0,
        scored: 0,
        passed: 0,
      });
      expect(bucket.sample_evidence).toHaveLength(0);
      expect(bucket.rubric_attestation_counts).toEqual({});
    }

    // Order is canonical PDE_CATEGORY_KEYS order.
    expect(packet.by_category.map((b) => b.category_key)).toEqual([
      ...PDE_CATEGORY_KEYS,
    ]);
  });

  it('aggregates counts correctly across statuses', async () => {
    mockRows = [
      // 2 scored embodied, 1 passed
      {
        id: 'd1',
        learner_id: 'l1',
        institution_id: 'i1',
        category_key: 'embodied',
        rubric_policy_key: 'pde.rubrics.embodied.medical',
        skill_name: 'Hand Hygiene',
        evidence: { url: 'https://example.com/e1' },
        evidence_type: 'video',
        status: 'scored',
        weighted_score: 80,
        passed: true,
        scored_at: '2026-05-19T00:00:00Z',
        validator_notes: { notes: 'good' },
      },
      {
        id: 'd2',
        learner_id: 'l2',
        institution_id: 'i1',
        category_key: 'embodied',
        rubric_policy_key: 'pde.rubrics.embodied.medical',
        skill_name: 'Hand Hygiene',
        evidence: {},
        evidence_type: null,
        status: 'scored',
        weighted_score: 40,
        passed: false,
        scored_at: '2026-05-18T00:00:00Z',
        validator_notes: null,
      },
      // 1 validated judgment (counts as validated + submitted, not scored)
      {
        id: 'd3',
        learner_id: 'l3',
        institution_id: 'i1',
        category_key: 'judgment',
        rubric_policy_key: null,
        skill_name: 'Clinical judgment',
        evidence: {},
        evidence_type: null,
        status: 'validated',
        weighted_score: null,
        passed: null,
        scored_at: null,
        validator_notes: null,
      },
      // 1 submitted credential
      {
        id: 'd4',
        learner_id: 'l4',
        institution_id: 'i1',
        category_key: 'credential',
        rubric_policy_key: null,
        skill_name: 'AWS cert',
        evidence: {},
        evidence_type: null,
        status: 'submitted',
        weighted_score: null,
        passed: null,
        scored_at: null,
        validator_notes: null,
      },
      // 1 draft (should not count anywhere)
      {
        id: 'd5',
        learner_id: 'l5',
        institution_id: 'i1',
        category_key: 'social_leadership',
        rubric_policy_key: null,
        skill_name: null,
        evidence: {},
        evidence_type: null,
        status: 'draft',
        weighted_score: null,
        passed: null,
        scored_at: null,
        validator_notes: null,
      },
    ];

    const packet = await PDEAccreditationEvidenceService.getEvidenceForBody(
      'NBA',
      'i1'
    );

    expect(packet.body).toBe('NBA');
    expect(packet.institution_id).toBe('i1');
    expect(packet.total_demonstrations).toBe(5);

    const embodied = packet.by_category.find(
      (b) => b.category_key === 'embodied'
    )!;
    expect(embodied.counts).toEqual({
      submitted: 2,
      validated: 2,
      scored: 2,
      passed: 1,
    });
    expect(embodied.sample_evidence).toHaveLength(2);
    expect(embodied.rubric_attestation_counts).toEqual({
      'pde.rubrics.embodied.medical': 2,
    });

    const judgment = packet.by_category.find(
      (b) => b.category_key === 'judgment'
    )!;
    expect(judgment.counts).toEqual({
      submitted: 1,
      validated: 1,
      scored: 0,
      passed: 0,
    });
    expect(judgment.sample_evidence).toHaveLength(0);

    const credential = packet.by_category.find(
      (b) => b.category_key === 'credential'
    )!;
    expect(credential.counts).toEqual({
      submitted: 1,
      validated: 0,
      scored: 0,
      passed: 0,
    });

    const social = packet.by_category.find(
      (b) => b.category_key === 'social_leadership'
    )!;
    // Draft rows should not count.
    expect(social.counts).toEqual({
      submitted: 0,
      validated: 0,
      scored: 0,
      passed: 0,
    });
  });

  it('caps sample_evidence at 5 rows per category', async () => {
    mockRows = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      learner_id: `l${i}`,
      institution_id: null,
      category_key: 'accountability',
      rubric_policy_key: null,
      skill_name: `Skill ${i}`,
      evidence: {},
      evidence_type: null,
      status: 'scored',
      weighted_score: 70,
      passed: true,
      scored_at: `2026-05-${10 + i}T00:00:00Z`,
      validator_notes: null,
    }));

    const packet = await PDEAccreditationEvidenceService.getEvidenceForBody(
      'IQAC'
    );

    const acct = packet.by_category.find(
      (b) => b.category_key === 'accountability'
    )!;
    expect(acct.counts.scored).toBe(10);
    expect(acct.counts.passed).toBe(10);
    expect(acct.sample_evidence).toHaveLength(5);
  });

  it('propagates supabase errors as thrown exceptions', async () => {
    mockError = { message: 'rls denied' };

    await expect(
      PDEAccreditationEvidenceService.getEvidenceForBody('NAAC')
    ).rejects.toThrow(/rls denied/);
  });
});

describe('PDEAccreditationEvidenceService.emptyPacket', () => {
  it('returns the canonical 7 categories with all zero counts', () => {
    const packet = PDEAccreditationEvidenceService.emptyPacket('NAAC', 'i1');
    expect(packet.body).toBe('NAAC');
    expect(packet.institution_id).toBe('i1');
    expect(packet.total_demonstrations).toBe(0);
    expect(packet.by_category).toHaveLength(7);
    expect(packet.by_category.map((b) => b.category_key)).toEqual([
      ...PDE_CATEGORY_KEYS,
    ]);
  });
});
