// __tests__/events/event-incharge-sees-logistics.test.ts
//
// BUG-006268 / BUG-006274: the Director made the COO an in-charge of the
// cultural event OLYMPUS-2K26 (9 Oct: "Add COO as in-charge") so they could see
// its budget. It still did not show: /events/[id] fed EventLogistics
// canManage={canEdit}, and canEditEvent never looks at config.incharges, so the
// Budget, Sponsors and Incidents tabs stayed hidden (hideSensitiveWithoutManage).
//
// The database already admits in-charges to those tables — the
// *_event_team_write policies (migrations 20261220092000 and 20261220093000)
// test fn_is_event_incharge(event_id) for both USING and WITH CHECK.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// event-display -> use-general-events -> EventBaseService builds a Supabase
// client at module level; the logistics registry pulls in every board, which
// do the same. Nothing here touches either.
vi.mock('@/lib/services/events/core/event-base-service', () => ({ EventBaseService: {} }));
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  canCancelEvent,
  canEditEvent,
  eventLogisticsFlags,
  isEventIncharge,
} from '@/app/(routes)/events/_components/event-display';
import {
  EVENT_LOGISTICS_TABS,
  INCHARGE_FLAG_ALLOWLIST,
  LOGISTICS_INCHARGE_WRITE_AUDIT,
  boardCanManage,
  boardManageFlag,
  visibleLogisticsTabs,
} from '@/components/events/shared/event-logistics';

const COO = 'coo-user-id';
const PLAIN = 'plain-viewer-id';
const CREATOR = 'creator-id';

const olympus = {
  id: '663b1e8f',
  created_by: CREATOR,
  institution_id: 'inst-arts',
  config: { incharges: [{ member_id: 'someone-else', name: 'A' }, { member_id: COO, name: 'COO' }] },
};

describe('isEventIncharge', () => {
  it('is true for a viewer listed in config.incharges', () => {
    expect(isEventIncharge(olympus, COO)).toBe(true);
  });

  it('is false for a viewer who is not listed', () => {
    expect(isEventIncharge(olympus, PLAIN)).toBe(false);
  });

  it('is false with no config, no list, a non-array list, or junk entries', () => {
    expect(isEventIncharge({ config: null }, COO)).toBe(false);
    expect(isEventIncharge({}, COO)).toBe(false);
    expect(isEventIncharge({ config: {} }, COO)).toBe(false);
    expect(isEventIncharge({ config: { incharges: 'x' } }, COO)).toBe(false);
    expect(isEventIncharge({ config: { incharges: [null, 'x', { name: 'no id' }] } }, COO)).toBe(false);
  });

  it('compares exactly, like fn_is_event_incharge (member_id = auth.uid()::text)', () => {
    const upper = { config: { incharges: [{ member_id: COO.toUpperCase() }] } };
    // The database would refuse this viewer's writes, so the UI must not open the tabs.
    expect(isEventIncharge(upper, COO)).toBe(false);
  });

  it('is false for a signed-out viewer or a missing event', () => {
    expect(isEventIncharge(olympus, undefined)).toBe(false);
    expect(isEventIncharge(olympus, null)).toBe(false);
    expect(isEventIncharge(olympus, '')).toBe(false);
    expect(isEventIncharge(null, COO)).toBe(false);
  });

  it('does not make an in-charge an editor — canEditEvent is unchanged', () => {
    expect(
      canEditEvent(olympus, { userId: COO, institutionId: 'main-office', isSuperAdmin: false, canEditAny: false }),
    ).toBe(false);
  });
});

/** What /events/[id] computes for the logistics flags (the page calls this). */
function flagsFor(userId: string) {
  const canEdit = canEditEvent(olympus, {
    userId,
    institutionId: 'main-office',
    isSuperAdmin: false,
    canEditAny: false,
  });
  return eventLogisticsFlags(olympus, userId, canEdit);
}

function logisticsTabsFor(userId: string) {
  return visibleLogisticsTabs({
    eventType: 'cultural',
    canManage: flagsFor(userId).canManage,
    hideSensitiveWithoutManage: true,
  }).map((t) => t.key);
}

describe('eventLogisticsFlags', () => {
  it('in-charge who is not an editor: canManage true, canEdit false', () => {
    expect(flagsFor(COO)).toEqual({ canManage: true, canEdit: false });
  });
  it('creator (an editor): both true', () => {
    expect(flagsFor(CREATOR)).toEqual({ canManage: true, canEdit: true });
  });
  it('plain viewer: both false', () => {
    expect(flagsFor(PLAIN)).toEqual({ canManage: false, canEdit: false });
  });
});

