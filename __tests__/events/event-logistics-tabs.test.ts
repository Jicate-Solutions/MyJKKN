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
import { EVENT_TOOL_KEYS } from '@/types/events-presets';

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

  it('shows exactly the selected tools, plus the always-on ones', () => {
    const tabs = visibleLogisticsTabs({
      eventType: 'lecture',
      enabledTools: ['budget', 'certificates'],
    });
    expect(keys(tabs).sort()).toEqual(['budget', 'certificates', 'messages', 'registrations']);
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
    expect(keys(tabs).sort()).toEqual(['budget', 'messages', 'registrations']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Messages must be REACHABLE, not merely registered
// ───────────────────────────────────────────────────────────────────────────
// `enabled_tools` is written once by the create wizard and never edited: the
// edit dialog merges `config` without touching it, and EVENT_TOOL_KEYS does not
// list `messages`, so no picker anywhere can add it. An opt-in tab would
// therefore be permanently invisible on every event that chose its tools, with
// no operator route to turn it on — built, wired, unreachable.

describe('Messages reachability', () => {
  it('shows Messages on an event whose tool selection predates the tab', () => {
    // A real saved selection from before this tab existed: it cannot name
    // `messages`, because `messages` did not exist when it was written.
    const tabs = visibleLogisticsTabs({
      eventType: 'lecture',
      enabledTools: ['sponsors', 'budget', 'committees', 'volunteers', 'certificates'],
    });
    expect(keys(tabs)).toContain('messages');
  });

  it('shows Messages for every event type, with or without a selection', () => {
    for (const eventType of ['lecture', 'cultural', 'sports_tournament', 'marathon', 'induction']) {
      expect(keys(visibleLogisticsTabs({ eventType }))).toContain('messages');
      expect(keys(visibleLogisticsTabs({ eventType, enabledTools: ['kit'] }))).toContain('messages');
    }
  });

  it('keeps Messages for a viewer who cannot manage the event', () => {
    // The in-charge and an ordinary admin BOTH arrive here with canManage=false
    // on /events/[id] (canEditEvent recognises neither), and both are allowed to
    // send by fn_can_manage_event_messages. Hiding the tab on canManage would
    // lock out the people the feature exists for; the board asks the server and
    // renders an explicit denial when the answer is really no.
    const tabs = visibleLogisticsTabs({
      eventType: 'cultural',
      canManage: false,
      hideSensitiveWithoutManage: true,
    });
    expect(keys(tabs)).toContain('messages');
  });

  it('is not listed as a pickable tool, which is why it is always on', () => {
    // If this ever starts failing because `messages` was added to
    // EVENT_TOOL_KEYS, revisit ALWAYS_ON_TAB_KEYS — but note that opting in
    // would still leave every EXISTING event's saved selection without it.
    expect([...EVENT_TOOL_KEYS]).not.toContain('messages');
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
    // budget is sensitive and dropped; messages and registrations are always on.
    expect(keys(tabs).sort()).toEqual(['kit', 'messages', 'registrations']);
  });
});
