// @vitest-environment jsdom
// ============================================================================
// Owners & verdicts — per-college owners (Director decision 2026-09-06)
//
// What the Director asked to see, tested at the component level because the
// migration that seeds the seven Principals is a FILE in this PR and is never
// applied by the builder — so the live page cannot show them yet:
//
//   1. Under a loop that has scope rows, the panel lists every per-college
//      owner WITH the college's name (the seven live Principals).
//   2. A loop with no scope rows renders exactly as before — no block at all.
//   3. Replacing an owner calls fn_loop_set_scoped_owner with the loop, the
//      institution and the new email; the row updates from the saved value.
//   4. Blanking an owner is a REMOVE (the RPC deletes the scope) and the row
//      disappears — that college falls back to the registry owner.
//   5. The add control only offers colleges that are not already scoped.
//   6. A refused save ('not authorized') is an explicit toast, never silent.
// ============================================================================

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ rpc }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

import {
  OwnersPanel,
  type InstitutionOption,
  type OwnerPanelRow,
  type ScopedOwnerRow,
} from '@/app/(routes)/admin/loops/_components/owners-panel';

const ATTENDANCE: OwnerPanelRow = {
  loop_key: 'attendance-intervention',
  name: 'Attendance → Intervention Loop',
  domain: 'academic',
  verdict_owner: null,
  owner_email: 'director@jkkn.ac.in',
  is_active: true,
  missing_legs: ['outcome_metric'],
};
const SCF: OwnerPanelRow = {
  loop_key: 'scf',
  name: 'Session-Feedback Teaching Loop',
  domain: 'academic',
  verdict_owner: null,
  owner_email: null,
  is_active: true,
  missing_legs: [],
};

const INSTITUTIONS: InstitutionOption[] = [
  { id: 'i-arts', name: 'JKKN College of Arts and Science (Aided)', entity_type: 'institution' },
  { id: 'i-self', name: 'JKKN College of Arts and Science (Self)', entity_type: 'institution' },
  { id: 'i-edu', name: 'JKKN College of Education', entity_type: 'institution' },
  { id: 'i-eng', name: 'JKKN College of Engineering and Technology', entity_type: 'institution' },
  { id: 'i-nur', name: 'JKKN College of Nursing and Research', entity_type: 'institution' },
  { id: 'i-pha', name: 'JKKN College of Pharmacy', entity_type: 'institution' },
  { id: 'i-den', name: 'JKKN Dental College and Hospital', entity_type: 'institution' },
  { id: 'i-mat', name: 'JKKN Matric Higher Secondary School', entity_type: 'school' },
  { id: 'i-nat', name: 'Nattraja Vidhyalya CBSE', entity_type: 'school' },
];

const PRINCIPALS: Array<[string, string]> = [
  ['i-arts', 'artsprincipal@jkkn.ac.in'],
  ['i-eng', 'principaljkkncet@jkkn.ac.in'],
  ['i-nur', 'nursingprincipal@jkkn.ac.in'],
  ['i-pha', 'pharmacyprincipal@jkkn.ac.in'],
  ['i-den', 'dentalprincipal@jkkn.ac.in'],
  ['i-mat', 'matricprincipal@jkkn.ac.in'],
  ['i-nat', 'vidhyalyaprincipal@jkkn.ac.in'],
];

const SCOPES: ScopedOwnerRow[] = PRINCIPALS.map(([institution_id, owner_email]) => ({
  loop_key: 'attendance-intervention',
  institution_id,
  institution_name: INSTITUTIONS.find((i) => i.id === institution_id)!.name,
  owner_email,
}));

beforeEach(() => {
  rpc.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});
afterEach(cleanup);

