// @vitest-environment jsdom
/**
 * "Sign out of all devices" must be where people look for sign-out
 * (repair round 2 Oct 2026, reviewer blocker): the account menu next to
 * "Sign out" — on a phone too — and the parent app's own Settings screen.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOutEverywhere = vi.fn();
const parentAvailable = vi.fn();
const parentSignOutEverywhere = vi.fn();
const parentLogout = vi.fn();

// Radix menus do not open under jsdom; render every item inline.
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = (props: { children?: React.ReactNode }) => <>{props.children}</>;
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuGroup: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      onClick,
      onSelect,
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      onSelect?: (e: { preventDefault: () => void }) => void;
    }) => (
      <button
        type='button'
        role='menuitem'
        onClick={() => {
          onClick?.();
          onSelect?.({ preventDefault: () => {} });
        }}
      >
        {children}
      </button>
    ),
  };
});
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', email: 'a@jkkn.ac.in', full_name: 'Asha K', role: 'faculty' } }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/components/pwa/pwa-provider', () => ({
  usePWA: () => ({ isInstalled: true, canInstall: false, installApp: vi.fn() }),
}));
vi.mock('@/hooks/use-user-roles', () => ({
  useUserRoles: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/hooks/use-my-jkkn-id', () => ({ useMyJkknId: () => ({ data: null }) }));
vi.mock('@/lib/services/roles/role-service', () => ({
  RoleService: { getRoleByKey: vi.fn().mockResolvedValue(null), getAssignableRoles: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/lib/auth/auth-service', () => ({ AuthService: { signOut: vi.fn() } }));
vi.mock('@/components/identity/jkkn-qr-dialog', () => ({ JkknQrDialog: () => null }));
vi.mock('@/app/(routes)/profile/_actions/sign-out-everywhere', () => ({
  signOutEverywhere: () => signOutEverywhere(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ auth: { signOut: vi.fn() } }),
}));
vi.mock('@/hooks/parent/use-parent-session', () => ({
  useParentSession: () => ({ parent: { displayName: 'Ravi', mobile: '9000000001' }, logout: parentLogout }),
}));
vi.mock('@/hooks/parent/use-parent-push', () => ({
  useParentPush: () => ({ enabled: false, loading: false, supported: true, enable: vi.fn(), disable: vi.fn() }),
}));
vi.mock('@/components/parent/theme-dialog', () => ({ ThemeDialog: () => null }));
vi.mock('@/lib/services/parent/parent-auth-service', () => ({
  ParentAuthService: {
    signOutEverywhereAvailable: () => parentAvailable(),
    signOutEverywhere: () => parentSignOutEverywhere(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UserNav } from '@/components/Navbar/user-nav';
import SettingsPage from '@/app/(parent-portal)/parent/(authed)/settings/page';

beforeEach(() => {
  vi.clearAllMocks();
  // Resolve with a result so the confirm dialog's follow-up does not read
  // `undefined` after the test ends (an unhandled error that failed the run).
  signOutEverywhere.mockResolvedValue({ success: false, error: 'stopped by the test' });
  parentAvailable.mockResolvedValue(true);
  parentSignOutEverywhere.mockResolvedValue({ ok: true });
  parentLogout.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('account menu (top right, also the phone header)', () => {
  it('offers "Sign out of all devices" next to "Sign out", behind the same confirm step', async () => {
    render(<UserNav />);
    expect(screen.getByRole('menuitem', { name: /^sign out$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out of all devices/i }));
    expect(
      await screen.findByText('This signs you out on every phone and computer, including this one.')
    ).toBeInTheDocument();
    expect(signOutEverywhere).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /yes, sign me out everywhere/i }));
    await waitFor(() => expect(signOutEverywhere).toHaveBeenCalledTimes(1));
  });
});

describe('parent app — Settings', () => {
  it('shows "Sign out of all devices" once switched on, and asks before acting', async () => {
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /sign out of all devices/i }));
    expect(screen.getByText(/signs you out on every phone and computer/i)).toBeInTheDocument();
    expect(parentSignOutEverywhere).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /yes, sign me out everywhere/i }));
    await waitFor(() => expect(parentSignOutEverywhere).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(parentLogout).toHaveBeenCalledTimes(1));
  });

  it('is hidden while the database update (#4168) is not applied', async () => {
    parentAvailable.mockResolvedValue(false);
    render(<SettingsPage />);
    await waitFor(() => expect(parentAvailable).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /sign out of all devices/i })).not.toBeInTheDocument();
  });

  it('a failure stays on screen and does not log the parent out', async () => {
    parentSignOutEverywhere.mockRejectedValue(new Error('We could not sign you out of your other devices.'));
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, sign me out everywhere/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not sign you out/));
    expect(parentLogout).not.toHaveBeenCalled();
  });
});
