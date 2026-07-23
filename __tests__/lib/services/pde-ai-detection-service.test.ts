import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock `getAiDeliverableCreditPolicy` so each test can stage the policy mode
// + thresholds it wants to exercise. The service should never call any other
// I/O, so mocking the policy reader is sufficient.
// ---------------------------------------------------------------------------

const getAiDeliverableCreditPolicyMock = vi.fn();

vi.mock('@/lib/services/pde-policy-reader', () => ({
  getAiDeliverableCreditPolicy: (instId?: string | null) =>
    getAiDeliverableCreditPolicyMock(instId),
}));

import { PDEAiDetectionService } from '@/lib/services/pde-ai-detection-service';

beforeEach(() => {
  getAiDeliverableCreditPolicyMock.mockReset();
});

function stagePolicy(policy: {
  mode: string;
  min_agency_score: number;
  require_disclosure: boolean;
}) {
  getAiDeliverableCreditPolicyMock.mockResolvedValueOnce(policy);
}

// ---------------------------------------------------------------------------
// classifyDeliverable — full_credit_if_agency_proven
// ---------------------------------------------------------------------------

describe('classifyDeliverable — full_credit_if_agency_proven', () => {
  it('agency_score above threshold → full credit', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 80,
      disclosed: false,
    });
    expect(res.credit_mode).toBe('full');
    expect(res.credit_multiplier).toBe(1);
    expect(res.reason).toMatch(/full credit/i);
  });

  it('agency_score exactly at threshold → full credit (inclusive boundary)', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 60,
      disclosed: false,
    });
    expect(res.credit_mode).toBe('full');
  });

  it('agency_score below threshold → partial credit (0.5x)', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 40,
      disclosed: false,
    });
    expect(res.credit_mode).toBe('partial');
    expect(res.credit_multiplier).toBe(0.5);
  });

  it('agency_score missing → partial credit (safer default)', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      disclosed: false,
    });
    expect(res.credit_mode).toBe('partial');
    expect(res.reason).toMatch(/not available/i);
  });
});

// ---------------------------------------------------------------------------
// classifyDeliverable — disclosure_required_full_credit
// ---------------------------------------------------------------------------

describe('classifyDeliverable — disclosure_required_full_credit', () => {
  it('disclosed=true → full credit', async () => {
    stagePolicy({
      mode: 'disclosure_required_full_credit',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 30,
      disclosed: true,
    });
    expect(res.credit_mode).toBe('full');
    expect(res.credit_multiplier).toBe(1);
  });

  it('disclosed=false → no credit', async () => {
    stagePolicy({
      mode: 'disclosure_required_full_credit',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 90,
      disclosed: false,
    });
    expect(res.credit_mode).toBe('none');
    expect(res.credit_multiplier).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyDeliverable — reduced_credit_proportional
// ---------------------------------------------------------------------------

describe('classifyDeliverable — reduced_credit_proportional', () => {
  it('always returns partial credit regardless of agency_score', async () => {
    stagePolicy({
      mode: 'reduced_credit_proportional',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 95,
      disclosed: true,
    });
    expect(res.credit_mode).toBe('partial');
    expect(res.credit_multiplier).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// classifyDeliverable — require_disclosure precondition
// ---------------------------------------------------------------------------

describe('classifyDeliverable — require_disclosure precondition', () => {
  it('require_disclosure=true + disclosed=false → none, regardless of mode', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: true,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 95,
      disclosed: false,
    });
    expect(res.credit_mode).toBe('none');
    expect(res.reason).toMatch(/disclosure is required/i);
  });

  it('require_disclosure=true + disclosed=true → mode rules apply normally', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: true,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 75,
      disclosed: true,
    });
    expect(res.credit_mode).toBe('full');
  });
});

// ---------------------------------------------------------------------------
// classifyDeliverable — unknown mode fail-soft
// ---------------------------------------------------------------------------

describe('classifyDeliverable — unknown mode', () => {
  it('unknown mode → fail-soft to full credit', async () => {
    stagePolicy({
      mode: 'a_future_mode_that_does_not_exist_yet',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 50,
      disclosed: false,
    });
    expect(res.credit_mode).toBe('full');
    expect(res.reason).toMatch(/unrecognised|fail-soft/i);
  });
});

// ---------------------------------------------------------------------------
// classifyDeliverable — policy_mode echo for auditability
// ---------------------------------------------------------------------------

describe('classifyDeliverable — auditability', () => {
  it('echoes the policy mode it acted on', async () => {
    stagePolicy({
      mode: 'full_credit_if_agency_proven',
      min_agency_score: 60,
      require_disclosure: false,
    });
    const res = await PDEAiDetectionService.classifyDeliverable({
      evidence: {},
      agency_score: 75,
      disclosed: false,
    });
    expect(res.policy_mode).toBe('full_credit_if_agency_proven');
  });
});

// ---------------------------------------------------------------------------
// detectAiPatterns — STUB heuristic
// ---------------------------------------------------------------------------

describe('detectAiPatterns', () => {
  it('returns 0 likelihood for empty input', async () => {
    const res = await PDEAiDetectionService.detectAiPatterns('');
    expect(res.likelihood).toBe(0);
    expect(res.signals).toContain('empty_input');
  });

  it('is deterministic — same input always yields the same score', async () => {
    const sample =
      'This essay explores the foundations of judgment. In conclusion, the framework offers a way to think about durable value. Furthermore, the institution can adopt these patterns.';
    const a = await PDEAiDetectionService.detectAiPatterns(sample);
    const b = await PDEAiDetectionService.detectAiPatterns(sample);
    expect(a.likelihood).toBe(b.likelihood);
    expect(a.signals).toEqual(b.signals);
  });

  it('low-likelihood for short, contraction-heavy human text', async () => {
    const text = "I can't believe it's already done. We're tired.";
    const res = await PDEAiDetectionService.detectAiPatterns(text);
    expect(res.likelihood).toBeLessThan(0.3);
  });

  it('higher likelihood for long LLM-cadence text with filler phrases', async () => {
    const para =
      'The framework provides a comprehensive approach to evaluating learner outcomes through multiple lenses. It is important to note that the seven categories represent durable value rather than ephemeral skill. Furthermore, the implementation requires careful attention to each component of the rubric.';
    const text = [para, para, para, para, para].join('\n\n');
    const res = await PDEAiDetectionService.detectAiPatterns(text);
    expect(res.likelihood).toBeGreaterThan(0.3);
    expect(res.signals.length).toBeGreaterThan(1);
  });

  it('caps likelihood at 1', async () => {
    const para =
      'It is important to note that this analysis is comprehensive. In conclusion, the framework operates effectively. Furthermore, moreover, in summary, overall, this is excellent.';
    const text = Array(20).fill(para).join('\n\n');
    const res = await PDEAiDetectionService.detectAiPatterns(text);
    expect(res.likelihood).toBeLessThanOrEqual(1);
    expect(res.likelihood).toBeGreaterThanOrEqual(0);
  });

  it('handles undefined/null gracefully', async () => {
    // @ts-expect-error — exercising defensive coercion
    const res = await PDEAiDetectionService.detectAiPatterns(undefined);
    expect(res.likelihood).toBe(0);
  });
});