describe('OwnersPanel — per-college owners', () => {
  it('lists the seven Principals with their college names under the attendance loop, and nothing under a loop without scopes', () => {
    render(<OwnersPanel rows={[ATTENDANCE, SCF]} scopes={SCOPES} institutions={INSTITUTIONS} />);

    const block = screen.getByTestId('scoped-owners-attendance-intervention');
    expect(within(block).getByText('Per-college owners · 7')).toBeInTheDocument();
    for (const [id, email] of PRINCIPALS) {
      const name = INSTITUTIONS.find((i) => i.id === id)!.name;
      expect(within(block).getByText(name)).toBeInTheDocument();
      expect(within(block).getByLabelText(`${name} owner for ${ATTENDANCE.name}`)).toHaveValue(email);
    }
    expect(screen.queryByTestId('scoped-owners-scf')).not.toBeInTheDocument();
    expect(screen.getByText(/1 split by college/)).toBeInTheDocument();

    // The estate-level fallback stays visible on the loop row itself.
    expect(screen.getByLabelText(`Owner email for ${ATTENDANCE.name}`)).toHaveValue('director@jkkn.ac.in');
  });

  it('offers only the not-yet-scoped colleges in the add control', () => {
    render(<OwnersPanel rows={[ATTENDANCE]} scopes={SCOPES} institutions={INSTITUTIONS} />);
    const select = screen.getByLabelText(`Add a college owner for ${ATTENDANCE.name}`) as HTMLSelectElement;
    const offered = Array.from(select.options).map((o) => o.textContent);
    expect(offered).toEqual([
      'Add a college…',
      'JKKN College of Arts and Science (Self)',
      'JKKN College of Education',
    ]);
  });

  it('replaces a Principal through fn_loop_set_scoped_owner and shows the saved value', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    render(<OwnersPanel rows={[ATTENDANCE]} scopes={SCOPES} institutions={INSTITUTIONS} />);

    const input = screen.getByLabelText(`JKKN College of Pharmacy owner for ${ATTENDANCE.name}`);
    const save = input.parentElement!.querySelector('button')!;
    expect(save).toBeDisabled(); // not dirty yet

    // type="email" inputs sanitise surrounding whitespace themselves; the RPC
    // re-applies NULLIF(btrim()) server-side regardless.
    fireEvent.change(input, { target: { value: 'newpharmacy@jkkn.ac.in' } });
    expect(save).toBeEnabled();
    expect(save).toHaveTextContent('Save');
    fireEvent.click(save);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('fn_loop_set_scoped_owner', {
        p_loop_key: 'attendance-intervention',
        p_institution_id: 'i-pha',
        p_owner_email: 'newpharmacy@jkkn.ac.in',
      })
    );
    await waitFor(() => expect(input).toHaveValue('newpharmacy@jkkn.ac.in'));
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('newpharmacy@jkkn.ac.in'));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('a blank email is a Remove: the RPC is called with the blank and the college drops off the list', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    render(<OwnersPanel rows={[ATTENDANCE]} scopes={SCOPES} institutions={INSTITUTIONS} />);

    const input = screen.getByLabelText(`Nattraja Vidhyalya CBSE owner for ${ATTENDANCE.name}`);
    const button = input.parentElement!.querySelector('button')!;
    fireEvent.change(input, { target: { value: '' } });
    expect(button).toHaveTextContent('Remove');
    fireEvent.click(button);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('fn_loop_set_scoped_owner', {
        p_loop_key: 'attendance-intervention',
        p_institution_id: 'i-nat',
        p_owner_email: '',
      })
    );
    await waitFor(() =>
      expect(screen.queryByLabelText(`Nattraja Vidhyalya CBSE owner for ${ATTENDANCE.name}`)).not.toBeInTheDocument()
    );
    expect(screen.getByText('Per-college owners · 6')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('falls back to director@jkkn.ac.in'));
    // Nattraja is now offered again by the add control.
    const select = screen.getByLabelText(`Add a college owner for ${ATTENDANCE.name}`) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('Nattraja Vidhyalya CBSE');
  });

  it('adds a college owner through the same RPC', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    render(<OwnersPanel rows={[ATTENDANCE]} scopes={SCOPES} institutions={INSTITUTIONS} />);

    const select = screen.getByLabelText(`Add a college owner for ${ATTENDANCE.name}`);
    const email = screen.getByLabelText(`New college owner email for ${ATTENDANCE.name}`);
    const add = email.parentElement!.querySelector('button')!;
    expect(add).toBeDisabled();

    fireEvent.change(select, { target: { value: 'i-edu' } });
    fireEvent.change(email, { target: { value: 'eduprincipal@jkkn.ac.in' } });
    expect(add).toBeEnabled();
    fireEvent.click(add);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('fn_loop_set_scoped_owner', {
        p_loop_key: 'attendance-intervention',
        p_institution_id: 'i-edu',
        p_owner_email: 'eduprincipal@jkkn.ac.in',
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText(`JKKN College of Education owner for ${ATTENDANCE.name}`)).toHaveValue('eduprincipal@jkkn.ac.in')
    );
    expect(screen.getByText('Per-college owners · 8')).toBeInTheDocument();
  });

  it('a refused save is an explicit toast and the row is unchanged', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
    render(<OwnersPanel rows={[ATTENDANCE]} scopes={SCOPES} institutions={INSTITUTIONS} />);

    const input = screen.getByLabelText(`JKKN College of Pharmacy owner for ${ATTENDANCE.name}`);
    fireEvent.change(input, { target: { value: 'x@jkkn.ac.in' } });
    fireEvent.click(input.parentElement!.querySelector('button')!);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/Not authorized/)));
    expect(toastSuccess).not.toHaveBeenCalled();
    // Draft is kept (still dirty), saved value is not.
    expect(input).toHaveValue('x@jkkn.ac.in');
  });

  it('warns beside a scope row whose owner has no active account or cannot read risk data; says nothing beside a reachable one', () => {
    const scopes: ScopedOwnerRow[] = [
      { ...SCOPES[0], owner_status: 'ok' },
      { ...SCOPES[1], owner_status: 'owner_no_profile' },
      { ...SCOPES[2], owner_status: 'owner_cannot_read' },
      { ...SCOPES[3] }, // unknown (e.g. just saved through the panel) — no warning
    ];
    render(<OwnersPanel rows={[ATTENDANCE]} scopes={scopes} institutions={INSTITUTIONS} />);
    const block = screen.getByTestId('scoped-owners-attendance-intervention');
    const key = (s: ScopedOwnerRow) => `owner-status-${s.loop_key}:${s.institution_id}`;
    expect(within(block).queryByTestId(key(scopes[0]))).toBeNull();
    expect(within(block).getByTestId(key(scopes[1]))).toHaveTextContent(
      'No active account for this email — alerts will not reach them'
    );
    expect(within(block).getByTestId(key(scopes[2]))).toHaveTextContent(
      'This account cannot read risk data — alerts will not reach them'
    );
    expect(within(block).queryByTestId(key(scopes[3]))).toBeNull();
    // Read-only: the warning adds no button and changes no input.
    expect(within(block).getAllByRole('button')).toHaveLength(scopes.length + 1);
  });
});
