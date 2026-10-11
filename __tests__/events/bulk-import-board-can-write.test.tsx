// @vitest-environment jsdom
// #4347 round 4: bulk-register admits fewer people than the Bulk Import tab's
// canManage. The board asks the server (?action=can-write) and hides its
// Import / Download template buttons when the caller may not write, instead of
// letting them hit a 403 toast.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const access = vi.hoisted(() => ({ data: undefined as boolean | undefined, isLoading: false }));
vi.mock('@/hooks/events/shared/use-event-bulk-register', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/events/shared/use-event-bulk-register')>()),
  useEventCategoryCodes: () => ({ data: [] }),
  useImportRoster: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDownloadRosterTemplate: () => vi.fn(),
  useCanWriteRegistrations: () => ({ data: access.data, isLoading: access.isLoading }),
}));

import { BulkImportBoard } from '@/components/events/shared/bulk-import-board';

const EV = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  cleanup();
  access.data = undefined;
  access.isLoading = false;
});

describe('BulkImportBoard write access', () => {
  it('hides the buttons and explains why when the server says the caller may not write', () => {
    access.data = false;
    render(<BulkImportBoard eventId={EV} canManage />);
    expect(screen.getByText(/Only the event's organisers can bulk-import registrations/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /template/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();
    expect(screen.queryByText(/Bulk Import/)).toBeNull();
  });

  it('shows the board with Download template when the caller may write', () => {
    access.data = true;
    render(<BulkImportBoard eventId={EV} canManage />);
    expect(screen.getByText('Bulk Import')).toBeTruthy();
    expect(screen.getByRole('button', { name: /template/i })).toBeTruthy();
    expect(screen.queryByText(/Only the event's organisers/)).toBeNull();
  });

  it('shows no buttons while access is still being checked', () => {
    access.isLoading = true;
    render(<BulkImportBoard eventId={EV} canManage />);
    expect(screen.getByText(/Checking access/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /template/i })).toBeNull();
  });
});
