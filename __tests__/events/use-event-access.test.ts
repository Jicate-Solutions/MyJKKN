// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const authState: { profile: { id: string; role?: string } | null } = { profile: null };
const permState = { isSuperAdmin: false, isLoading: false };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ profile: authState.profile, isLoading: false }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    isSuperAdmin: permState.isSuperAdmin,
    isLoading: permState.isLoading,
    can: () => false,
  }),
}));

import { useEventAccess } from '@/hooks/events/use-event-access';

const EVENT_WITH_INCHARGE = {
  config: { incharges: [{ member_id: 'user-incharge', name: 'In Charge' }] },
};

beforeEach(() => {
  authState.profile = null;
  permState.isSuperAdmin = false;
  permState.isLoading = false;
});

describe('useEventAccess', () => {
  it('grants manage to a super admin', () => {
    permState.isSuperAdmin = true;
    authState.profile = { id: 'u1' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.canManage).toBe(true);
  });

  it.each(['admin', 'administrator', 'event_coordinator'])(
    'grants manage to role %s',
    (role) => {
      authState.profile = { id: 'u1', role };
      const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
      expect(result.current.canManage).toBe(true);
    }
  );

  it('denies manage to an unrelated role', () => {
    authState.profile = { id: 'u1', role: 'student' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.canManage).toBe(false);
  });

  it('grants manage to a listed in-charge', () => {
    authState.profile = { id: 'user-incharge', role: 'student' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.canManage).toBe(true);
    expect(result.current.isIncharge).toBe(true);
  });

  it('reports isLoading while permissions load, so callers do not bounce a real manager', () => {
    permState.isLoading = true;
    authState.profile = { id: 'u1', role: 'admin' };
    const { result } = renderHook(() => useEventAccess(EVENT_WITH_INCHARGE));
    expect(result.current.isLoading).toBe(true);
  });

  it('denies manage when the event is null', () => {
    authState.profile = { id: 'user-incharge', role: 'student' };
    const { result } = renderHook(() => useEventAccess(null));
    expect(result.current.canManage).toBe(false);
  });
});
