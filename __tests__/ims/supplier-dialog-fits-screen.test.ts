/**
 * BUG-005856 (IMS, 19 Aug, screen 1536x730): "The Add Supplier modal is
 * oversized and overflows the screen, hiding the header and create supplier
 * button."
 *
 * The shared DialogContent is centred with translate(-50%) and has no height
 * cap, so a form taller than the window is clipped at BOTH ends — the title
 * and the footer button fall off-screen with no scrollbar. This form has ten
 * fields (~800px). The fix caps the dialog at 90% of the window and scrolls
 * inside it — the pattern 88 other pages already use.
 *
 * jsdom has no layout engine, so this guards the class on the Add/Edit
 * Supplier dialog itself. Production check after deploy: the replay at
 * 1536x730 must show the title and the Create Supplier button.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const PAGE = path.resolve(__dirname, '../../app/(routes)/ims/settings/suppliers/page.tsx');

function supplierDialogClassName(): string {
  const src = readFileSync(PAGE, 'utf8');
  const marker = src.indexOf('{/* Add/Edit Supplier Dialog */}');
  expect(marker, 'Add/Edit Supplier dialog marker not found').toBeGreaterThan(-1);
  const m = src.slice(marker).match(/<DialogContent className="([^"]+)"/);
  expect(m, 'DialogContent not found after the marker').not.toBeNull();
  return m![1];
}

describe('Add/Edit Supplier dialog fits a short laptop screen', () => {
  it('caps its height to the window', () => {
    expect(supplierDialogClassName()).toMatch(/\bmax-h-\[90vh\]/);
  });
  it('scrolls inside instead of clipping the header and the Create button', () => {
    expect(supplierDialogClassName()).toMatch(/\boverflow-y-auto\b/);
  });
});
