// @vitest-environment jsdom
/**
 * "Where did you work?" on a compensatory off claim (2026-09-11).
 *
 * HR needs to know whether a claimed holiday / week-off was worked inside or
 * outside the campus, and where. The rule lives in three places that must
 * agree: the table's CHECKs + trg_hcoc_require_work_location (the wall),
 * CompOffService.claimWorkedDays (names the fix before any upload), and the
 * dialog (gates Submit). This pins the last two.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { CompOffService } from '@/lib/services/hr/comp-off-service';

const mutateAsync = vi.fn();

vi.mock('@/hooks/hr/use-comp-off', () => ({
  useClaimWorkedDays: () => ({ mutateAsync, isPending: false }),
  useCompOffBalance: () => ({ data: { credits: [] } }),
}));
// Every picked day is free.
vi.mock('@/hooks/hr/use-day-occupancy', () => ({
  useDaysOccupancy: (_e: string, dates: string[]) =>
    Object.fromEntries(dates.map((d) => [d, null])),
}));
// The real day grid is react-day-picker; the dialog only needs "these days were picked".
vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect: (d: Date[]) => void }) => (
    <button type="button" onClick={() => {
      const d = new Date();
      d.setDate(d.getDate() - 3);
      onSelect([d]);
    }}>
      pick a worked day
    </button>
  ),
}));
vi.mock('@/hooks/hr/use-attendance-records', () => ({
  useClosedAttendanceMonths: () => new Set<string>(),
}));
vi.mock('@/hooks/hr/use-time-off-context', () => ({
  useTimeOffContext: () => ({
    employeeId: 'emp-1', hrOrgId: 'org-1', institutionId: 'inst-1',
    isLoading: false, hasEmployeeRecord: true, hrIncluded: true,
  }),
}));
// The real picker is a Drive-upload widget; all the dialog needs from it is
// "a file was picked".
vi.mock('@/app/(routes)/hr/leave/_components/leave-document-upload', () => ({
  LeaveDocumentUpload: ({ onChange }: { onChange: (f: File[]) => void }) => (
    <button type="button" onClick={() => onChange([new File(['x'], 'proof.pdf')])}>
      attach proof
    </button>
  ),
}));

import { ClaimWorkedDayDialog } from '@/app/(routes)/hr/leave/_components/claim-worked-day-dialog';

const doc = { file_id: 'f1', name: 'proof.pdf', url: 'https://drive/x', mime_type: 'application/pdf' };

function fakeSupabase() {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      insert: (rows: Record<string, unknown>[]) => {
        inserted.push(...rows);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserted };
}

const base = {
  hr_organization_id: 'org-1',
  employee_id: 'emp-1',
  worked_dates: ['2026-09-06'],
  documents: [doc] as never[],
};

describe('CompOffService.claimWorkedDays — work location', () => {
  it('refuses a claim that does not say where the day was worked', async () => {
    const { client, inserted } = fakeSupabase();
    await expect(
      CompOffService.claimWorkedDays(client, { ...base, work_location: null })
    ).rejects.toThrow(/inside or outside the campus/i);
    expect(inserted).toHaveLength(0);
  });

  it('refuses outside campus without a place', async () => {
    const { client, inserted } = fakeSupabase();
    await expect(
      CompOffService.claimWorkedDays(client, {
        ...base, work_location: 'outside_campus', work_place: '   ',
      })
    ).rejects.toThrow(/place you worked/i);
    expect(inserted).toHaveLength(0);
  });

  it('stores outside campus with the trimmed place', async () => {
    const { client, inserted } = fakeSupabase();
    await CompOffService.claimWorkedDays(client, {
      ...base, work_location: 'outside_campus', work_place: '  Chennai – NAAC visit ',
    });
    expect(inserted[0]).toMatchObject({
      work_location: 'outside_campus', work_place: 'Chennai – NAAC visit',
      source: 'claim', status: 'pending',
    });
  });

  it('drops a stray place on inside campus instead of letting the CHECK refuse it', async () => {
    const { client, inserted } = fakeSupabase();
    await CompOffService.claimWorkedDays(client, {
      ...base, work_location: 'inside_campus', work_place: 'typed before switching',
    });
    expect(inserted[0]).toMatchObject({ work_location: 'inside_campus', work_place: null });
  });
});

describe('Claim a worked day dialog — work location', () => {
  beforeEach(() => {
    mutateAsync.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(doc), { status: 200 })));
  });
  afterEach(() => {
    cleanup();
    mutateAsync.mockReset();
    vi.unstubAllGlobals();
  });

  function fillEverythingButLocation() {
    render(<ClaimWorkedDayDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'pick a worked day' }));
    fireEvent.click(screen.getByRole('button', { name: 'attach proof' }));
    return screen.getByRole('button', { name: /submit claim/i });
  }

  it('keeps Submit disabled until a location is chosen', () => {
    const submit = fillEverythingButLocation();
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Inside campus' }));
    expect(submit).toBeEnabled();
    expect(screen.queryByLabelText(/place of work/i)).not.toBeInTheDocument();
  });

  it('asks for the place only for outside campus, and requires it', async () => {
    const submit = fillEverythingButLocation();

    fireEvent.click(screen.getByRole('radio', { name: 'Outside campus' }));
    const place = screen.getByLabelText(/place of work/i);
    expect(submit).toBeDisabled();

    fireEvent.change(place, { target: { value: ' Chennai – NAAC visit ' } });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      work_location: 'outside_campus',
      work_place: 'Chennai – NAAC visit',
    });
  });
});