describe('canCancelEvent uses the same in-charge rule', () => {
  it('agrees with isEventIncharge for a non-admin', () => {
    for (const uid of [COO, PLAIN, CREATOR, COO.toUpperCase(), '', null, undefined]) {
      expect(canCancelEvent(olympus, { userId: uid })).toBe(isEventIncharge(olympus, uid));
    }
  });
});

describe('the Budget tab on /events/[id]', () => {
  it('appears for an in-charge who is not the creator or an editor', () => {
    const keys = logisticsTabsFor(COO);
    expect(keys).toContain('budget');
    expect(keys).toContain('sponsors');
    expect(keys).toContain('incidents');
  });

  it('stays hidden for a plain viewer', () => {
    const keys = logisticsTabsFor(PLAIN);
    expect(keys).not.toContain('budget');
    expect(keys).not.toContain('sponsors');
    expect(keys).not.toContain('incidents');
  });

  // The page is too heavy to render here; the flag logic is tested above as a
  // pure helper, so this only checks the wiring: both flags reach the console.
  it('the page passes both flags from eventLogisticsFlags', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(routes)/events/[id]/page.tsx'),
      'utf8',
    );
    expect(src).toContain('eventLogisticsFlags(event, profile?.id, canEdit)');
    const logistics = src.slice(src.indexOf('<EventLogistics'));
    const props = logistics.slice(0, logistics.indexOf('/>'));
    expect(props).toContain('canManage={logisticsFlags.canManage}');
    expect(props).toContain('canEdit={logisticsFlags.canEdit}');
    expect(props).toContain('hideSensitiveWithoutManage');
  });
});

// PR #4326 review: the audit table lives next to the registry in
// event-logistics.tsx; this enforces it. The rendered result is checked in
// event-logistics-incharge-flags.test.tsx.
describe('in-charge write audit — board to flag mapping', () => {
  const IN_CHARGE = { canManage: true, canEdit: false };

  it('classifies every registered tab, and nothing else', () => {
    expect(Object.keys(LOGISTICS_INCHARGE_WRITE_AUDIT).sort()).toEqual(
      EVENT_LOGISTICS_TABS.map((t) => t.key).sort(),
    );
    for (const classes of Object.values(LOGISTICS_INCHARGE_WRITE_AUDIT)) {
      expect(classes.length).toBeGreaterThan(0);
    }
  });

  it('the allowlist of boards that may break the rule is empty', () => {
    expect(INCHARGE_FLAG_ALLOWLIST).toEqual([]);
  });

  it('no OPEN, EDITOR-ONLY or EVENTS-ROW board receives the in-charge flag unless allowlisted', () => {
    const offenders = Object.entries(LOGISTICS_INCHARGE_WRITE_AUDIT)
      .filter(([, c]) => c.some((x) => x === 'open' || x === 'editor-only' || x === 'events-row'))
      .map(([k]) => k)
      .filter((k) => !INCHARGE_FLAG_ALLOWLIST.includes(k))
      .filter((k) => boardCanManage(k, IN_CHARGE));
    expect(offenders).toEqual([]);
  });

  it('pins the mapping for an in-charge who is not an editor', () => {
    const got = Object.fromEntries(
      EVENT_LOGISTICS_TABS.map((t) => [t.key, boardCanManage(t.key, IN_CHARGE)]),
    );
    expect(got).toEqual({
      registrations: true,
      sponsors: true,
      budget: true,
      committees: true,
      checkin: true,
      qr: true,
      volunteers: false,
      incidents: true,
      certificates: false,
      'bulk-import': false,
      analytics: true,
      kit: true,
      messages: true,
    });
  });

  it('an unaudited board gets canEdit, never the in-charge flag', () => {
    expect(boardManageFlag('some-new-board')).toBe('canEdit');
    expect(boardCanManage('some-new-board', IN_CHARGE)).toBe(false);
  });

  it('every tab render passes the canManage it is given straight to its board', () => {
    for (const eventType of ['cultural', 'sports_tournament', 'marathon']) {
      for (const tab of EVENT_LOGISTICS_TABS) {
        for (const value of [true, false]) {
          const el = tab.render({
            eventId: 'e1',
            eventType,
            canManage: value,
            canEditTasks: value,
          }) as { props: { canManage?: boolean } };
          expect(el.props.canManage, `${tab.key} on ${eventType}`).toBe(value);
        }
      }
    }
  });
});
