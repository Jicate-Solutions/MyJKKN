/**
 * BUG-005856 (IMS, 19 Aug, screen 1536x730): "The Add Supplier modal is
 * oversized and overflows the screen, hiding the header and create supplier
 * button."
 *
 * The shared DialogContent is centred with translate(-50%) and has no height
 * cap, so a form taller than the window is clipped at BOTH ends. This form
 * has ten fields (~800px). Fix = the repo's existing tall-form layout
 * (billing/payment-accounts/account-form-dialog): the dialog is a flex column
 * capped at 90dvh, the title and the footer do not shrink, and only the
 * fields scroll.
 *
 * jsdom has no layout engine, so this guards the structure of the Add/Edit
 * Supplier dialog. Production check after deploy: at 1536x730 the title and
 * the Create Supplier button are both on screen.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const PAGE = path.resolve(__dirname, '../../app/(routes)/ims/settings/suppliers/page.tsx');

function supplierDialogSource(): string {
  const src = readFileSync(PAGE, 'utf8');
  const start = src.indexOf('{/* Add/Edit Supplier Dialog */}');
  expect(start, 'Add/Edit Supplier dialog marker not found').toBeGreaterThan(-1);
  const end = src.indexOf('</DialogContent>', start);
  return src.slice(start, end);
}

const classOf = (block: string, tag: string) =>
  block.match(new RegExp(`<${tag} className="([^"]+)"`))?.[1] ?? '';

describe('Add/Edit Supplier dialog fits a short laptop screen', () => {
  const block = supplierDialogSource();

  it('is a flex column capped to the window', () => {
    const c = classOf(block, 'DialogContent');
    expect(c).toMatch(/\bflex\b/);
    expect(c).toMatch(/\bflex-col\b/);
    expect(c).toMatch(/\bmax-h-\[90dvh\]/);
  });

  it('keeps the title and the Create button fixed', () => {
    expect(classOf(block, 'DialogHeader')).toMatch(/\bshrink-0\b/);
    expect(classOf(block, 'DialogFooter')).toMatch(/\bshrink-0\b/);
  });

  it('scrolls only the fields', () => {
    const body = block.match(/<div className="([^"]*grid[^"]*)">/)?.[1] ?? '';
    expect(body).toMatch(/\boverflow-y-auto\b/);
    expect(body).toMatch(/\bmin-h-0\b/);
    expect(body).toMatch(/\bflex-1\b/);
  });
});
