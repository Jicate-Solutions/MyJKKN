import { describe, expect, it } from 'vitest';
import { deriveBreadcrumbs } from '@/lib/navigation/derive-breadcrumbs';

// The QR sticker page lives at /instasolver/r/<code>. The trail used to read
// "R" and then the raw sticker code; on a phone only those two crumbs show.
describe('InstaSolver scan page breadcrumbs', () => {
  const labels = (path: string) => deriveBreadcrumbs(path).map((c) => c.label);

  it('names the scan folder in plain words', () => {
    expect(labels('/instasolver/r').at(-1)).toBe('Scan to report');
  });

  it('shows a sticker code as Details, not the raw code', () => {
    const trail = labels('/instasolver/r/res_0123456789abcdef0123');
    expect(trail.slice(-2)).toEqual(['Scan to report', 'Details']);
    expect(trail.join(' ')).not.toMatch(/res_/i);
  });

  it('still title-cases ordinary unknown segments', () => {
    expect(labels('/instasolver/some-new-page').at(-1)).toBe('Some New Page');
  });
});
