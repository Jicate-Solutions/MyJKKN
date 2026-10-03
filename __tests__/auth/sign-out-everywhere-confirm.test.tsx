// @vitest-environment jsdom
/**
 * "Sign out of all devices" — the confirm step is required on both buttons,
 * and the admin button is absent for anyone without the permission.
 */
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOutEverywhere = vi.fn();
const revokeUserSessions = vi.fn();
const canAccess = vi.fn();
let permState: { isSuperAdmin?: boolean; userProfile?: { role?: string; is_super_admin?: boolean } } = {};
const localSignOut = vi.fn();

vi.mock('@/app/(routes)/profile/_actions/sign-out-everywhere', () => ({
  signOutEverywhere: () => signOutEverywhere(),
}));
vi.mock('@/app/(routes)/users/[id]/_actions/revoke-user-sessions', () => ({
  revokeUserSessions: (id: string) => revokeUserSessions(id),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({ auth: { signOut: localSignOut } }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ canAccess, isLoading: false, ...permState }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  SignOutEverywhereCard,
  SIGN_OUT_EVERYWHERE_WARNING,
} from '@/app/(routes)/profile/_components/sign-out-everywhere-card';
import { RevokeSessionsButton } from '@/app/(routes)/users/[id]/_components/revoke-sessions-button';
import { SignOutEverywhereConfirm } from '@/components/auth/sign-out-everywhere-confirm';
import { toast } from 'sonner';

const THEM = '00000000-0000-4000-8000-0000000000b2';

beforeEach(() => {
  vi.clearAllMocks();
  signOutEverywhere.mockResolvedValue({ success: true });
  revokeUserSessions.mockResolvedValue({ success: true, sessionsEnded: 2 });
  localSignOut.mockResolvedValue({ error: null });
  canAccess.mockReturnValue(true);
  permState = {};
});
afterEach(cleanup);

describe('own Profile — Sign out of all devices', () => {
  it('the first click only opens the confirm panel; nothing is signed out yet', () => {
    render(<SignOutEverywhereCard />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    expect(screen.getByText(SIGN_OUT_EVERYWHERE_WARNING)).toBeInTheDocument();
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });

  it('Cancel closes the panel without signing out', () => {
    render(<SignOutEverywhereCard />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(SIGN_OUT_EVERYWHERE_WARNING)).not.toBeInTheDocument();
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });

  it('confirming signs out everywhere and shows the signed-out message', async () => {
    render(<SignOutEverywhereCard />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, sign me out everywhere/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/signed out on every device/i));
    expect(signOutEverywhere).toHaveBeenCalledTimes(1);
  });

  it('the success message does not overclaim: an open page may keep working for up to an hour', async () => {
    render(<SignOutEverywhereCard />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, sign me out everywhere/i }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Signed out on every device. A page already open may keep working for up to an hour.'
      )
    );
  });

  it('a failure is shown on the card', async () => {
    signOutEverywhere.mockResolvedValue({ success: false, error: 'We could not sign you out.' });
    render(<SignOutEverywhereCard />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, sign me out everywhere/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('We could not sign you out.'));
  });
});

describe('admin — Sign out of all devices on /users/[id]', () => {
  it('is absent for anyone without users.sessions.revoke', () => {
    canAccess.mockReturnValue(false);
    const { container } = render(<RevokeSessionsButton userId={THEM} userName='Priya' />);
    expect(container).toBeEmptyDOMElement();
    expect(canAccess).toHaveBeenCalledWith('users.sessions', 'revoke');
  });

  it('requires the confirm click before anything happens', async () => {
    render(<RevokeSessionsButton userId={THEM} userName='Priya' />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    expect(revokeUserSessions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /yes, sign them out everywhere/i }));
    await waitFor(() => expect(revokeUserSessions).toHaveBeenCalledWith(THEM));
  });

  it('shows the refusal on the page instead of redirecting', async () => {
    revokeUserSessions.mockResolvedValue({ success: false, error: "You don't have access to sign people out." });
    render(<RevokeSessionsButton userId={THEM} userName='Priya' />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, sign them out everywhere/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/don't have access/));
  });
});

describe('user menu — the same confirm step', () => {
  it('nothing happens until "Yes" is pressed, and Cancel calls back without signing out', () => {
    const onCancel = vi.fn();
    render(<SignOutEverywhereConfirm onCancel={onCancel} />);
    expect(screen.getByText(SIGN_OUT_EVERYWHERE_WARNING)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });
});

describe('admin button — super admin means the profiles.is_super_admin flag, as in the database', () => {
  it('a role-only "super admin" without the flag does not see a button the database would refuse', () => {
    permState = { isSuperAdmin: true, userProfile: { role: 'super_admin', is_super_admin: false } };
    canAccess.mockReturnValue(true); // the hook says yes to everything for any super admin
    const { container } = render(<RevokeSessionsButton userId={THEM} userName='Priya' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('the flag holder sees it', () => {
    permState = { isSuperAdmin: true, userProfile: { role: 'super_admin', is_super_admin: true } };
    render(<RevokeSessionsButton userId={THEM} userName='Priya' />);
    expect(screen.getByRole('button', { name: /sign out of all devices/i })).toBeInTheDocument();
  });

  it('the success toast carries the honest one-hour caveat', async () => {
    render(<RevokeSessionsButton userId={THEM} userName='Priya' />);
    fireEvent.click(screen.getByRole('button', { name: /sign out of all devices/i }));
    fireEvent.click(screen.getByRole('button', { name: /yes, sign them out everywhere/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(vi.mocked(toast.success).mock.calls[0][0]).toContain(
      'Signed out on every device. A page already open may keep working for up to an hour.'
    );
  });
});
