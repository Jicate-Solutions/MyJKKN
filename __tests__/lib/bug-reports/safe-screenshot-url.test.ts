// ============================================================================
// safeScreenshotUrl — the screenshot is now a LINK, so its stored value is a
// navigation target, not just an image source.
//
// Buckets `bug-screenshots` and `bug-reports` are public=true and all 3435
// stored values are Supabase public-object URLs, so no signed-URL work is
// needed — but a value that is not one of ours must render nothing rather than
// become an href.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { safeScreenshotUrl } from '@/lib/bug-reports/safe-screenshot-url';

const REAL =
  'https://xyz.supabase.co/storage/v1/object/public/bug-reports/screenshots/bug-003162.png';

describe('safeScreenshotUrl — accepts the real shape', () => {
  it('returns a Supabase public-object URL unchanged', () => {
    expect(safeScreenshotUrl(REAL)).toBe(REAL);
  });

  it('accepts the bug-screenshots bucket too', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/public/bug-screenshots/a.png';
    expect(safeScreenshotUrl(url)).toBe(url);
  });
});

describe('safeScreenshotUrl — refuses anything else', () => {
  it('null is null', () => {
    expect(safeScreenshotUrl(null)).toBeNull();
  });

  it('an empty string is null', () => {
    expect(safeScreenshotUrl('')).toBeNull();
  });

  it('javascript: is null — this value lands in an href', () => {
    expect(safeScreenshotUrl('javascript:alert(1)')).toBeNull();
  });

  it('data: is null', () => {
    expect(safeScreenshotUrl('data:image/svg+xml,<svg onload="alert(1)"/>')).toBeNull();
  });

  it('a relative value is null', () => {
    expect(safeScreenshotUrl('/storage/v1/object/public/bug-reports/a.png')).toBeNull();
  });

  it('an http(s) URL that is not a public storage object is null', () => {
    expect(safeScreenshotUrl('https://evil.example.com/a.png')).toBeNull();
  });

  it('a signed-object path is null (we render public objects only)', () => {
    expect(safeScreenshotUrl('https://xyz.supabase.co/storage/v1/object/sign/bug-reports/a.png'))
      .toBeNull();
  });
});
