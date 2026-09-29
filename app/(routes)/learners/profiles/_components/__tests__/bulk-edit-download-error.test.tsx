// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return { default: toast };
});

vi.mock('@/hooks/use-institution-hierarchy', () => ({
  useInstitutionHierarchy: () => ({
    institutions: [],
    degrees: [],
    departments: [],
    programs: [],
    semesters: [],
    sections: [],
    isLoading: false,
  }),
}));

import toast from 'react-hot-toast';
import { BulkEditActiveDialog } from '../bulk-edit-exited-dialog';

// BUG-005951 / BUG-004013: the "Download Data" step of Bulk Edit Active showed
// a fixed "Failed to download template" for every refusal. The server's own
// reason (captured in both reports' console logs) never reached the user.
describe('Bulk Edit Active — download refusal', () => {
  const serverReason = 'You do not have permission to bulk edit active learners';

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, error: serverReason }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows the server's reason, not a generic failure", async () => {
    render(<BulkEditActiveDialog />);
    fireEvent.click(screen.getByRole('button', { name: /bulk edit active/i }));
    fireEvent.click(await screen.findByRole('button', { name: /download data/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith(serverReason);
    expect(toast.error).not.toHaveBeenCalledWith('Failed to download template');
  });
});
