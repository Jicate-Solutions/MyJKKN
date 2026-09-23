// __tests__/lib/id-cards/batch-photo-policy.test.ts
// 2026-07-25 — batch-print policy coverage (Director-locked decisions):
//   • default "Which learners?" = Active + newly admitted
//   • hasPrintablePhoto mirrors GUARD 3 on the print endpoint — since
//     2026-09-03 that means learners_profiles.student_photo_url ONLY; the
//     profiles.avatar_url fallback no longer qualifies

import { describe, it, expect, vi } from 'vitest';

// The component's import chain reaches createClientSupabaseClient at module
// init (hooks → role-service), which throws without Supabase env vars. Only
// the pure helpers/constants are under test — stub the client.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}) as never
}));

import {
  DEFAULT_STATUS_CHOICE,
  STATUS_CHOICES,
  hasPrintablePhoto
} from '@/components/admin/id-cards/id-card-batch-print';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DEFAULT_STATUS_CHOICE', () => {
  it('defaults to Active + newly admitted (Director 2026-07-25)', () => {
    expect(DEFAULT_STATUS_CHOICE).toBe('active_admitted');
  });

  it('maps to the active/admitted/account lifecycle statuses', () => {
    const choice = STATUS_CHOICES.find(
      (c) => c.value === DEFAULT_STATUS_CHOICE
    );
    expect(choice).toBeDefined();
    expect(choice?.statuses).toEqual(['active', 'admitted', 'account']);
  });
});

describe('hasPrintablePhoto', () => {
  it('true when the learner photo column holds a renderable value', () => {
    expect(hasPrintablePhoto('https://cdn.example/p.jpg')).toBe(true);
    expect(hasPrintablePhoto('data:image/png;base64,abc')).toBe(true);
  });

  it('FALSE when there is no institutional photo (reversed 2026-09-03)', () => {
    // This asserted `true` until 2026-09-03, mirroring the render engine's
    // fallback to profiles.avatar_url. The Director withdrew that: only a
    // photograph the institution took qualifies, with no override. This screen
    // must agree with Guard 3 on POST /api/id-cards/jobs, or the office is
    // offered learners the printer will refuse.
    expect(hasPrintablePhoto(null)).toBe(
      false
    );
    expect(hasPrintablePhoto('')).toBe(false);
  });

  it('false when both links of the chain are empty', () => {
    expect(hasPrintablePhoto(null)).toBe(false);
    expect(hasPrintablePhoto('')).toBe(false);
    expect(hasPrintablePhoto('   ')).toBe(false);
    expect(hasPrintablePhoto(null)).toBe(false);
  });

  it('false for junk values the render engine cannot draw (real prod shapes)', () => {
    // A roll number stored in the photo column
    expect(hasPrintablePhoto('EM25305')).toBe(false);
    // A bare filename with no scheme
    expect(hasPrintablePhoto('GRACIA.JPEG')).toBe(false);
    // A scanner export name with spaces
    expect(hasPrintablePhoto('DocScanner 25 Sep 2025 18-11-1')).toBe(
      false
    );
    // A bare numeric identifier
    expect(hasPrintablePhoto('731325105015')).toBe(false);
    // Junk in the avatar slot is equally unprintable
    expect(hasPrintablePhoto(null)).toBe(false);
  });

  it('only the institutional photo decides — nothing else can rescue junk', () => {
    // Reversed 2026-09-03. A roll number in the photo column is still junk even
    // when a perfectly good account picture sits beside it: the account picture
    // is not evidence the institution photographed anyone.
    expect(hasPrintablePhoto('EM25305')).toBe(
      false
    );
    // And a real institutional photo still wins regardless of what the avatar holds.
    expect(hasPrintablePhoto('https://cdn.example/p.jpg')).toBe(true);
  });

  it('accepts scheme case-insensitively, matching the engine regex', () => {
    expect(hasPrintablePhoto('HTTPS://cdn.example/p.jpg')).toBe(true);
    expect(hasPrintablePhoto('http://cdn.example/p.jpg')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression guard — the withdrawn override must not come back
// ---------------------------------------------------------------------------
//
// Until 2026-09-23 this screen carried an "include learners without photos"
// checkbox. GUARD 3 on POST /api/id-cards/jobs had already been made
// no-override (Director 2026-09-03), so every card the checkbox queued came
// back 422: the screen offered an outcome the server refused. Three earlier
// surfaces had the same defect (#3262, #3264); this one was missed.
//
// Comments are STRIPPED before matching — the component's own header records
// the removal in prose, and a structural test that reads its own explanation
// proves nothing.
describe('no include-learners-without-photos override (Director 2026-09-03)', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'components/admin/id-cards/id-card-batch-print.tsx'
    ),
    'utf8'
  );

  /** Strip block and line comments so prose cannot satisfy or trip the test. */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

  it('strips comments but keeps real code (test is not vacuous)', () => {
    expect(code).toContain('hasPrintablePhoto');
    expect(source).toContain('checkbox lived here until');
    expect(code).not.toContain('checkbox lived here until');
  });

  it('carries no include-no-photo state or control', () => {
    expect(code).not.toMatch(/includeNoPhoto/i);
    expect(code).not.toMatch(/include-no-photo/i);
    expect(code).not.toMatch(/<Checkbox/);
  });

  it('never tells the office to tick a box to print anyway', () => {
    expect(code).not.toMatch(/tick "Include learners without photos"/i);
    expect(code).not.toMatch(/initials-box cards anyway/i);
  });

  it('skips a learner with no photo unconditionally', () => {
    expect(code).toContain('if (!hasPrintablePhoto(l.student_photo_url)) {');
  });
});
