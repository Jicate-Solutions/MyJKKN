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

import { canEditEvent, isEventIncharge } from '@/app/(routes)/events/_components/event-display';
import { visibleLogisticsTabs } from '@/components/events/shared/event-logistics';

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

/** What /events/[id] computes for the logistics manage flag. */
function logisticsTabsFor(userId: string) {
  const canEdit = canEditEvent(olympus, {
    userId,
    institutionId: 'main-office',
    isSuperAdmin: false,
    canEditAny: false,
  });
  const canManage = canEdit || isEventIncharge(olympus, userId);
  return visibleLogisticsTabs({
    eventType: 'cultural',
    canManage,
    hideSensitiveWithoutManage: true,
  }).map((t) => t.key);
}

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

  it('the page feeds EventLogistics the in-charge-aware flag, not canEdit', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(routes)/events/[id]/page.tsx'),
      'utf8',
    );
    expect(src).toMatch(
      /const canManageLogistics\s*=\s*canEdit\s*\|\|\s*isEventIncharge\(event,\s*profile\?\.id\)/,
    );
    const logistics = src.slice(src.indexOf('<EventLogistics'));
    const props = logistics.slice(0, logistics.indexOf('/>'));
    expect(props).toContain('canManage={canManageLogistics}');
    expect(props).toContain('hideSensitiveWithoutManage');
  });
});
