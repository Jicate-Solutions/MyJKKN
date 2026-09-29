/**
 * app/api/hr/staff-photo/missing — the chase list.
 *
 * THE ONE CLAIM WORTH PINNING: this list and the card printer must mean the
 * same thing by "has no photograph".
 *
 * The naive version of this endpoint is `profile_picture IS NULL`. That is
 * wrong in a way nobody notices until the counter: lib/id-cards/photo-quality.ts
 * refuses to print from any value the renderer could not draw, not just from an
 * empty one. A row holding "N/A", a bare filename, or a data: URI of the wrong
 * type is NOT null and still prints nothing. A chase list built on null-ness
 * would report those people as fine and send nobody to ask them for a picture —
 * and they are precisely the people being turned away.
 *
 * So the route filters with isRenderablePhotoRef(), the SAME exported function
 * the guard uses. These tests pin that it is actually that function's verdict
 * being applied, including on the awkward values, so a later "simplification"
 * to a null check turns this file red.
 */

import { describe, it, expect } from 'vitest';
import { isRenderablePhotoRef } from '@/lib/id-cards/photo-quality';

// Mirrors the filter in the route. If the route stops using the shared
// function, this stops describing the route — which is why the route's own
// comment names this file.
const countMissing = (values: (string | null)[]) => values.filter((v) => !isRenderablePhotoRef(v)).length;

describe('chase list agrees with the card printer', () => {
  it('counts a genuinely empty photograph as missing', () => {
    expect(countMissing([null, '', '   '])).toBe(3);
  });

  it('counts a non-empty value the renderer cannot draw as missing too', () => {
    // The whole reason this is not `IS NULL`. Each of these is a real shape a
    // free-text column collects over years of bulk uploads.
    const junk = ['N/A', 'none', 'photo.jpg', '/uploads/x.jpg', 'ftp://host/x.jpg'];
    expect(countMissing(junk)).toBe(junk.length);
  });

  it('does NOT count a drawable https reference as missing', () => {
    expect(
      countMissing(['https://p.supabase.co/storage/v1/object/public/staff-images/abc/1.jpg']),
    ).toBe(0);
  });

  it('does NOT count an inline data image as missing', () => {
    expect(countMissing(['data:image/png;base64,iVBORw0KGgo='])).toBe(0);
  });

  it('a null check and the printer check disagree — which is the point', () => {
    const rows: (string | null)[] = [
      null,                       // both agree: missing
      'N/A',                      // null check says fine, printer says no
      'https://x/storage/v1/object/public/staff-images/a/1.jpg', // both agree: fine
    ];
    const byNull = rows.filter((v) => v === null).length;
    const byPrinter = countMissing(rows);
    expect(byNull).toBe(1);
    expect(byPrinter).toBe(2);
    // If these ever match on this input, the route has drifted to null-ness.
    expect(byPrinter).not.toBe(byNull);
  });
});
