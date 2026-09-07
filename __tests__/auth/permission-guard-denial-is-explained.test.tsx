// @vitest-environment jsdom
/**
 * Regression guard for the platform-wide silent denial.
 *
 * `PermissionGuard` defaulted `fallback` to `null`, so any of the 345 call
 * sites that did not pass one rendered an EMPTY AREA when the viewer lacked the
 * permission. 339 of those sites sit in a `page.tsx` or `layout.tsx`, so the
 * common outcome was a completely blank page with no message, no reason and no
 * contact route — indistinguishable from a broken page or a slow load, and a
 * direct violation of the rule that a permission failure must say so.
 *
 * A build log cannot catch "renders nothing", and neither can a curl: the
 * fallback prop is serialised into the flight payload whether or not it is the
 * branch that wins, so the HTML contains both. Only the post-hydration render
 * distinguishes them, which is what these tests assert.
 *
 * The four branches that matter, all proven here:
 *   - holder            -> the content, unchanged
 *   - denied, default   -> the explanation, naming the exact permission key
 *   - denied, null      -> nothing (how an inline control opts back into silence)
 *   - denied, custom    -> exactly what the caller passed, untouched
 *
 * Plus the trap that made this more than a copy change: `usePermissions`
 * returns `false` both when a permission is genuinely absent AND when the
 * lookup itself failed. Rendering the denial text on a network blip would tell
 * people to go request a permission they may already hold, so the two states
 * must read differently.
 */

import '@testing-library/jest-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// --- Hook boundary ----------------------------------------------------------
//
// The hook is the seam. Everything below the seam (the Supabase query, the role
// merge) has its own coverage; what is under test here is only what the guard
// PUTS ON SCREEN for each answer the hook can give.

const usePermissionsMock = vi.fn();

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: (...args: unknown[]) => usePermissionsMock(...args),
}));

import { PermissionGuard } from '@/components/auth/permission-guard';

type HookAnswer = {
  granted?: boolean;
  error?: Error | null;
  isLoading?: boolean;
  isSuperAdmin?: boolean;
};

function answers({
  granted = false,
  error = null,
  isLoading = false,
  isSuperAdmin = false,
}: HookAnswer) {
  usePermissionsMock.mockReturnValue({
    isLoading,
    error,
    // Mirrors the real hook: a failed lookup yields the SAME `false` a real
    // denial yields. That collapse is the reason the guard must read `error`.
    canPerformAll: () => !error && granted,
    canPerformAny: () => !error && granted,
    isSuperAdmin,
    isAdmissionGlobalUser: false,
    isCounselorUser: false,
  });
}

const CONTENT = 'Pending attendance for review';

afterEach(() => {
  cleanup();
  usePermissionsMock.mockReset();
});

describe('PermissionGuard renders an explanation instead of nothing', () => {
  it('a holder still sees the content, and no notice is added', () => {
    answers({ granted: true });

    render(
      <PermissionGuard module='academic.attendance' action='view'>
        <p>{CONTENT}</p>
      </PermissionGuard>,
    );

    expect(screen.getByText(CONTENT)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('a non-holder now gets the reason and the exact permission key, not a blank area', () => {
    answers({ granted: false });

    const { container } = render(
      <PermissionGuard module='academic.attendance' action='view'>
        <p>{CONTENT}</p>
      </PermissionGuard>,
    );

    // The defect, stated as a test: this used to be an empty container.
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();

    const notice = screen.getByRole('note');
    expect(notice).toHaveTextContent('This part of the page is not open to you');
    // Naming the key is what makes the message actionable for whoever grants it.
    expect(notice).toHaveTextContent('academic.attendance.view');
    // And a contact route that exists on every page of the app.
    expect(notice).toHaveTextContent(/red bug button/i);
  });

  it('lists every required key when the guard demands several', () => {
    answers({ granted: false });

    render(
      <PermissionGuard module='billing' action={['view', 'edit']}>
        <p>{CONTENT}</p>
      </PermissionGuard>,
    );

    expect(screen.getByRole('note')).toHaveTextContent('billing.view and billing.edit');
  });

  it('a failed lookup says it could not check, and never claims the permission is missing', () => {
    answers({ granted: false, error: new Error('network') });

    const notice = (
      render(
        <PermissionGuard module='academic.attendance' action='view'>
          <p>{CONTENT}</p>
        </PermissionGuard>,
      ),
      screen.getByRole('note')
    );

    expect(notice).toHaveTextContent('We could not check your access just now');
    // The wrong message here would send a holder off to request access they own.
    expect(notice).not.toHaveTextContent('not open to you');
    expect(notice).not.toHaveTextContent('None of your roles include');
  });
});

describe('PermissionGuard leaves every explicit fallback exactly as it was', () => {
  it('fallback={null} still renders nothing — how an inline control stays hidden', () => {
    answers({ granted: false });

    const { container } = render(
      <PermissionGuard module='cdc.exports' action='download' fallback={null}>
        <button type='button'>Download</button>
      </PermissionGuard>,
    );

    // A toolbar button must disappear on a miss, not be replaced by a paragraph.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('a custom fallback wins over the built-in one', () => {
    answers({ granted: false });

    render(
      <PermissionGuard
        module='academic.attendance'
        action='view'
        fallback={<p>Ask the office for attendance access.</p>}
      >
        <p>{CONTENT}</p>
      </PermissionGuard>,
    );

    expect(screen.getByText('Ask the office for attendance access.')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('PermissionGuard keeps its existing bypasses and loading behaviour', () => {
  it('a super admin sees the content without a permission grant', () => {
    answers({ granted: false, isSuperAdmin: true });

    render(
      <PermissionGuard module='academic.attendance' action='view'>
        <p>{CONTENT}</p>
      </PermissionGuard>,
    );

    expect(screen.getByText(CONTENT)).toBeInTheDocument();
  });

  it('while permissions are still loading, no denial is asserted', () => {
    answers({ granted: false, isLoading: true });

    render(
      <PermissionGuard module='academic.attendance' action='view'>
        <p>{CONTENT}</p>
      </PermissionGuard>,
    );

    // A slow load must not flash an accusation that may be untrue a tick later.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(CONTENT)).not.toBeInTheDocument();
  });
});
