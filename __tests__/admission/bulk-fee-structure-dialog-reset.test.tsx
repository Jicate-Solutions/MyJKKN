// @vitest-environment jsdom
//
// The wizard's state must not outlive a close. The parent mounts this dialog
// UNCONDITIONALLY (`<BulkFeeStructureDialog open={bulkOpen} …>` in
// fee-structures-list-view), so nothing unmounts when it closes and every
// useState inside survives. "Done" used to call the onOpenChange prop directly
// and skip reset(), so reopening after an import landed the operator back on
// the Done summary — no file input, no way forward except Esc.
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { BulkFeeStructureDialog } from '@/app/(routes)/admission/settings/fees-structure/_components/bulk-fee-structure-dialog';

// The dialog default-imports this one, not sonner.
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  // Radix measures with these; jsdom has neither.
  (globalThis as any).DOMRect ??= class { constructor(public x = 0, public y = 0, public width = 0, public height = 0) {} };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The apply response that puts the wizard on its final step. */
const APPLIED = { created: 2, updated: 1, failed: [] };

/**
 * A validate response thin enough to walk the wizard: one clean structure, so
 * every "next" button is enabled and Apply is allowed.
 */
const VALIDATED = {
  mode: 'validate',
  layout: 'unified',
  sheet: {
    name: 'Fee Structures', nameMatched: true, expectedName: 'Fee Structures',
    headerRow: 1, sheetNames: ['Fee Structures'], headers: ['Fee Structure ID', 'Name'],
    totalRows: 1, structures: 1, existing: 0, new: 1, fees: 1,
  },
  rawPreview: { headers: ['Fee Structure ID', 'Name'], rows: [{ row: 2, cells: ['', 'BEd - MQ - DS'] }], truncated: false },
  changes: [],
  changesError: null,
  rows: [{ row: 2, name: 'BEd - MQ - DS', action: 'create', errors: [] }],
  summary: { total: 1, valid: 1, errorRows: 0, create: 1, update: 0 },
  canApply: true,
  scheduleSummary: { structures: 1, items: 1 },
};

/** Mirrors the real parent: the dialog stays mounted across open/close. */
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen</button>
      <BulkFeeStructureDialog open={open} onOpenChange={setOpen} onImported={() => {}} />
    </>
  );
}

/** Drives upload → data → changes → validate → done. */
async function walkToDone() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'fees.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fireEvent.change(input, { target: { files: [file] } });

  fireEvent.click(screen.getByRole('button', { name: /read file/i }));
  await screen.findByRole('button', { name: /see what changes/i });

  fireEvent.click(screen.getByRole('button', { name: /see what changes/i }));
  fireEvent.click(screen.getByRole('button', { name: /^validate$/i }));
  fireEvent.click(screen.getByRole('button', { name: /apply 1 structure/i }));
  await screen.findByRole('button', { name: /^done$/i });
}

describe('BulkFeeStructureDialog — a close always returns to the upload step', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const mode = (init.body as FormData).get('mode');
      return {
        ok: true,
        status: 200,
        json: async () => (mode === 'validate' ? VALIDATED : APPLIED),
      } as Response;
    }));
  });

  it('"Done" clears the wizard, so reopening starts on a fresh upload step', async () => {
    render(<Harness />);
    await walkToDone();
    // The import really did finish: the summary is on screen.
    expect(screen.getByText(/2 created/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }));

    // Fresh upload step: the file picker is back and the summary is gone.
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read file/i })).toBeDisabled();
    expect(screen.queryByText(/2 created/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import another/i })).not.toBeInTheDocument();
  });

  // Two buttons answer to "Close": the footer's, and the X that DialogContent
  // renders for itself. They take different code paths — the footer button
  // calls close() directly, the X goes through Radix's onOpenChange — so both
  // are worth driving.
  const closeButtons = () => screen.getAllByRole('button', { name: /^close$/i });
  const footerClose = () => closeButtons().find((b) => b.className.includes('sm:w-auto'))!;
  const radixX = () => closeButtons().find((b) => !b.className.includes('sm:w-auto'))!;

  it.each([
    ['the footer Close button', footerClose],
    ['the dialog\'s own X', radixX],
  ])('%s drops the chosen file', async (_label, button) => {
    render(<Harness />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'fees.xlsx')] } });
    expect(screen.getByText('fees.xlsx')).toBeInTheDocument();

    fireEvent.click(button());
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }));

    expect(screen.queryByText('fees.xlsx')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read file/i })).toBeDisabled();
  });

  it('"Import another" resets but STAYS open — it is not a close', async () => {
    render(<Harness />);
    await walkToDone();

    fireEvent.click(screen.getByRole('button', { name: /import another/i }));

    // Still open, back at the start, nothing carried over.
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(screen.queryByText(/2 created/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read file/i })).toBeDisabled();
  });
});
