// __tests__/events/event-logistics-tool-keys.test.ts
//
// THE INVARIANT BETWEEN THE TAB REGISTRY AND THE TOOLS PICKER.
//
// Two vocabularies describe the same set of boards and they are maintained in
// different files: EVENT_LOGISTICS_TABS (components/events/shared/event-logistics.tsx)
// mounts the tabs, and EVENT_TOOL_KEYS (types/events-presets.ts) is what the
// create wizard can offer and writes into events.config.enabled_tools. Nothing
// ever checked that the two agreed, and they did not:
//
//   • tab 'checkin'  — no picker entry spelled that way  → permanently hidden
//   • tab 'qr'       — no picker entry at all            → permanently hidden
//   • picker 'check-in' (labelled "Check-in & QR Passes") — no tab answered to
//     it → a dead checkbox that enabled nothing
//
// One hyphen, three symptoms. The comparison is a raw string match
// (`enabledTools.includes(...)`) with no normalisation, so nothing else caught
// it: it typechecks, it lints, it builds, and it is invisible until an
// organiser ticks the box and loses the board on race morning.
//
// These tests are the gate. They fail loudly and NAME the offending key, so the
// next tab added with a mismatched key is caught at the point it is written
// rather than by whoever is running the event.

import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';

// Importing the registry pulls in every board, and those build a Supabase
// client at MODULE level (RoleService's static initializer). Stub the factory so
// the module graph loads; nothing here touches it.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  EVENT_LOGISTICS_TABS,
  toolKeyFor,
  visibleLogisticsTabs,
} from '@/components/events/shared/event-logistics';
import { EVENT_TOOL_KEYS, EVENT_TOOL_LABELS } from '@/types/events-presets';

/**
 * Tabs shown regardless of the saved selection.
 *
 * ⚠️ DO NOT "FIX" THIS BY IMPORTING IT. This list is duplicated from
 * event-logistics.tsx ON PURPOSE, and importing the real one would silently
 * delete the check. An always-on tab is a tab that bypasses the picker
 * entirely, which is the one change in this file that should never happen
 * without a human seeing it. If this list is imported, adding a tab to the
 * always-on set makes both sides agree automatically and the test keeps
 * passing — it would assert only that the file equals itself.
 *
 * It earned that design on its first outing. PR #3699 added `messages` to the
 * always-on set while this branch was open; on merge the invariant fired with
 * "messages … PERMANENTLY HIDDEN" until this list was updated to match. That
 * was the mirror working, not failing: the merge could not complete until
 * somebody looked at the always-on set and agreed with it.
 *
 * So: when the real list changes, change this one too, and say why in the PR.
 */
const ALWAYS_ON = ['registrations', 'messages'];

const PICKER = EVENT_TOOL_KEYS as readonly string[];
const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe('registry ↔ picker invariant', () => {
  it('every tab can be switched on — it is offerable, or it is always-on', () => {
    const unreachable = EVENT_LOGISTICS_TABS.filter(
      (tab) => !ALWAYS_ON.includes(tab.key) && !PICKER.includes(toolKeyFor(tab))
    ).map((tab) => `${tab.key} (label "${tab.label}", tool key "${toolKeyFor(tab)}")`);

    expect(
      unreachable,
      unreachable.length
        ? `These tabs are PERMANENTLY HIDDEN on any event that saved a tool selection: ` +
          `${unreachable.join('; ')}. No picker entry can switch them on and there is no ` +
          `operator route to edit enabled_tools after creation. Either give the tab a ` +
          `toolKey naming an existing EVENT_TOOL_KEYS entry, add an entry for it, or add ` +
          `it to the always-on set.`
        : undefined
    ).toEqual([]);
  });

  it('every picker entry actually mounts something — no dead checkboxes', () => {
    const claimed = new Set(EVENT_LOGISTICS_TABS.map(toolKeyFor));
    const dead = PICKER.filter((k) => !claimed.has(k)).map(
      (k) => `${k} (offered as "${EVENT_TOOL_LABELS[k as keyof typeof EVENT_TOOL_LABELS]}")`
    );

    expect(
      dead,
      dead.length
        ? `The create wizard offers these tools and ticking them enables NOTHING: ` +
          `${dead.join('; ')}. The organiser is told they are getting a board they will ` +
          `never see. Give some tab a matching toolKey, or remove the entry.`
        : undefined
    ).toEqual([]);
  });

  it('names the one entry that deliberately covers more than one tab', () => {
    // Documented rather than merely allowed: a reviewer seeing a second
    // many-to-one mapping should ask whether it was intended.
    const byToolKey = new Map<string, string[]>();
    for (const tab of EVENT_LOGISTICS_TABS) {
      const tk = toolKeyFor(tab);
      byToolKey.set(tk, [...(byToolKey.get(tk) ?? []), tab.key]);
    }
    const shared = [...byToolKey.entries()].filter(([, tabs]) => tabs.length > 1);
    expect(shared).toEqual([['check-in', ['checkin', 'qr']]]);
  });

  it('keeps every tool key and tab key unique', () => {
    expect(new Set(PICKER).size).toBe(PICKER.length);
    const tabKeys = keys(EVENT_LOGISTICS_TABS);
    expect(new Set(tabKeys).size).toBe(tabKeys.length);
  });
});

describe('the "Check-in & QR Passes" entry, end to end', () => {
  it('ticking it shows BOTH boards', () => {
    // The defect: this returned neither. The label promises both, so both.
    const tabs = keys(visibleLogisticsTabs({ eventType: 'marathon', enabledTools: ['check-in'] }));
    expect(tabs).toContain('checkin');
    expect(tabs).toContain('qr');
  });

  it('not ticking it hides both, on an event that chose other tools', () => {
    const tabs = keys(visibleLogisticsTabs({ eventType: 'marathon', enabledTools: ['budget'] }));
    expect(tabs).not.toContain('checkin');
    expect(tabs).not.toContain('qr');
    expect(tabs).toContain('budget');
  });

  it('does not smuggle in the old, unmatched spelling', () => {
    // 'checkin' is the TAB key, never a tool key. If a selection somehow carries
    // it, it enables nothing — which is correct, and is what the picker could
    // never have written anyway.
    const tabs = keys(visibleLogisticsTabs({ eventType: 'marathon', enabledTools: ['checkin'] }));
    expect(tabs).not.toContain('checkin');
    expect(tabs).not.toContain('qr');
  });
});

describe('events that never chose their tools — 55 of 55 in production today', () => {
  it('shows every tab when no selection was recorded', () => {
    // The create wizard OMITS enabled_tools when nothing is ticked, so this is
    // the path every existing event takes. Changing it would blank consoles
    // across the whole module.
    expect(visibleLogisticsTabs({ eventType: 'lecture' })).toHaveLength(EVENT_LOGISTICS_TABS.length);
    expect(visibleLogisticsTabs({ eventType: 'lecture', enabledTools: null })).toHaveLength(
      EVENT_LOGISTICS_TABS.length
    );
    expect(visibleLogisticsTabs({ eventType: 'lecture', enabledTools: [] })).toHaveLength(
      EVENT_LOGISTICS_TABS.length
    );
  });

  it('still shows Check-in and QR Passes to those events', () => {
    const tabs = keys(visibleLogisticsTabs({ eventType: 'marathon' }));
    expect(tabs).toContain('checkin');
    expect(tabs).toContain('qr');
  });

  it('leaves the tournament console untouched — it passes no selection at all', () => {
    const tabs = keys(visibleLogisticsTabs({ eventType: 'sports_tournament' }));
    expect(tabs).toHaveLength(EVENT_LOGISTICS_TABS.length);
  });
});
