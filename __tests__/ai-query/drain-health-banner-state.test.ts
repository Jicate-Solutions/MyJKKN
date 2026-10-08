/**
 * DrainHealthBanner — which banner shows for which health reading.
 * components/ai-query/DrainHealthBanner.tsx (resolveBannerState)
 *
 *   windows      → nothing
 *   mac_standby  → amber "Windows is down, the Mac backup is answering"
 *   none         → red "both answering computers are down"
 *   unknown      → nothing (inert before any heartbeat)
 * plus the pre-migration payload (no `serving`), which must behave exactly as
 * the single-computer banner did.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ isSuperAdmin: true }) }));
vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));

import { resolveBannerState } from '@/components/ai-query/DrainHealthBanner';

const T = '2026-09-23T09:00:00.000Z';

describe('resolveBannerState', () => {
  it('no reading yet → hidden', () => {
    expect(resolveBannerState(null)).toEqual({ kind: 'hidden' });
  });

  it('windows answering → hidden', () => {
    expect(
      resolveBannerState({ online: true, last_seen: T, standby_online: null, standby_last_seen: null, serving: 'windows' }),
    ).toEqual({ kind: 'hidden' });
  });

  it('mac_standby → amber standby banner', () => {
    expect(
      resolveBannerState({ online: false, last_seen: T, standby_online: true, standby_last_seen: T, serving: 'mac_standby' }),
    ).toEqual({ kind: 'standby', windowsLastSeen: T });
  });

  it('none → red down banner, carrying both last-seen times', () => {
    expect(
      resolveBannerState({ online: false, last_seen: T, standby_online: false, standby_last_seen: T, serving: 'none' }),
    ).toEqual({ kind: 'down', windowsLastSeen: T, standbyLastSeen: T });
  });

  it('none with the Mac never stamped → red, Mac last-seen null', () => {
    expect(
      resolveBannerState({ online: false, last_seen: T, standby_online: null, standby_last_seen: null, serving: 'none' }),
    ).toEqual({ kind: 'down', windowsLastSeen: T, standbyLastSeen: null });
  });

  it('unknown (neither ever stamped) → hidden (inert)', () => {
    expect(
      resolveBannerState({ online: null, last_seen: null, standby_online: null, standby_last_seen: null, serving: 'unknown' }),
    ).toEqual({ kind: 'hidden' });
  });

  describe('pre-migration payload (no serving field)', () => {
    it('online true → hidden', () => {
      expect(resolveBannerState({ online: true, last_seen: T })).toEqual({ kind: 'hidden' });
    });
    it('online false → red, as before', () => {
      expect(resolveBannerState({ online: false, last_seen: T })).toEqual({
        kind: 'down',
        windowsLastSeen: T,
        standbyLastSeen: null,
      });
    });
    it('online null → hidden (inert), as before', () => {
      expect(resolveBannerState({ online: null, last_seen: null })).toEqual({ kind: 'hidden' });
    });
  });
});
