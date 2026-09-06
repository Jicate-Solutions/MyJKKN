// @vitest-environment jsdom
/**
 * "This permission is used by N people" — the WARNING half.
 * Covers app/(routes)/users/role-management/_components/edit-role-dialog.tsx
 * and lib/services/roles/permission-holder-counts.ts.
 *
 * The distinct-vs-summed count itself is proved against a real PostgreSQL in
 * __tests__/users/permission-holder-count.test.ts — this suite deliberately
 * does NOT re-implement it. What it proves is the half that lives in the
 * browser: which clicks are interrupted, which are not, and that confirming
 * actually applies the change.
 */
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import {
  keysNeedingHolderCounts,
  parseHolderCounts,
  resolvePermissionToggle,
  shouldWarnOnRemoval
} from '@/lib/services/roles/permission-holder-counts';
import { PermissionRemovalWarningDialog } from '@/app/(routes)/users/role-management/_components/permission-removal-warning-dialog';

afterEach(() => cleanup());

const REPO = path.resolve(__dirname, '..', '..');

describe('the count the UI shows is people, never the sum of roles', () => {
  it('takes the distinct figure the RPC returns (581 for bos.experts.view)', () => {
    expect(
      parseHolderCounts([{ permission_key: 'bos.experts.view', holder_count: 581 }])
    ).toEqual({ 'bos.experts.view': 581 });
  });

  it('refuses to add rows up, so the summed figure (621) is unreachable', () => {
    // If the server contract ever regressed to one row per granting role, the
    // 9 rows below would sum to 621 — the exact number this feature exists to
    // avoid showing. First wins instead.
    const perRoleRows = [69, 69, 69, 69, 69, 69, 69, 69, 69].map((n) => ({
      permission_key: 'bos.experts.view',
      holder_count: n
    }));
    const counts = parseHolderCounts(perRoleRows);
    expect(counts['bos.experts.view']).toBe(69);
    expect(counts['bos.experts.view']).not.toBe(621);
  });

  it('keeps a genuine 0 as 0, distinct from "not asked"', () => {
    const counts = parseHolderCounts([
      { permission_key: 'campus_living.ghost.view', holder_count: 0 }
    ]);
    expect(counts['campus_living.ghost.view']).toBe(0);
    expect('never.asked' in counts).toBe(false);
  });

  it('survives a bigint arriving as a string, and drops unusable rows', () => {
    expect(
      parseHolderCounts([
        { permission_key: 'a.key', holder_count: '581' },
        { permission_key: null, holder_count: 5 },
        { permission_key: 'b.key', holder_count: null }
      ])
    ).toEqual({ 'a.key': 581 });
  });

  it('asks only about permissions the role currently grants — one batch, not one per checkbox', () => {
    expect(
      keysNeedingHolderCounts({
        'bos.experts.view': true,
        'billing.receipts.create': false,
        'academic.attendance.view': true
      })
    ).toEqual(['bos.experts.view', 'academic.attendance.view']);
  });
});

describe('which clicks get interrupted', () => {
  it('unticking a permission 581 people use asks first', () => {
    expect(
      resolvePermissionToggle({ previous: true, next: false, holderCount: 581 })
    ).toBe('confirm-removal');
  });

  it('unticking a permission nobody holds goes straight through — silence is the feature', () => {
    expect(
      resolvePermissionToggle({ previous: true, next: false, holderCount: 0 })
    ).toBe('apply');
    expect(shouldWarnOnRemoval(true, false, 0)).toBe(false);
  });

  it('GRANTING a permission is never interrupted, however many people hold it', () => {
    expect(
      resolvePermissionToggle({ previous: false, next: true, holderCount: 581 })
    ).toBe('apply');
  });

  it('an unknown count stays silent rather than crying wolf', () => {
    // The state before the migration is applied, and after any failed request.
    expect(
      resolvePermissionToggle({ previous: true, next: false, holderCount: undefined })
    ).toBe('apply');
  });
});

describe('the confirm itself', () => {
  it('names the number of people in plain English and applies the change when confirmed', () => {
    const onConfirm = vi.fn();
    render(
      <PermissionRemovalWarningDialog
        open
        onOpenChange={() => {}}
        permissionLabel='View BoS External Expert Register'
        permissionKey='bos.experts.view'
        holderCount={581}
        onConfirm={onConfirm}
      />
    );

    expect(
      screen.getByText(/This permission is used by 581 people/i)
    ).toBeInTheDocument();
    expect(screen.getByText('bos.experts.view')).toBeInTheDocument();

    // It is a warning, not a block: the admin keeps control.
    fireEvent.click(screen.getByRole('button', { name: /switch it off/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('offers a way out that changes nothing', () => {
    const onConfirm = vi.fn();
    render(
      <PermissionRemovalWarningDialog
        open
        onOpenChange={() => {}}
        permissionLabel='View BoS External Expert Register'
        permissionKey='bos.experts.view'
        holderCount={581}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /keep it on/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('answering it does NOT submit the surrounding role-edit form', () => {
    // The dialog is rendered inside the <form> in edit-role-dialog.tsx, where
    // confirming must switch ONE permission off, not save the entire role.
    // Honest about what this measures: Radix's portal alone is enough to make
    // it pass in jsdom, so removing type='button' does not turn it red. It
    // guards the outcome, not the mechanism.
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onConfirm = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PermissionRemovalWarningDialog
          open
          onOpenChange={() => {}}
          permissionLabel='View BoS External Expert Register'
          permissionKey='bos.experts.view'
          holderCount={581}
          onConfirm={onConfirm}
        />
      </form>
    );

    fireEvent.click(screen.getByRole('button', { name: /switch it off/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /keep it on/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says "person" for exactly one', () => {
    render(
      <PermissionRemovalWarningDialog
        open
        onOpenChange={() => {}}
        permissionLabel='Stringy'
        permissionKey='stringy.key'
        holderCount={1}
        onConfirm={() => {}}
      />
    );
    expect(
      screen.getByText(/This permission is used by 1 person/i)
    ).toBeInTheDocument();
  });
});

describe('wiring guards — the save path actually uses all of this', () => {
  const editDialog = readFileSync(
    path.join(
      REPO,
      'app/(routes)/users/role-management/_components/edit-role-dialog.tsx'
    ),
    'utf8'
  );

  it('the permission Switch routes through resolvePermissionToggle', () => {
    // edit-role-dialog.tsx is the genuine save path: role-management-list.tsx
    // renders it and page.tsx hands its onSubmit to RoleService.updateRole.
    // (page-permission-toggle.tsx and role-permission-groups.tsx are orphans —
    // nothing in the repo imports either.)
    expect(editDialog).toContain('resolvePermissionToggle');
    expect(editDialog).toContain("=== 'confirm-removal'");
  });

  it('renders the warning and fetches counts in one batch on open', () => {
    expect(editDialog).toContain('PermissionRemovalWarningDialog');
    expect(editDialog).toContain('fetchPermissionHolderCounts');
    expect(editDialog).toContain('keysNeedingHolderCounts');
  });

  it('the migration counts distinct people and never sums per-role holders', () => {
    const sql = readFileSync(
      path.join(REPO, 'supabase/migrations/20260809103300_permission_holder_count.sql'),
      'utf8'
    );
    const body = sql.split('$$')[1] ?? '';
    expect(body).toContain('COUNT(DISTINCT ur.user_id)');
    expect(body).not.toMatch(/\bsum\s*\(/i);
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fn_permission_live_holder_count(text[]) FROM anon, PUBLIC;'
    );
  });
});
