// Director, 29 Sep 2026 (#28): the `interview` meeting type may be HIDDEN, so it
// stays off /meet/<handle> (where it could be booked without the candidate
// questions) while the interview link can still book it. Every other caller
// keeps "hidden = not bookable".

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PublicHostService } from '@/lib/services/meetings/public-host-service';
import {
  readInterviewHostSetting,
  resolveInterviewHost,
} from '@/lib/services/hr/interview-booking-service';

/** A thenable query double per table; records the meeting_types .or() filter. */
function fakeDb(opts: { setting?: unknown } = {}) {
  const seen = { typesOr: [] as string[] };
  const results: Record<string, unknown> = {
    meeting_host_pages: { data: { host_profile_id: 'h1', handle: 'omm', headline: null, is_public: true, auto_hidden: false }, error: null },
    meeting_host_google_connections: { data: [{ host_profile_id: 'h1' }], error: null },
    profiles: { data: null, error: null }, // stops resolveBookableHost right after the types query
    meeting_types: { data: [], error: null },
  };
  const db = {
    rpc: vi.fn(async () => ({ data: opts.setting ?? null, error: null })),
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
      chain.or = (f: string) => {
        if (table === 'meeting_types') seen.typesOr.push(f);
        return chain;
      };
      chain.maybeSingle = () => Promise.resolve(results[table]);
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(results[table]).then(res);
      return chain;
    },
  };
  return { db: db as never, seen };
}

describe('PublicHostService.resolveBookableHost — hidden stays hidden unless named', () => {
  it('by default loads visible types only', async () => {
    const { db, seen } = fakeDb();
    await PublicHostService.resolveBookableHost(db, 'omm');
    expect(seen.typesOr).toEqual(['hidden.eq.false']);
  });

  it('with alsoHiddenSlug, also loads that one hidden type', async () => {
    const { db, seen } = fakeDb();
    await PublicHostService.resolveBookableHost(db, 'omm', { alsoHiddenSlug: 'interview' });
    expect(seen.typesOr).toEqual(['hidden.eq.false,slug.eq.interview']);
  });

  it('a slug that is not a plain slug cannot widen the filter', async () => {
    const { db, seen } = fakeDb();
    await PublicHostService.resolveBookableHost(db, 'omm', { alsoHiddenSlug: 'x,hidden.eq.true' });
    expect(seen.typesOr).toEqual(['hidden.eq.false']);
  });
});

describe('the interview link', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('asks for its own type even when hidden', async () => {
    const spy = vi.spyOn(PublicHostService, 'resolveBookableHost').mockResolvedValue({
      handle: 'omm',
      meetingTypes: [{ slug: 'interview' }],
    } as never);
    const { db } = fakeDb({ setting: { handle: 'omm', type_slug: 'interview' } });
    const host = await resolveInterviewHost(db);
    expect(spy).toHaveBeenCalledWith(db, 'omm', { alsoHiddenSlug: 'interview' });
    expect(host?.meetingType.slug).toBe('interview');
  });

  it('reads the setting lower-cased, and null when incomplete', async () => {
    expect(await readInterviewHostSetting(fakeDb({ setting: { handle: ' OMM ', type_slug: 'Interview' } }).db)).toEqual({
      handle: 'omm',
      type_slug: 'interview',
    });
    expect(await readInterviewHostSetting(fakeDb({ setting: { handle: 'omm' } }).db)).toBeNull();
  });
});
