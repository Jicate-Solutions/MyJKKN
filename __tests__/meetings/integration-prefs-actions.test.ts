// __tests__/meetings/integration-prefs-actions.test.ts
//
// Tests for the host "Video provider" server actions (Universal Booking
// Wave-3). The contract under test:
//   • saveIntegrationPref REFUSES a provider the institution hasn't enabled
//     (env-gated isZoomConfigured / isTeamsConfigured = false) and never calls
//     the RPC for it — defense-in-depth behind the client's disabled state.
//   • google is always selectable (per-host OAuth, not platform-env gated).
//   • the per-host identity is cleared for google and trimmed/normalised for
//     zoom/teams before reaching the RPC.
//   • getIntegrationPrefs defaults a missing row to 'google'.
//   • the note-in-title opt-in survives a database where migration
//     20260813000000 is not applied yet (42703 → the toggle is reported
//     unsupported and the rest of the card still loads), is written only when
//     the card actually offered it, and NEVER fails silently.
//
// supabase/server and the env-gated service modules are mocked so the actions
// run without cookies, a database, or real credentials.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── mocks ────────────────────────────────────────────────────────────────────

const configured = { google: true, zoom: false, teams: false };

vi.mock('@/lib/services/integrations/google-calendar-service', () => ({
  isGoogleCalConfigured: () => configured.google,
}));
vi.mock('@/lib/services/integrations/zoom-service', () => ({
  isZoomConfigured: () => configured.zoom,
}));
vi.mock('@/lib/services/integrations/teams-service', () => ({
  isTeamsConfigured: () => configured.teams,
}));

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateEqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: updateEqMock }));

function makeSupabase(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
    },
    rpc: rpcMock,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
      update: updateMock,
    })),
  };
}

let currentUser: string | null = 'host-1';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeSupabase(currentUser)),
}));

// Import AFTER the mocks are registered.
import {
  getIntegrationPrefs,
  saveIntegrationPref,
} from '@/app/(routes)/meetings/availability/_components/integration-prefs-actions';

