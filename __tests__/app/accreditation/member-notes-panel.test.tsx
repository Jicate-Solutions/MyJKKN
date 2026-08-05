// @vitest-environment jsdom
// ============================================================================
// The three things the Director's ask hinges on, tested at the component level
// because they are UI promises, not SQL ones:
//
//   1. A member with NO note yet sees an EMPTY box inviting one — not an error,
//      and above all not somebody else's words.
//   2. The Chairman/Coordinator sees every other member's account side by side.
//   3. Someone who is not on the active roster is told so explicitly, and told
//      who to ask — never a dead box or a silent nothing.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CHAIR = 'user-chair';
const MEMBER = 'user-member';
const OUTSIDER = 'user-outsider';

let signedInAs = MEMBER;
let notes: any[] = [];

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { id: signedInAs }, isLoading: false, error: null }),
}));

vi.mock('@/hooks/accreditation/use-naac-committees', () => ({
  useNAACCommitteeMembers: () => ({
    data: [
      { id: 'm1', committee_id: 'c1', user_id: CHAIR, role: 'chair', is_active: true, is_external: false, external_name: null },
      { id: 'm2', committee_id: 'c1', user_id: MEMBER, role: 'member', is_active: true, is_external: false, external_name: null },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/accreditation/use-naac-meeting-member-notes', () => ({
  useMeetingMemberNotes: () => ({ data: notes, isLoading: false, error: null }),
  useSaveMyMeetingNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveMinutesSummary: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [
            { id: CHAIR, full_name: 'Chair Person', email: 'chair@jkkn.ac.in' },
            { id: MEMBER, full_name: 'Ordinary Member', email: 'member@jkkn.ac.in' },
          ],
          error: null,
        }),
      }),
    }),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MemberNotesPanel } from '@/app/(routes)/accreditation/naac/committees/[id]/_components/member-notes-panel';

const MEETING: any = {
  id: 'meet-1',
  committee_id: 'c1',
  institution_id: 'inst-1',
  meeting_no: 2,
  scheduled_for: null,
  held_at: '2026-07-10T23:28:32.042Z',
  status: 'held',
  minutes_summary: null,
  created_by: null,
  created_at: '2026-07-10T00:00:00Z',
  updated_at: '2026-07-10T00:00:00Z',
};

const COMMITTEE: any = {
  id: 'c1',
  institution_id: 'inst-1',
  body_code: 'NAAC',
  committee_name: 'Internal Quality Assurance Cell (IQAC)',
  committee_type: 'iqac',
  chair_user_id: CHAIR,
  formed_at: '2026-01-01',
  term_end: null,
  is_active: true,
  metadata: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPanel(canManage = false, meetingOverride: Partial<any> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemberNotesPanel
        meeting={{ ...MEETING, ...meetingOverride }}
        committee={COMMITTEE}
        canManage={canManage}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  signedInAs = MEMBER;
  notes = [];
});

const CHAIR_NOTE = {
  id: 'n1',
  meeting_id: 'meet-1',
  author_user_id: CHAIR,
  note_text: 'The Chairman account of the sitting.',
  institution_id: 'inst-1',
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
};

describe('MemberNotesPanel', () => {
  it('a member with NO note yet gets an empty box inviting one — not an error, not anyone else’s text', () => {
    signedInAs = MEMBER;
    // RLS would only hand this member their own row; simulate the realistic
    // "chair has written, I have not" state to prove nothing leaks into my box.
    notes = [];
    renderPanel(false);

    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(
      screen.getByText(/this box is yours and starts empty/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/The Chairman account of the sitting/),
    ).not.toBeInTheDocument();
  });

  it('an ordinary member never sees another member’s account, even if a row for it is present', () => {
    signedInAs = MEMBER;
    notes = [CHAIR_NOTE];
    renderPanel(false);

    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('');
    expect(
      screen.queryByText(/The Chairman account of the sitting/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Other members/i)).not.toBeInTheDocument();
  });

  it('the Chairman sees every other member’s account side by side', () => {
    signedInAs = CHAIR;
    notes = [
      CHAIR_NOTE,
      {
        ...CHAIR_NOTE,
        id: 'n2',
        author_user_id: MEMBER,
        note_text: 'What the ordinary member took away.',
      },
    ];
    renderPanel(false);

    expect(screen.getByText(/Other members/i)).toBeInTheDocument();
    expect(
      screen.getByText('What the ordinary member took away.'),
    ).toBeInTheDocument();
    // …and their own account is in their own editable box, not in the read-only list.
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('The Chairman account of the sitting.');
  });

  it('someone not on the active roster is told so explicitly, and told who to ask', () => {
    signedInAs = OUTSIDER;
    notes = [];
    renderPanel(false);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.getByText(/not on this committee.s active roster/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/IQAC Coordinator/i)).toBeInTheDocument();
  });

  it('a compiler without the minutes permission is told what is missing instead of getting a dead button', () => {
    signedInAs = CHAIR;
    notes = [CHAIR_NOTE];
    renderPanel(false);

    expect(
      screen.queryByRole('button', { name: /compile into minutes/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Record IQAC Meetings/i)).toBeInTheDocument();
  });

  it('a compiler WITH the minutes permission gets the compile action', () => {
    signedInAs = CHAIR;
    notes = [CHAIR_NOTE];
    renderPanel(true);

    expect(
      screen.getByRole('button', { name: /compile into minutes/i }),
    ).toBeEnabled();
  });

  it('the compile action is disabled while nobody has written anything', () => {
    signedInAs = CHAIR;
    notes = [];
    renderPanel(true);

    expect(
      screen.getByRole('button', { name: /compile into minutes/i }),
    ).toBeDisabled();
    expect(screen.getByText(/Nothing to compile yet/i)).toBeInTheDocument();
  });
});

describe('MemberNotesPanel — compiling never silently overwrites', () => {
  const EXISTING = 'Loop Review — meeting #2. Reviewed 3 prior resolutions.';

  function openCompileDialog(minutes: string | null) {
    signedInAs = CHAIR;
    notes = [CHAIR_NOTE];
    renderPanel(true, { minutes_summary: minutes });
    fireEvent.click(
      screen.getByRole('button', { name: /compile into minutes/i }),
    );
  }

  it('with minutes already recorded: warns, defaults to the lossless mode, and keeps the existing text', () => {
    openCompileDialog(EXISTING);

    expect(
      screen.getByText(/This meeting already has minutes/i),
    ).toBeInTheDocument();
    // Default mode is "Add below", and the assembled text still contains every
    // character of what was recorded before.
    const editor = screen
      .getAllByRole('textbox')
      .find((el) => (el as HTMLTextAreaElement).value.includes(EXISTING));
    expect(editor).toBeDefined();
    expect((editor as HTMLTextAreaElement).value).toContain(
      'The Chairman account of the sitting.',
    );
    expect(
      screen.getByRole('button', { name: /add to minutes/i }),
    ).toBeEnabled();
  });

  it('choosing Replace blocks the save until the loss is explicitly acknowledged', () => {
    openCompileDialog(EXISTING);

    fireEvent.click(screen.getByRole('radio', { name: /replace the existing minutes/i }));

    const save = screen.getByRole('button', { name: /replace minutes/i });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /replace minutes/i })).toBeEnabled();
  });

  it('with no minutes yet there is nothing to lose, so no warning and a plain save', () => {
    openCompileDialog(null);

    expect(
      screen.queryByText(/This meeting already has minutes/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save minutes/i })).toBeEnabled();
  });
});
