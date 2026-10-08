// @vitest-environment jsdom
/**
 * Super-admin permanent delete for HR leave types (migration 20261006120000).
 *
 * Two things are pinned here, because both fail SILENTLY if they drift:
 *
 *  1. WHO IS OFFERED WHAT. A super admin gets ONE "Delete permanently" on every
 *     row, active or archived, wired to the super-admin flow. Everyone else keeps
 *     today's rule: the item exists only on an archived row and goes to the
 *     ordinary delete. A menu that offered the super-admin item to a non-super
 *     admin would only be refused by the RPC — a button that always fails.
 *
 *  2. WHAT THE DIALOG SAYS BEFORE IT ERASES. It must name an active type, list
 *     the counts, refuse on applications / encashments / superseding types
 *     without offering a button, and demand the type's name typed when history
 *     (leave taken, adjustments, overrides...) is about to go.
 *
 * The RPC's own behaviour — permission gate, refusals, counts, tombstone — was
 * probed against the database in a rolled-back transaction when it was applied.
 */

import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { HRLeaveType } from '@/types/hr-leave-types';
import type {
  HRLeaveTypeSuperDeleteCounts,
  HRLeaveTypeSuperDeleteResult,
} from '@/lib/services/hr/leave-type-service';
import { LeaveTypeRowActions } from '@/app/(routes)/hr/admin/leave-types/_components/leave-type-row-actions';
import { LeaveTypeSuperDeleteDialog } from '@/app/(routes)/hr/admin/leave-types/_components/leave-type-confirm-dialogs';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(cleanup);

const type = (is_active: boolean) =>
  ({
    id: 'lt-1',
    hr_organization_id: 'org-1',
    leave_type_name: 'Casual Leave',
    leave_type_code: 'CL',
    is_active,
    requires_eligibility: false,
  }) as unknown as HRLeaveType;

function renderMenu(opts: { is_active: boolean; isSuperAdmin: boolean }) {
  const handlers = {
    onView: vi.fn(),
    onAssign: vi.fn(),
    onEdit: vi.fn(),
    onApprovalFlow: vi.fn(),
    onEligibilityFlow: vi.fn(),
    onArchive: vi.fn(),
    onActivate: vi.fn(),
    onDelete: vi.fn(),
    onSuperDelete: vi.fn(),
  };
  const t = type(opts.is_active);
  render(<LeaveTypeRowActions leaveType={t} isSuperAdmin={opts.isSuperAdmin} {...handlers} />);
  // Radix opens a dropdown on Enter/Space keydown as well as on pointerdown.
  fireEvent.keyDown(screen.getByRole('button', { name: /Actions for Casual Leave/ }), {
    key: 'Enter',
  });
  return { handlers, t };
}

describe('row menu — who is offered the delete', () => {
  it('a super admin gets the super-admin delete on an ACTIVE row', async () => {
    const { handlers, t } = renderMenu({ is_active: true, isSuperAdmin: true });
    const item = await screen.findByText('Delete permanently');
    fireEvent.click(item);
    await waitFor(() => expect(handlers.onSuperDelete).toHaveBeenCalledWith(t));
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('a super admin sees exactly ONE delete item on an archived row', async () => {
    renderMenu({ is_active: false, isSuperAdmin: true });
    await screen.findByText('Activate');
    expect(screen.getAllByText('Delete permanently')).toHaveLength(1);
  });

  it('anyone else is NOT offered a delete on an active row', async () => {
    renderMenu({ is_active: true, isSuperAdmin: false });
    await screen.findByText('Archive');
    expect(screen.queryByText('Delete permanently')).not.toBeInTheDocument();
  });

  it('anyone else keeps the ordinary delete on an archived row', async () => {
    const { handlers, t } = renderMenu({ is_active: false, isSuperAdmin: false });
    fireEvent.click(await screen.findByText('Delete permanently'));
    await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith(t));
    expect(handlers.onSuperDelete).not.toHaveBeenCalled();
  });
});

const zero: HRLeaveTypeSuperDeleteCounts = {
  balances_with_leave_taken: 0,
  balances_unused: 0,
  adjustments: 0,
  overrides: 0,
  assignments: 0,
  cadre_entitlements: 0,
  policies: 0,
  eligibilities: 0,
  month_entries: 0,
  work_pattern_entitlements: 0,
};

function renderDialog(impact: HRLeaveTypeSuperDeleteResult | null, onConfirm = vi.fn()) {
  render(
    <LeaveTypeSuperDeleteDialog
      leaveType={type(true)}
      impact={impact}
      isDeleting={false}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

const confirmButton = () => screen.queryByRole('button', { name: 'Delete permanently' });

describe('super-admin delete dialog', () => {
  it('offers no button while the dry run is still in flight', () => {
    renderDialog(null);
    expect(screen.getByText(/Checking what is attached/)).toBeInTheDocument();
    expect(confirmButton()).not.toBeInTheDocument();
  });

  it('a type with nothing attached can be deleted without typing anything', () => {
    const onConfirm = renderDialog({
      ok: true,
      dry_run: true,
      organization_name: 'Nattraja Incubation Forum',
      was_active: false,
      blockers: { applications: 0, encashments: 0, superseding_types: 0 },
      will_remove: zero,
    });
    expect(screen.getByText('Nattraja Incubation Forum')).toBeInTheDocument();
    expect(screen.getByText(/Nothing else is attached/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/to confirm/)).not.toBeInTheDocument();
    const btn = confirmButton()!;
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('history needs the name typed, and says the type is active', () => {
    const onConfirm = renderDialog({
      ok: true,
      dry_run: true,
      organization_name: 'JKKN Testing Institution',
      was_active: true,
      blockers: { applications: 0, encashments: 0, superseding_types: 0 },
      will_remove: { ...zero, balances_with_leave_taken: 10, adjustments: 130 },
    });
    expect(screen.getByText(/staff can apply for it/)).toBeInTheDocument();
    expect(screen.getByText('130')).toBeInTheDocument();
    expect(screen.getByText(/balance adjustments \(audit trail\)/)).toBeInTheDocument();

    const btn = confirmButton()!;
    expect(btn).toBeDisabled();

    const box = screen.getByLabelText(/to confirm/);
    fireEvent.change(box, { target: { value: 'Casual' } });
    expect(btn).toBeDisabled();

    fireEvent.change(box, { target: { value: 'Casual Leave' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('applications / encashments / superseding types refuse, with no delete button', () => {
    renderDialog({
      ok: false,
      error: 'in_use',
      blockers: { applications: 3, encashments: 1, superseding_types: 0 },
    });
    expect(screen.getByText(/never deleted from here/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(confirmButton()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('a caller the RPC refuses is told so and gets no button', () => {
    renderDialog({ ok: false, error: 'permission_denied' });
    expect(screen.getByText(/Only a super admin/)).toBeInTheDocument();
    expect(confirmButton()).not.toBeInTheDocument();
  });
});