beforeEach(() => {
  currentUser = 'host-1';
  configured.google = true;
  configured.zoom = false;
  configured.teams = false;
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ error: null });
  maybeSingleMock.mockReset();
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  updateMock.mockClear();
  updateEqMock.mockReset();
  updateEqMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('saveIntegrationPref — availability gate', () => {
  it('refuses zoom when the institution has not configured it (no RPC call)', async () => {
    configured.zoom = false;
    const res = await saveIntegrationPref({ videoProvider: 'zoom' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not enabled/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('refuses teams when unconfigured (no RPC call)', async () => {
    configured.teams = false;
    const res = await saveIntegrationPref({ videoProvider: 'teams' });
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('always allows google even if other providers are off', async () => {
    const res = await saveIntegrationPref({ videoProvider: 'google' });
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledWith('fn_set_meeting_integration_pref', {
      p_video_provider: 'google',
      p_provider_host_identity: null, // identity always null for google
    });
  });

  it('allows zoom once the institution enables it', async () => {
    configured.zoom = true;
    const res = await saveIntegrationPref({
      videoProvider: 'zoom',
      providerHostIdentity: '  host@jkkn.ac.in  ',
    });
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('fn_set_meeting_integration_pref', {
      p_video_provider: 'zoom',
      p_provider_host_identity: 'host@jkkn.ac.in', // trimmed
    });
  });
});

describe('saveIntegrationPref — identity normalisation', () => {
  it('drops the identity entirely for google', async () => {
    const res = await saveIntegrationPref({
      videoProvider: 'google',
      providerHostIdentity: 'should@be.ignored',
    });
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('fn_set_meeting_integration_pref', {
      p_video_provider: 'google',
      p_provider_host_identity: null,
    });
  });

  it('treats a whitespace-only zoom identity as null', async () => {
    configured.zoom = true;
    const res = await saveIntegrationPref({
      videoProvider: 'zoom',
      providerHostIdentity: '   ',
    });
    expect(res.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('fn_set_meeting_integration_pref', {
      p_video_provider: 'zoom',
      p_provider_host_identity: null,
    });
  });

  it('rejects an unknown provider value', async () => {
    const res = await saveIntegrationPref({
      // @ts-expect-error — deliberately invalid
      videoProvider: 'webex',
    });
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('saveIntegrationPref — auth gate', () => {
  it('fails closed when signed out', async () => {
    currentUser = null;
    const res = await saveIntegrationPref({ videoProvider: 'google' });
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('getIntegrationPrefs', () => {
  it('defaults a missing row to google and reports availability', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await getIntegrationPrefs();
    expect(res.success).toBe(true);
    expect(res.data?.videoProvider).toBe('google');
    expect(res.data?.providerHostIdentity).toBeNull();
    expect(res.data?.availability).toEqual({ google: true, zoom: false, teams: false });
  });

  it('returns the stored provider + identity when a row exists', async () => {
    configured.zoom = true;
    maybeSingleMock.mockResolvedValue({
      data: { video_provider: 'zoom', provider_host_identity: 'host@jkkn.ac.in' },
      error: null,
    });
    const res = await getIntegrationPrefs();
    expect(res.success).toBe(true);
    expect(res.data?.videoProvider).toBe('zoom');
    expect(res.data?.providerHostIdentity).toBe('host@jkkn.ac.in');
    expect(res.data?.availability.zoom).toBe(true);
  });
});

describe('note in calendar title — opt-in, default off', () => {
  it('reads the stored opt-in when the column exists', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        video_provider: 'google',
        provider_host_identity: null,
        show_note_in_title: true,
      },
      error: null,
    });
    const res = await getIntegrationPrefs();
    expect(res.success).toBe(true);
    expect(res.data?.noteInTitleSupported).toBe(true);
    expect(res.data?.showNoteInTitle).toBe(true);
  });

  it('defaults to off for a host with no prefs row', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await getIntegrationPrefs();
    expect(res.success).toBe(true);
    expect(res.data?.showNoteInTitle).toBe(false);
  });

  it('still loads the card when the migration is not applied (42703)', async () => {
    // First select asks for show_note_in_title and the column is absent; the
    // retry without it must succeed and keep the provider intact.
    maybeSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column ... does not exist' },
      })
      .mockResolvedValueOnce({
        data: { video_provider: 'zoom', provider_host_identity: 'host@jkkn.ac.in' },
        error: null,
      });
    configured.zoom = true;

    const res = await getIntegrationPrefs();
    expect(res.success).toBe(true);
    expect(res.data?.noteInTitleSupported).toBe(false);
    expect(res.data?.showNoteInTitle).toBe(false);
    expect(res.data?.videoProvider).toBe('zoom');
    expect(res.data?.providerHostIdentity).toBe('host@jkkn.ac.in');
  });

  it('writes the opt-in on the host’s own row when the card sent it', async () => {
    const res = await saveIntegrationPref({
      videoProvider: 'google',
      showNoteInTitle: true,
    });
    expect(res.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ show_note_in_title: true });
    expect(updateEqMock).toHaveBeenCalledWith('host_profile_id', 'host-1');
    expect(res.data?.showNoteInTitle).toBe(true);
  });

  it('does not touch the column when the card omitted the toggle', async () => {
    const res = await saveIntegrationPref({ videoProvider: 'google' });
    expect(res.success).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    expect(res.data?.noteInTitleSupported).toBe(false);
    expect(res.data?.showNoteInTitle).toBe(false);
  });

  it('reports an explicit error rather than failing silently', async () => {
    updateEqMock.mockResolvedValue({
      error: { code: '42703', message: 'column ... does not exist' },
    });
    const res = await saveIntegrationPref({
      videoProvider: 'google',
      showNoteInTitle: true,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/calendar title/i);
  });
});
