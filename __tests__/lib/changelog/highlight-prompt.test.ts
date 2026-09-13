/**
 * What's New — the plain-English highlight writer: prompt assembly and parsing.
 *
 * WHAT THESE TESTS ARE ACTUALLY GUARDING. These highlights publish UNREVIEWED
 * (Director ruling 2026-09-13 — there is no approval queue any more), on the
 * page non-developers read to learn what they can do. Every human check has
 * been removed from the path between a model's sentence and a Principal's
 * screen. What is left is: the instructions we send, and the parser that
 * decides what counts as an answer. Those two things are this file's subject.
 *
 * So these are not "does the string contain the substring" tests. Each one
 * stands for a way the feature fails in production:
 *   - a sha or a module key reaching the model  → it writes nonsense or refuses,
 *     which is the OneMark failure (#3378) that cost a whole build cycle;
 *   - the refusal shape not being honoured      → invented effects published for
 *     every internal refactor, i.e. the page becomes actively misleading;
 *   - a partial answer being accepted           → a half-written highlight on a
 *     page with nothing left to catch it.
 */

import { describe, it, expect } from 'vitest';
import {
  buildHighlightPrompt,
  highlightDedupeKey,
  isRefusal,
  parseHighlightResult,
  type HighlightSubject,
} from '@/lib/changelog/highlight-prompt';

const subject = (over: Partial<HighlightSubject> = {}): HighlightSubject => ({
  subject: 'Engagement shows each principal only their college',
  moduleLabel: 'Analytics',
  moduleHref: '/analytics/engagement',
  author: 'Ommsharravana',
  kind: 'fixed',
  breaking: false,
  ...over,
});

describe('buildHighlightPrompt — names, not identifiers', () => {
  it('carries the commit subject, the human module label and the author', () => {
    const p = buildHighlightPrompt(subject());
    expect(p).toContain('Engagement shows each principal only their college');
    expect(p).toContain('Analytics');
    expect(p).toContain('Ommsharravana');
  });

  it('never carries a module KEY where a label was available', () => {
    // The failure this prevents: passing `module_key` through would send
    // "analytics" or, worse, "campus_living" to a model asked to write English.
    // The cron looks the label up precisely so this cannot happen; the type
    // has no module_key field, and this asserts the assembled text agrees.
    const p = buildHighlightPrompt(subject({ moduleLabel: 'Campus Living' }));
    expect(p).toContain('Campus Living');
    expect(p).not.toContain('campus_living');
  });

  it('carries no commit sha — the identifier is the join key, not the question', () => {
    // HighlightSubject structurally cannot hold a sha. This asserts the whole
    // assembled prompt is free of anything hash-shaped, so a future field added
    // to that type cannot quietly reintroduce one. A 12-character hash means
    // nothing to a model asked to explain a change to a Principal.
    const p = buildHighlightPrompt(subject({ subject: 'Fix the thing' }));
    expect(p).not.toMatch(/\b[0-9a-f]{7,40}\b/);
  });

  it('tells the model where the area opens, so "what you can do now" can name it', () => {
    expect(buildHighlightPrompt(subject({ moduleHref: '/billing/receipts' }))).toContain(
      '/billing/receipts'
    );
  });

  it('says there is nowhere to go when the module is platform-wide', () => {
    const p = buildHighlightPrompt(subject({ moduleHref: null }));
    expect(p).toContain('no single screen of its own');
  });

  it('flags a breaking change, because someone will be surprised by it', () => {
    expect(buildHighlightPrompt(subject({ breaking: true }))).toContain('ALREADY DO');
    expect(buildHighlightPrompt(subject({ breaking: false }))).not.toContain('ALREADY DO');
  });

  it('distinguishes the kinds, so a fix is not written up as a new feature', () => {
    expect(buildHighlightPrompt(subject({ kind: 'new' }))).toContain('ADDED');
    expect(buildHighlightPrompt(subject({ kind: 'fixed' }))).toContain('FIXED');
    expect(buildHighlightPrompt(subject({ kind: 'security' }))).toContain('CLOSED');
  });
});

describe('buildHighlightPrompt — the rules the Director set', () => {
  const p = buildHighlightPrompt(subject());

  it('forbids the fix(scope): prefix and the (#1234), by example and by rule', () => {
    expect(p).toContain('fix(billing):');
    expect(p).toContain('(#1234)');
    // The worked example shows the transformation actually being performed,
    // which is what makes the rule stick.
    expect(p).toContain('"headline": "Your Engagement dashboard now shows only your own unit"');
  });

  it('forbids naming a person and requires a role instead', () => {
    // An explicit Director ruling: "Principals asked for this", never
    // "suggested by Dr Priya". The instruction carries both halves — the
    // prohibition and the replacement — because a prohibition alone leaves the
    // model with nothing to write.
    expect(p).toContain('Name the ROLE, never a person');
    expect(p).toMatch(/NEVER write a human name/);
    expect(p).toContain('Principals and HODs');
  });

  it('names the jargon that must not appear', () => {
    for (const word of ['RLS', 'SECURITY DEFINER', 'RPC', 'migration', 'endpoint', 'schema']) {
      expect(p).toContain(word);
    }
  });

  it('teaches the refusal with a worked example, not just a rule', () => {
    // Without the second example a model reads the task as "always produce
    // three lines" and produces them for a renamed variable.
    expect(p).toContain('"no_user_visible_effect": true');
    expect(p).toContain('Internal code tidy-up');
    expect(p).toMatch(/refusal is a correct and expected answer/i);
  });

  it('asks for strict JSON with no fences', () => {
    expect(p).toMatch(/Return ONLY valid JSON/);
    expect(p).toMatch(/No markdown, no code fences/);
  });
});

