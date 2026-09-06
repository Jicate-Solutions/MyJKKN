// __tests__/events/event-logistics-tabs.test.ts
//
// Cover for the Event Logistics visibility filter, which now answers three
// questions instead of one:
//
//  1. Does this event TYPE get the tab? (the original `eventTypes` map)
//  2. Did the event SELECT this tool at creation? (`config.enabled_tools`, a
//     field that existed in PresetConfig since PR9 and that nothing ever read)
//  3. May this VIEWER see it? — Sponsors / Budget / Incidents expose money and
//     incident detail, and `canManage={false}` makes boards read-only, NOT
//     hidden. That is safe on the tournament console, which checks
//     `access.canView` before rendering anything, and unsafe on /events/[id],
//     which deliberately has no client-side gate.
//
// The registry itself is append-only, so these assert on behaviour, not on the
// exact tab list — except where a specific key is the point.

import { describe, it, expect, vi } from 'vitest';

// The filter is pure, but importing the registry pulls in every board, and those
// build a Supabase client at MODULE level (RoleService's static initializer) and
// need env vars. Stub the client factory so the module graph loads; nothing here
// touches it. Same workaround as event-venue-booking-range.test.ts.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  EVENT_LOGISTICS_TABS,
  visibleLogisticsTabs,
} from '@/components/events/shared/event-logistics';

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe('EVENT_LOGISTICS_TABS registry', () => {
  it('leads with Registrations — the event\'s primary record', () => {
    expect(EVENT_LOGISTICS_TABS[0].key).toBe('registrations');
  });

  it('has unique keys', () => {
    const seen = keys(EVENT_LOGISTICS_TABS);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('enabled_tools', () => {
  it('shows every tab when no selection was recorded', () => {
    // Every event created before the tools picker existed has no key at all.
    expect(visibleLogisticsTabs({ eventType: 'lecture' })).toHaveLength(
      EVENT_LOGISTICS_TABS.length,
    );
    expect(visibleLogisticsTabs({ eventType: 'lecture', enabledTools: null })).toHaveLength(
      EVENT_LOGISTICS_TABS.length,
    );
  });

  it('treats an EMPTY selection as "all", never as "none"', () => {
    // Writing [] to mean "no tools" would blank the console; the create form
    // omits the key entirely instead, and this is the matching read.
    expect(visibleLogisticsTabs({ eventType: 'lecture', enabledTools: [] })).toHaveLength(
      EVENT_LOGISTICS_TABS.length,
    );
  });

  it('shows exactly the selected tools, plus Registrations', () => {
    const tabs = visibleLogisticsTabs({
      eventType: 'lecture',
      enabledTools: ['budget', 'certificates'],
    });
    expect(keys(tabs).sort()).toEqual(['budget', 'certificates', 'registrations']);
  });

  it('keeps Registrations even when the selection omits it', () => {
    const tabs = visibleLogisticsTabs({ eventType: 'lecture', enabledTools: ['kit'] });
    expect(keys(tabs)).toContain('registrations');
  });

  it('ignores unknown tool keys rather than inventing tabs', () => {
    const tabs = visibleLogisticsTabs({
      eventType: 'lecture',
      enabledTools: ['budget', 'not-a-real-tool'],
    });
    expect(keys(tabs).sort()).toEqual(['budget', 'registrations']);
  });
});

describe('sensitive tabs', () => {
  const SENSITIVE = ['sponsors', 'budget', 'incidents'];

  it('hides money and incident tabs from non-managers when the host page asks', () => {
    const tabs = visibleLogisticsTabs({
      eventType: 'cultural',
      canManage: false,
      hideSensitiveWithoutManage: true,
    });
    for (const key of SENSITIVE) expect(keys(tabs)).not.toContain(key);
    // Everything else stays — read-only, but present.
    expect(keys(tabs)).toContain('registrations');
    expect(keys(tabs)).toContain('committees');
    expect(keys(tabs)).toContain('analytics');
  });

  it('shows them to a manager on the same page', () => {
    const tabs = visibleLogisticsTabs({
      eventType: 'cultural',
      canManage: true,
      hideSensitiveWithoutManage: true,
    });
    for (const key of SENSITIVE) expect(keys(tabs)).toContain(key);
  });

  it('leaves the tournament console unchanged — the flag is opt-in', () => {
    // The tournament page gates on access.canView first and deliberately shows
    // committee members every board read-only. Defaulting the flag to true would
    // silently take three boards away from them.
    const tabs = visibleLogisticsTabs({ eventType: 'sports_tournament', canManage: false });
    for (const key of SENSITIVE) expect(keys(tabs)).toContain(key);
  });

  it('applies both filters together', () => {
    const tabs = visibleLogisticsTabs({
      eventType: 'lecture',
      enabledTools: ['budget', 'kit'],
      canManage: false,
      hideSensitiveWithoutManage: true,
    });
    expect(keys(tabs).sort()).toEqual(['kit', 'registrations']);
  });
});
