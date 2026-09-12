// @vitest-environment jsdom
/**
 * /hr/workload/settings — what the viewer sees: one row per institution with
 * "not set" where nothing is saved, an EXPLICIT access refusal on 403 (no
 * redirect), a per-row validation message, and the save payload.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h: { settings: any; save: any } = { settings: {}, save: {} };

vi.mock('@/hooks/hr/recruitment-need/use-workload-settings', async () => {
  const actual = await vi.importActual<any>('@/hooks/hr/recruitment-need/use-workload-settings');
  return {
    WorkloadSettingsRequestError: actual.WorkloadSettingsRequestError,
    useWorkloadSettings: () => h.settings,
    useSaveWorkloadSettings: () => h.save,
  };
});
vi.mock('@/components/layout/content-layout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import WorkloadSettingsPage from '@/app/(routes)/hr/workload/settings/page';
import { WorkloadSettingsRequestError } from '@/hooks/hr/recruitment-need/use-workload-settings';

const INST_A = '11111111-1111-1111-1111-111111111111';
const INST_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  h.save = { mutateAsync: vi.fn(async (input: any) => input), isPending: false };
});

describe('Workload settings page', () => {
  it('shows an explicit "You don\'t have access" card on 403 instead of redirecting', () => {
    h.settings = {
      data: undefined,
      isLoading: false,
      error: new WorkloadSettingsRequestError(
        "You don't have access to workload settings. Only HR Admin and Super Admin can view or change them — contact your HR Admin.",
        403
      ),
    };
    render(<WorkloadSettingsPage />);
    expect(screen.getByText("You don't have access")).toBeTruthy();
    expect(screen.getByText(/Only HR Admin and Super Admin/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders one row per institution and marks the unset one', () => {
    h.settings = {
      data: [
        { institution_id: INST_A, institution_name: 'Dental', expected_weekly_hours: 18, amber_pct: 100, red_pct: 120, updated_at: null },
        { institution_id: INST_B, institution_name: 'Nursing', expected_weekly_hours: null, amber_pct: null, red_pct: null, updated_at: null },
      ],
      isLoading: false,
      error: null,
    };
    render(<WorkloadSettingsPage />);
    expect(screen.getByText('Dental')).toBeTruthy();
    expect(screen.getByText('Nursing')).toBeTruthy();
    expect(screen.getAllByText('not set')).toHaveLength(1);
    expect((screen.getByLabelText('Expected weekly hours for Dental') as HTMLInputElement).value).toBe('18');
    expect((screen.getByLabelText('Expected weekly hours for Nursing') as HTMLInputElement).value).toBe('');
  });

  it('refuses red below amber on the row itself and does not call the API', async () => {
    h.settings = {
      data: [{ institution_id: INST_A, institution_name: 'Dental', expected_weekly_hours: 18, amber_pct: 100, red_pct: 120, updated_at: null }],
      isLoading: false,
      error: null,
    };
    render(<WorkloadSettingsPage />);
    fireEvent.change(screen.getByLabelText('Red percentage for Dental'), { target: { value: '90' } });
    fireEvent.click(screen.getByLabelText('Save Dental'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Red threshold must be higher than amber/));
    expect(h.save.mutateAsync).not.toHaveBeenCalled();
  });

  it('saves a free (decimal) expected-hours figure for that one institution', async () => {
    h.settings = {
      data: [
        { institution_id: INST_A, institution_name: 'Dental', expected_weekly_hours: null, amber_pct: null, red_pct: null, updated_at: null },
      ],
      isLoading: false,
      error: null,
    };
    render(<WorkloadSettingsPage />);
    fireEvent.change(screen.getByLabelText('Expected weekly hours for Dental'), { target: { value: '18.5' } });
    fireEvent.change(screen.getByLabelText('Amber percentage for Dental'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Red percentage for Dental'), { target: { value: '120' } });
    fireEvent.click(screen.getByLabelText('Save Dental'));
    await waitFor(() => expect(h.save.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.save.mutateAsync).toHaveBeenCalledWith({
      institution_id: INST_A,
      expected_weekly_hours: 18.5,
      amber_pct: 100,
      red_pct: 120,
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
  });
});
