// __tests__/meetings/video-provider-services.test.ts
//
// Env-gate + fail-closed contracts for the platform-level video providers the
// booking engine mints links from (Zoom S2S OAuth, Teams Graph app). The book
// path treats a null return as "no link this time" and NEVER blocks a booking,
// so the load-bearing guarantee under test is: with creds missing, isConfigured
// is false and create...() returns null WITHOUT throwing or hitting the network.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  createZoomMeeting,
  isZoomConfigured,
  __resetZoomTokenCache,
} from '@/lib/services/integrations/zoom-service';
import {
  createTeamsMeeting,
  isTeamsConfigured,
  __resetTeamsTokenCache,
} from '@/lib/services/integrations/teams-service';

const ZOOM_VARS = ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'] as const;
const TEAMS_VARS = [
  'MS_GRAPH_TENANT_ID',
  'MS_GRAPH_CLIENT_ID',
  'MS_GRAPH_CLIENT_SECRET',
  'MS_GRAPH_ORGANIZER_USER_ID',
] as const;

// A fetch spy that fails the test if the providers ever reach the network while
// unconfigured (they must short-circuit before any fetch).
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetZoomTokenCache();
  __resetTeamsTokenCache();
  fetchSpy = vi.fn().mockRejectedValue(new Error('network should not be called'));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const meeting = {
  topic: 'Test',
  startIso: '2026-07-01T10:00:00Z',
  durationMin: 30,
};

describe('zoom-service env gate', () => {
  it('is unconfigured when any of the three creds is missing', () => {
    for (const v of ZOOM_VARS) vi.stubEnv(v, '');
    expect(isZoomConfigured()).toBe(false);
    vi.stubEnv('ZOOM_ACCOUNT_ID', 'a');
    vi.stubEnv('ZOOM_CLIENT_ID', 'b');
    vi.stubEnv('ZOOM_CLIENT_SECRET', '');
    expect(isZoomConfigured()).toBe(false);
  });

  it('is configured only when all three are present', () => {
    vi.stubEnv('ZOOM_ACCOUNT_ID', 'a');
    vi.stubEnv('ZOOM_CLIENT_ID', 'b');
    vi.stubEnv('ZOOM_CLIENT_SECRET', 'c');
    expect(isZoomConfigured()).toBe(true);
  });

  it('createZoomMeeting returns null and never hits the network when unconfigured', async () => {
    for (const v of ZOOM_VARS) vi.stubEnv(v, '');
    await expect(createZoomMeeting({ ...meeting, hostEmail: 'me' })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('teams-service env gate', () => {
  it('is unconfigured when any of the four creds is missing', () => {
    for (const v of TEAMS_VARS) vi.stubEnv(v, '');
    expect(isTeamsConfigured()).toBe(false);
    vi.stubEnv('MS_GRAPH_TENANT_ID', 'a');
    vi.stubEnv('MS_GRAPH_CLIENT_ID', 'b');
    vi.stubEnv('MS_GRAPH_CLIENT_SECRET', 'c');
    vi.stubEnv('MS_GRAPH_ORGANIZER_USER_ID', '');
    expect(isTeamsConfigured()).toBe(false);
  });

  it('is configured only when all four are present', () => {
    vi.stubEnv('MS_GRAPH_TENANT_ID', 'a');
    vi.stubEnv('MS_GRAPH_CLIENT_ID', 'b');
    vi.stubEnv('MS_GRAPH_CLIENT_SECRET', 'c');
    vi.stubEnv('MS_GRAPH_ORGANIZER_USER_ID', 'd');
    expect(isTeamsConfigured()).toBe(true);
  });

  it('createTeamsMeeting returns null and never hits the network when unconfigured', async () => {
    for (const v of TEAMS_VARS) vi.stubEnv(v, '');
    await expect(createTeamsMeeting(meeting)).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
