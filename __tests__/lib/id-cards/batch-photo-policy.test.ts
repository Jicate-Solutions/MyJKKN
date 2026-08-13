// __tests__/lib/id-cards/batch-photo-policy.test.ts
// 2026-07-25 — batch-print policy coverage (Director-locked decisions):
//   • default "Which learners?" = Active + newly admitted
//   • hasPrintablePhoto mirrors the render engine's photo fallback chain
//     (learners_profiles.student_photo_url → profiles.avatar_url)

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
    expect(hasPrintablePhoto('https://cdn.example/p.jpg', null)).toBe(true);
    expect(hasPrintablePhoto('data:image/png;base64,abc', null)).toBe(true);
  });

  it('true when only the account avatar is set (render fallback chain)', () => {
    expect(hasPrintablePhoto(null, 'https://cdn.example/avatar.png')).toBe(
      true
    );
    expect(hasPrintablePhoto('', 'https://cdn.example/avatar.png')).toBe(true);
  });

  it('false when both links of the chain are empty', () => {
    expect(hasPrintablePhoto(null, null)).toBe(false);
    expect(hasPrintablePhoto('', '')).toBe(false);
    expect(hasPrintablePhoto('   ', null)).toBe(false);
    expect(hasPrintablePhoto(null, '  ')).toBe(false);
  });

  it('false for junk values the render engine cannot draw (real prod shapes)', () => {
    // A roll number stored in the photo column
    expect(hasPrintablePhoto('EM25305', null)).toBe(false);
    // A bare filename with no scheme
    expect(hasPrintablePhoto('GRACIA.JPEG', null)).toBe(false);
    // A scanner export name with spaces
    expect(hasPrintablePhoto('DocScanner 25 Sep 2025 18-11-1', null)).toBe(
      false
    );
    // A bare numeric identifier
    expect(hasPrintablePhoto('731325105015', null)).toBe(false);
    // Junk in the avatar slot is equally unprintable
    expect(hasPrintablePhoto(null, 'vigneshwaran')).toBe(false);
  });

  it('a renderable value in either slot outweighs junk in the other', () => {
    expect(hasPrintablePhoto('EM25305', 'https://cdn.example/a.png')).toBe(
      true
    );
    expect(hasPrintablePhoto('https://cdn.example/p.jpg', 'junk')).toBe(true);
  });

  it('accepts scheme case-insensitively, matching the engine regex', () => {
    expect(hasPrintablePhoto('HTTPS://cdn.example/p.jpg', null)).toBe(true);
    expect(hasPrintablePhoto('http://cdn.example/p.jpg', null)).toBe(true);
  });
});
