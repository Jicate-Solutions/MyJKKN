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
  usePermissions: () => ({ canAccess, isLoading: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  SignOutEverywhereCard,
  SIGN_OUT_EVERYWHERE_WARNING,
} from '@/app/(routes)/profile/_components/sign-out-everywhere-card';
import { RevokeSessionsButton } from '@/app/(routes)/users/[id]/_components/revoke-sessions-button';

const THEM = '00000000-0000-4000-8000-0000000000b2';

beforeEach(() => {
  vi.clearAllMocks();
  signOutEverywhere.mockResolvedValue({ success: true });
  revokeUserSessions.mockResolvedValue({ success: true, sessionsEnded: 2 });
  localSignOut.mockResolvedValue({ error: null });
  canAccess.mockReturnValue(true);
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
