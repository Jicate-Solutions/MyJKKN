/**
 * What's New — the three rules that decide what a reader sees.
 *
 * These exist because an integration review pointed out that stripBugRefs,
 * INTERNAL_ENGINEERING and CONTENT_FREE had no regression net at all: any of the
 * three could have silently stopped firing and the rest of the suite would still
 * have gone green. They were extracted out of scripts/generate-changelog.mjs
 * (which runs git at import time, so a test cannot import it) into
 * lib/changelog/title-rules.mjs for exactly this reason.
 *
 * Every "should NOT match" case below is a real title that a looser version of
 * the rule deleted, or would have. Those are the important half: a rule that
 * eats real news is far worse than one that lets a dull title through.
 */
import { describe, it, expect } from 'vitest';
import {
  stripBugRefs,
  isInternalEngineering,
  isContentFree,
  redactIdentifiers,
} from '@/lib/changelog/title-rules.mjs';

describe('stripBugRefs — trailing bug-tracker noise', () => {
  it('strips a plain trailing reference', () => {
    expect(stripBugRefs('Fix the receipt total [BUG-004123]')).toBe('Fix the receipt total');
  });

  it('strips a reference carrying a # prefix', () => {
    // The live regression: '#' before BUG defeated the original pattern, so
    // "Per-stall accountability — backbone + UI (#BUG-003146)" shipped with the
    // bracket still attached.
    expect(stripBugRefs('Per-stall accountability — backbone + UI (#BUG-003146)')).toBe(
      'Per-stall accountability — backbone + UI'
    );
  });

  it('strips a run of them', () => {
    expect(
      stripBugRefs('Rework the filter [BUG-004123][BUG-004121][BUG-004120]')
    ).toBe('Rework the filter');
  });

  it('strips the auto-triage form', () => {
    expect(
      stripBugRefs('Surface plain-English reasons [auto-triage BUG-004394 BUG-004352]')
    ).toBe('Surface plain-English reasons');
  });

  it('leaves a reference that is NOT at the end alone', () => {
    // It is a TAIL rule on purpose. Here the id sits mid-sentence and the rest of
    // the title carries meaning, so removing the bracket would orphan the text.
    const s = 'Scope approval notifications to the applicant institution (BUG-005884) + SoI wind-down';
    expect(stripBugRefs(s)).toBe(s);
  });

  it('leaves an ordinary title untouched', () => {
    const s = 'A council seat can no longer be given two active holders';
    expect(stripBugRefs(s)).toBe(s);
  });
});

describe('isInternalEngineering — build-toolchain noise', () => {
  it.each([
    'Resolve Next.js 16 prerender build errors with Cache Components',
    'Two type errors found by typecheck',
    'Resolve 3 pre-existing TypeScript errors blocking CI',
    'PR 4b step 7 — lint fixes (no setState in effect)',
    'Export normalizeRoute so Turbopack dev can resolve the import',
    'Wrap useSearchParams in a Suspense boundary',
    'Await dynamic params in taxonomy API route (Next.js 16)',
  ])('drops %s', (title) => {
    expect(isInternalEngineering(title)).toBe(true);
  });

  it.each([
    // Each of these was deleted by a looser keyword sweep during development and
    // is real, user-visible news.
    'RACI picker for the improvement board',
    'Bump fetch limit 100 → 500 so the whole cohort loads',
    'Pre-commit dialog no longer swallows the message',
    'Await searchParams on check-in page (Next 16) so enrollmentId reaches the form',
  ])('keeps %s', (title) => {
    expect(isInternalEngineering(title)).toBe(false);
  });
});

describe('isContentFree — titles that name a place and nothing else', () => {
  it.each(['Bos issue', 'Import issue', 'Deploy issue', 'Email issue', 'Meeting issue'])(
    'drops %s',
    (title) => {
      expect(isContentFree(title)).toBe(true);
    }
  );

  it.each([
    // The word cap is what keeps the rule safe — four words that name a specific
    // screen survive.
    'Parent portal login issue',
    'Timetable Day-wise Attendance issue',
    'Board member permission issue',
    // 'fix' and 'error' are deliberately not content-free nouns.
    'Bos examiner pdf alignment fix',
  ])('keeps %s', (title) => {
    expect(isContentFree(title)).toBe(false);
  });
});

describe('redactIdentifiers — details that should not travel with a change', () => {
  it('removes an email address', () => {
    // The real entry that prompted the rule.
    expect(
      redactIdentifiers('Preview exit restores admin session + add someone@jkkn.ac.in to write-mode allowlist')
    ).toBe('Preview exit restores admin session + add [email removed] to write-mode allowlist');
  });

  it('removes a 10-digit mobile number', () => {
    expect(redactIdentifiers('Send the reminder to 9876543210 on failure')).toBe(
      'Send the reminder to [number removed] on failure'
    );
  });

  it('leaves ordinary numbers alone', () => {
    // Deliberately narrow: years, counts, amounts and bug ids all survive. A rule
    // that ate these would strip the meaning out of most titles.
    const kept = [
      'Bump fetch limit 100 to 500 so the whole cohort loads',
      '885 leaves were taken before anyone approved them',
      'Late fee of 43850000 shown against the wrong term',
      'Await dynamic params in the 2026 intake route',
    ];
    for (const s of kept) expect(redactIdentifiers(s)).toBe(s);
  });

  it('leaves a title with nothing to redact untouched', () => {
    const s = 'A council seat can no longer be given two active holders';
    expect(redactIdentifiers(s)).toBe(s);
  });
});