describe('parseHighlightResult — a draft', () => {
  it('reads the three fields', () => {
    const r = parseHighlightResult(
      '{"headline":"Receipts now show the fee head","affects":"Office staff who raise invoices","action":"Open Billing → Receipts."}'
    );
    expect(r && !isRefusal(r) && r).toEqual({
      headline: 'Receipts now show the fee head',
      affects: 'Office staff who raise invoices',
      action: 'Open Billing → Receipts.',
    });
  });

  it('tolerates a ```json fence', () => {
    const r = parseHighlightResult(
      '```json\n{"headline":"a","affects":"b","action":"c"}\n```'
    );
    expect(r).toEqual({ headline: 'a', affects: 'b', action: 'c' });
  });

  it('tolerates an object embedded in prose', () => {
    const r = parseHighlightResult(
      'Sure! Here is the JSON:\n{"headline":"a","affects":"b","action":"c"}\nHope that helps.'
    );
    expect(r).toEqual({ headline: 'a', affects: 'b', action: 'c' });
  });

  it('trims whitespace', () => {
    const r = parseHighlightResult('{"headline":"  a  ","affects":"b","action":"c"}');
    expect(r).toEqual({ headline: 'a', affects: 'b', action: 'c' });
  });
});

describe('parseHighlightResult — a refusal is a RESULT, not a failure', () => {
  it('reads the refusal shape and its reason', () => {
    const r = parseHighlightResult(
      '{"no_user_visible_effect":true,"reason":"Internal code tidy-up — nothing on any screen changes."}'
    );
    expect(r).not.toBeNull();
    expect(isRefusal(r!)).toBe(true);
    expect((r as { reason: string }).reason).toContain('Internal code tidy-up');
  });

  it('supplies a reason when the model omitted one', () => {
    const r = parseHighlightResult('{"no_user_visible_effect":true}');
    expect(isRefusal(r!)).toBe(true);
    expect((r as { reason: string }).reason).toBe('No user-visible effect.');
  });

  it('prefers the refusal when the model ALSO sent three apologetic lines', () => {
    // The real failure: a model that refuses helpfully, explaining in the
    // headline field that there is nothing to say. Checking the draft fields
    // first would publish that apology as a highlight.
    const r = parseHighlightResult(
      '{"no_user_visible_effect":true,"reason":"Nothing visible.",' +
        '"headline":"Nothing for you to do here","affects":"Nobody","action":"Nothing"}'
    );
    expect(isRefusal(r!)).toBe(true);
  });

  it('treats a false flag as an ordinary draft', () => {
    const r = parseHighlightResult(
      '{"no_user_visible_effect":false,"headline":"a","affects":"b","action":"c"}'
    );
    expect(isRefusal(r!)).toBe(false);
  });
});

describe('parseHighlightResult — null means nothing is filed', () => {
  // null makes the cron file NOTHING, so the entry re-qualifies next run. That
  // is the right failure: a half-parsed highlight is a wrong sentence published
  // unreviewed, and there is no approval step left to catch it.
  it.each([
    ['null input', null],
    ['empty string', ''],
    ['not JSON at all', 'I am sorry, I cannot help with that.'],
    ['malformed JSON', '{"headline": "a", '],
    ['an array', '[1,2,3]'],
    ['a bare string', '"just a sentence"'],
    ['missing action', '{"headline":"a","affects":"b"}'],
    ['missing affects', '{"headline":"a","action":"c"}'],
    ['missing headline', '{"affects":"b","action":"c"}'],
    ['blank headline', '{"headline":"   ","affects":"b","action":"c"}'],
    ['non-string field', '{"headline":123,"affects":"b","action":"c"}'],
  ])('returns null for %s', (_label, input) => {
    expect(parseHighlightResult(input as string | null)).toBeNull();
  });
});

describe('highlightDedupeKey', () => {
  it('is keyed on app and sha, never on the week', () => {
    // An entry that slid across a week boundary is still the same change and
    // must not be written up twice.
    expect(highlightDedupeKey('myjkkn', 'abc123')).toBe('whats_new_highlight|myjkkn|abc123');
  });

  it('separates the same sha in two applications', () => {
    expect(highlightDedupeKey('myjkkn', 'abc123')).not.toBe(
      highlightDedupeKey('poppys', 'abc123')
    );
  });
});
