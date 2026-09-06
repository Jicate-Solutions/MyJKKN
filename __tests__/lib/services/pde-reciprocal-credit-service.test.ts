/**
 * PDEReciprocalCreditService — boundary tests
 * ============================================================================
 *
 * Mocks:
 *   - `@/lib/supabase/server`         → createServerSupabaseClient
 *   - `@/lib/services/pde-policy-reader` → getQuestsCompensationModel
 *
 * Covers:
 *   1. Policy disabled (model='voluntary_recognition') → no INSERT, granted:false
 *   2. Policy disabled (model='honorarium_per_quest')  → no INSERT, granted:false
 *   3. Policy enabled  (model='reciprocal_credit')     → INSERTs with default value
 *   4. Validator grant respects same policy gate.
 *   5. getLearnerCredits aggregates sum + per-type breakdown.
 *
 * Phase: PDE Tier 3 — T3.3 — 2026-05-19.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Policy-reader mock — controllable per test.
// ---------------------------------------------------------------------------
const getQuestsCompensationModelMock = vi.fn();

vi.mock('@/lib/services/pde-policy-reader', () => ({
  getQuestsCompensationModel: (institutionId?: string | null) =>
    getQuestsCompensationModelMock(institutionId),
}));

// ---------------------------------------------------------------------------
// Supabase client mock — chainable builder that resolves with a configurable
// payload. Insert paths call `.insert().select().single()`; read paths call
// `.select().eq()` (and optionally `.order().limit()`).
// ---------------------------------------------------------------------------
let insertPayload: { data: any; error: any } = { data: { id: 'mock-credit-id' }, error: null };
let selectPayload: { data: any; error: any } = { data: [], error: null };
const insertSpy = vi.fn();
const fromSpy = vi.fn();

const supabaseMock: any = {
  auth: {
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'mock-actor-id' } } })),
  },
  from: (table: string) => {
    fromSpy(table);
    const builder: any = {
      insert: (row: any) => {
        insertSpy(row);
        return {
          select: () => ({
            single: () => Promise.resolve(insertPayload),
          }),
        };
      },
      select: () => ({
        eq: () => Promise.resolve(selectPayload),
        order: () => ({
          limit: () => Promise.resolve(selectPayload),
        }),
      }),
    };
    return builder;
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => Promise.resolve(supabaseMock),
}));

// Re-import after mocks (vitest hoists vi.mock).
import { PDEReciprocalCreditService } from '@/lib/services/pde-reciprocal-credit-service';

beforeEach(() => {
  getQuestsCompensationModelMock.mockReset();
  insertSpy.mockReset();
  fromSpy.mockReset();
  insertPayload = { data: { id: 'mock-credit-id' }, error: null };
  selectPayload = { data: [], error: null };
});

describe('PDEReciprocalCreditService.grantCreditForQuestCompletion', () => {
  it('returns granted:false when compensation_model is voluntary_recognition', async () => {
    getQuestsCompensationModelMock.mockResolvedValue('voluntary_recognition');
    const result = await PDEReciprocalCreditService.grantCreditForQuestCompletion(
      'learner-1',
      'quest-1'
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('voluntary_recognition');
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('returns granted:false when compensation_model is honorarium_per_quest', async () => {
    getQuestsCompensationModelMock.mockResolvedValue('honorarium_per_quest');
    const result = await PDEReciprocalCreditService.grantCreditForQuestCompletion(
      'learner-1',
      'quest-1'
    );
    expect(result.granted).toBe(false);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('INSERTs a credit row when compensation_model is reciprocal_credit', async () => {
    getQuestsCompensationModelMock.mockResolvedValue('reciprocal_credit');
    const result = await PDEReciprocalCreditService.grantCreditForQuestCompletion(
      'learner-1',
      'quest-1'
    );
    expect(result.granted).toBe(true);
    expect(result.credit_id).toBe('mock-credit-id');
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.learner_id).toBe('learner-1');
    expect(inserted.quest_id).toBe('quest-1');
    expect(inserted.credit_type).toBe('quest_completion');
    expect(inserted.credit_value).toBe(1.0);
  });
});

describe('PDEReciprocalCreditService.grantCreditForValidator', () => {
  it('respects the same policy gate as quest_completion', async () => {
    getQuestsCompensationModelMock.mockResolvedValue('voluntary_recognition');
    const result = await PDEReciprocalCreditService.grantCreditForValidator(
      'validator-1',
      'demo-1'
    );
    expect(result.granted).toBe(false);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('INSERTs a validator_grant row when reciprocal_credit', async () => {
    getQuestsCompensationModelMock.mockResolvedValue('reciprocal_credit');
    const result = await PDEReciprocalCreditService.grantCreditForValidator(
      'validator-1',
      'demo-1'
    );
    expect(result.granted).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.learner_id).toBe('validator-1');
    expect(inserted.credit_type).toBe('validator_grant');
    expect(inserted.credit_value).toBe(0.5);
    expect(inserted.notes).toContain('demo-1');
  });
});

describe('PDEReciprocalCreditService.getLearnerCredits', () => {
  it('returns zero totals when learner has no credits', async () => {
    selectPayload = { data: [], error: null };
    const totals = await PDEReciprocalCreditService.getLearnerCredits('learner-1');
    expect(totals.total).toBe(0);
    expect(totals.row_count).toBe(0);
    expect(totals.by_type.quest_completion).toBe(0);
    expect(totals.by_type.validator_grant).toBe(0);
    expect(totals.by_type.peer_attestation).toBe(0);
  });

  it('aggregates sum + per-type breakdown', async () => {
    selectPayload = {
      data: [
        { credit_type: 'quest_completion', credit_value: 1.0 },
        { credit_type: 'quest_completion', credit_value: 1.0 },
        { credit_type: 'validator_grant', credit_value: 0.5 },
        { credit_type: 'peer_attestation', credit_value: 0.25 },
      ],
      error: null,
    };
    const totals = await PDEReciprocalCreditService.getLearnerCredits('learner-1');
    expect(totals.row_count).toBe(4);
    expect(totals.by_type.quest_completion).toBe(2.0);
    expect(totals.by_type.validator_grant).toBe(0.5);
    expect(totals.by_type.peer_attestation).toBe(0.25);
    expect(totals.total).toBe(2.75);
  });
});
