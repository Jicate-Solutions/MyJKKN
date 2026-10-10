// @vitest-environment jsdom
// ============================================================================
// Power users last week — the section on the super-admin /admin/adoption page.
//   1. No stored week: an empty state, not a blank table.
//   2. A top-10 row whose agenda job is not done (or unparseable) shows
//      "Agenda not ready yet"; a done one shows its questions and topics.
//   3. NEW badge only on is_new rows.
//   4. One-day learners are counts per college — no names.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PowerUsersLastWeek } from '@/app/(routes)/admin/adoption/_components/power-users-last-week';
import type { PowerUsersPayload } from '@/lib/adoption/power-users';

afterEach(cleanup);

const payload: PowerUsersPayload = {
  week_start: '2026-09-28',
  window: { start: '2026-09-27T18:30:00Z', end: '2026-10-04T18:30:00Z' },
  excluded_institution_ids: [],
  top: [
    {
      user_id: 'u-1',
      full_name: 'Asha',
      role: 'principal',
      institution_id: 'c-1',
      institution_name: 'College A',
      features_used: 12,
      records_saved: 7,
      active_days: 5,
      is_new: true,
    },
    {
      user_id: 'u-2',
      full_name: 'Bala',
      role: 'hod',
      institution_id: 'c-2',
      institution_name: 'College B',
      features_used: 9,
      records_saved: 2,
      active_days: 3,
      is_new: false,
    },
  ],
  one_day_staff: [
    {
      user_id: 'u-9',
      full_name: 'Chitra',
      role: 'admin',
      institution_id: 'c-1',
      institution_name: 'College A',
      features_used: 2,
      records_saved: 0,
      active_days: 1,
    },
  ],
  one_day_learners_by_college: [
    { institution_id: 'c-1', institution_name: 'College A', count: 14 },
  ],
};

describe('PowerUsersLastWeek', () => {
  it('shows an empty state when no week has been worked out yet', () => {
    render(<PowerUsersLastWeek week={null} agendas={{}} error={null} />);
    expect(screen.getByText('Power users last week')).toBeInTheDocument();
    expect(screen.getByText(/No weekly report yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows "Agenda not ready yet" until the agenda is done, and the agenda once it is', () => {
    render(
      <PowerUsersLastWeek
        week={{ week_start: '2026-09-28', computed_at: '2026-10-05T05:20:00Z', payload }}
        agendas={{ 'u-1': { questions: ['Which screen do you open first?'], topics: ['Attendance'] }, 'u-2': null }}
        error={null}
      />
    );
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('Which screen do you open first?')).toBeInTheDocument();
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getAllByText('Agenda not ready yet')).toHaveLength(1);
    expect(screen.getAllByText('NEW')).toHaveLength(1);
    expect(screen.getByText('Chitra')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('treats a top person with no stored job as not ready', () => {
    render(
      <PowerUsersLastWeek
        week={{ week_start: '2026-09-28', computed_at: '2026-10-05T05:20:00Z', payload }}
        agendas={{}}
        error="ai_jobs read failed"
      />
    );
    expect(screen.getAllByText('Agenda not ready yet')).toHaveLength(2);
    expect(screen.getByText(/could not be read: ai_jobs read failed/)).toBeInTheDocument();
  });
});
