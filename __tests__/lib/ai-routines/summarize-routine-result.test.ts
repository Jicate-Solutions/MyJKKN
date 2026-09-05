import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

// The REAL summariser the dispatcher writes status lines with — imported,
// never re-modelled. A test that re-implements the rule only proves the test
// agrees with itself.
import {
  summarizeRoutineResult,
  HEADLINE_KEYS,
  MAX_STATUS_LENGTH,
} from '@/lib/ai-routines/summarize-routine-result';

/**
 * The shape the curriculum lesson-spine generator actually returns. This is
 * the response whose diagnostic counters the old fixed allowlist discarded:
 * of everything below, only `generated` and `skipped` were on that list.
 */
function generatorBody(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    mode: 'submit',
    generation_lane: 'batch',
    courses: 0,
    capped: 0,
    generated: 0,
    briefs_generated: 0,
    enqueued: 0,
    skipped: 0,
    skipped_no_taxonomy: 0,
    skipped_dried_out: 0,
    dried_out: 0,
    ai_available: true,
    submitted: 0,
    collected: { jobs: 0, recorded: 0 },
    batch_cap: 40,
    emit_briefs_policy: 'on',
    elapsed_ms: 1234,
    ...over,
  };
}

describe('summarizeRoutineResult — the counters that diagnose a stalled routine', () => {
  it('a run that skipped courses SAYS SO (the defect: this line used to read "generated 0, skipped 0")', () => {
    // An arbitrary fixture count. The assertion derives from the fixture, so
    // it holds whatever the number is — it never encodes a live figure.
    const blocked = 142;
    const body = generatorBody({ courses: blocked, skipped_no_taxonomy: blocked });

    const line = summarizeRoutineResult(200, body);

    expect(line).toContain(`skipped_no_taxonomy ${blocked}`);
    expect(line).toContain(`courses ${blocked}`);
  });

  it('still prints the headline counters at zero, so "ran and did nothing" stays visible', () => {
    const line = summarizeRoutineResult(200, generatorBody({ skipped_no_taxonomy: 7 }));

    expect(line).toContain('generated 0');
    expect(line).toContain('skipped 0');
  });

  it('surfaces a counter no list has ever heard of, without anything being edited here', () => {
    const line = summarizeRoutineResult(200, { ok: true, sprockets_reticulated: 9 });

    expect(line).toContain('sprockets_reticulated 9');
  });

  it('leaves out timing and request noise', () => {
    const line = summarizeRoutineResult(200, generatorBody({ enqueued: 3, response_time_ms: 88 }));

    expect(line).not.toContain('elapsed_ms');
    expect(line).not.toContain('response_time_ms');
    expect(line).toContain('enqueued 3');
  });

  it('keeps quiet nights short — a non-headline counter at zero is left out', () => {
    const line = summarizeRoutineResult(200, generatorBody());

    expect(line).not.toContain('capped');
    expect(line).not.toContain('dried_out');
    expect(line).toContain('skipped 0'); // headline: printed even at zero
  });

  it('ignores non-finite numbers rather than printing NaN', () => {
    const line = summarizeRoutineResult(200, { ok: true, generated: Number.NaN, enqueued: 4 });

    expect(line).not.toContain('NaN');
    expect(line).toContain('enqueued 4');
  });
});

describe('summarizeRoutineResult — unchanged behaviour', () => {
  it('a body carrying only the old headline keys reads exactly as it did before', () => {
    const line = summarizeRoutineResult(200, { ok: true, generated: 3, measured: 2, skipped: 5 });

    expect(line).toBe('HTTP 200 · generated 3, measured 2, skipped 5');
  });

  it('a routine reporting its own failure still reports it in words', () => {
    const line = summarizeRoutineResult(500, { ok: false, error: 'taxonomy lookup failed' });

    expect(line).toBe('HTTP 500 · error: taxonomy lookup failed');
  });

  it('a non-JSON-object body falls back to the bare HTTP status', () => {
    expect(summarizeRoutineResult(204, null)).toBe('HTTP 204');
    expect(summarizeRoutineResult(200, 'plain text')).toBe('HTTP 200');
    expect(summarizeRoutineResult(200, [1, 2, 3])).toBe('HTTP 200');
    expect(summarizeRoutineResult(200, { ok: true })).toBe('HTTP 200');
  });
});

describe('summarizeRoutineResult — truncation is announced, never silent', () => {
  const crowded = Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`counter_number_${i}`, i + 1]),
  );

  it('stays inside the readability budget', () => {
    expect(summarizeRoutineResult(200, { ok: true, ...crowded }).length).toBeLessThanOrEqual(
      MAX_STATUS_LENGTH,
    );
  });

  it('states how many counters it had to drop', () => {
    const line = summarizeRoutineResult(200, { ok: true, ...crowded });

    expect(line).toMatch(/\+\d+ more$/);
  });

  it('does not truncate a line that fits', () => {
    expect(summarizeRoutineResult(200, { ok: true, generated: 1 })).not.toContain('more');
  });
});

describe('the dispatcher is actually wired to it', () => {
  // The helper being correct is worth nothing if the dispatcher still holds
  // its own copy of the old fixed list. Cheap guard against a fix that ships
  // green and changes nothing on production.
  const dispatcher = readFileSync(
    path.join(process.cwd(), 'app/api/cron/ai-routine-dispatcher/route.ts'),
    'utf8',
  );

  it('imports the summariser', () => {
    expect(dispatcher).toContain("from '@/lib/ai-routines/summarize-routine-result'");
    expect(dispatcher).toContain('summarizeRoutineResult(');
  });

  it('no longer keeps a private allowlist of counter names', () => {
    expect(dispatcher).not.toContain('SUMMARY_KEYS');
  });

  it('the headline order the dispatcher used to hard-code is preserved', () => {
    expect([...HEADLINE_KEYS]).toEqual([
      'generated', 'measured', 'skipped', 'created', 'sent', 'updated',
      'concerns', 'candidates', 'processed', 'recorded', 'escalations',
      'nudged', 'tipped', 'delivered', 'flagged', 'events', 'count',
      // Added to the dispatcher's allowlist on main while this branch was open
      // (metaloop-charter-drafts / -collect). Carried across in the rebase so
      // they keep printing at zero.
      'collected', 'filed', 'insufficient', 'enqueued',
    ]);
  });
});
