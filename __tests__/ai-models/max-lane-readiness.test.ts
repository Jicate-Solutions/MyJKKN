// "Will the free Max lane run this?" — the checklist on the New / Edit AI job
// type form. Each case mirrors a rule verified against the live system
// 2026-10-09 (fn_ai_claim, fn_ai_enqueue, Windows ai-jobs-drain.mjs).
import { describe, expect, it } from 'vitest';

import { maxLaneReadiness } from '@/app/(routes)/admin/ai-models/_components/ai-job-types';

const ready = {
  lane: 'max',
  interactive: false,
  prompt_template: 'Summarise {{topic}} in three lines.',
  output_target: 'job.result',
  input_schema: [{ key: 'topic', label: 'Topic', type: 'text' as const, required: true }],
  tool_set: 'none',
  allow_rule: 'authenticated',
};

const fails = (def: typeof ready) =>
  maxLaneReadiness(def)
    .filter((c) => c.kind === 'fail')
    .map((c) => c.text);

describe('maxLaneReadiness', () => {
  it('a plain text-in text-out Max job has no blockers', () => {
    expect(fails(ready)).toEqual([]);
  });

  it('only lane "max" exactly is served — api and max-* lanes are blocked', () => {
    expect(fails({ ...ready, lane: 'api' })[0]).toMatch(/paid lane/);
    expect(fails({ ...ready, lane: 'max-pdf' })[0]).toMatch(/needs its own runner/);
    expect(fails({ ...ready, lane: 'either' })).toHaveLength(1);
  });

  it('interactive jobs are blocked', () => {
    expect(fails({ ...ready, interactive: true })[0]).toMatch(/Interactive is on/);
  });

  it('an empty or whitespace prompt is blocked', () => {
    expect(fails({ ...ready, prompt_template: '   ', input_schema: [] })[0]).toMatch(/Prompt is empty/);
  });

  it('table outputs are blocked', () => {
    expect(fails({ ...ready, output_target: 'table:foo' })[0]).toMatch(/refuses that/);
  });

  it('a placeholder with no run-form field is named', () => {
    const f = fails({ ...ready, prompt_template: 'Use {{topic}} and {{ audience }}.' });
    expect(f).toHaveLength(1);
    expect(f[0]).toContain('{{audience}}');
    expect(f[0]).not.toContain('{{topic}}');
  });

  it('notes the seat-owner limit and what a non-none tool set means', () => {
    const info = maxLaneReadiness({ ...ready, allow_rule: 'seat_owner', tool_set: 'all' })
      .filter((c) => c.kind === 'info')
      .map((c) => c.text)
      .join(' ');
    expect(info).toMatch(/Max seat list/);
    expect(info).toMatch(/as the person who ran the job/);
  });
});
