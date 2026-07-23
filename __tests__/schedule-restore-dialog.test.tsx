// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(() => cleanup());

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import ScheduleRestoreDialog from '@/app/(routes)/organizations/school-defaults/_components/schedule-restore-dialog';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
    },
  }),
}));

vi.mock('@/lib/services/school-defaults-restore-service', () => ({
  SchoolDefaultsRestoreService: {
    scheduleRestore: vi.fn(() => Promise.resolve('restore-id-123')),
  },
}));

describe('ScheduleRestoreDialog', () => {
  it('renders with date/time picker when open', () => {
    render(<ScheduleRestoreDialog open={true} selectedRecords={['id-1', 'id-2']} onOpenChange={() => {}} />);

    expect(screen.getByText(/Schedule Restore/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Scheduled for/i)).toBeInTheDocument();
  });

  it('defaults to current date + 1 hour', () => {
    render(<ScheduleRestoreDialog open={true} selectedRecords={['id-1']} onOpenChange={() => {}} />);

    const timeInput = screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    const selectedTime = new Date(timeInput.value);
    const now = new Date();

    expect(selectedTime.getTime()).toBeGreaterThan(now.getTime());
    expect(selectedTime.getTime() - now.getTime()).toBeLessThan(90 * 60 * 1000); // ~1 hour
  });

  it('calls scheduleRestore on submit', async () => {
    const onSchedule = vi.fn();
    render(
      <ScheduleRestoreDialog
        open={true}
        selectedRecords={['id-1']}
        onOpenChange={() => {}}
        onScheduled={onSchedule}
      />
    );

    const scheduleBtn = screen.getByRole('button', { name: /Schedule/i });
    fireEvent.click(scheduleBtn);

    await waitFor(() => {
      expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ recordIds: ['id-1'] }));
    });
  });
});
