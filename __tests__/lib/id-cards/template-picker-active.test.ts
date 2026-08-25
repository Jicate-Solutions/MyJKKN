// ============================================================================
// Guard: an inactive ID-card template must never reach a PRINT picker.
// Created: 2026-08-13.
//
// WHAT WENT WRONG. The print dialog pre-selected a template named for an
// end-to-end test. Two independent paths landed there and BOTH were live:
//
//   1. the final fallback was a bare `rows[0]` — with every template dark, the
//      `active DESC` server sort collapses to name order and whatever sorts
//      first becomes the default;
//   2. the remembered choice (localStorage `idcards.lastTemplateId`) was
//      honoured with no re-check of `active`, so one click on a test template
//      pinned it on that browser forever.
//
// WHY THIS IS PURE-FUNCTION TESTED. The bug lived inside a `useEffect`, and
// vitest here defaults to `environment: 'node'` (vitest.config.js) — a test
// that mounts the picker needs a jsdom glob and a Supabase stub, i.e. more
// scaffolding than the rule it protects. The preference logic is extracted to
// lib/services/id-cards/template-picker.ts precisely so the option list and the
// default can be asserted directly, with no DOM.
//
// SCOPE. Print paths only. The admin design/mapping tabs KEEP every template —
// a template is designed while it is dark, so hiding dark rows there would make
// a new template unreachable. That asymmetry is asserted below too, so a later
// "consistency" cleanup that filters admin as well fails here.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  activeTemplatesOnly,
  hasOnlyInactiveTemplates,
  pickPreferredAdminTemplateId,
  pickPreferredPrintTemplate
} from '@/lib/services/id-cards/template-picker';

const E2E = { id: 'e2e-0001', name: 'AAA E2E test template', active: false };
const DARK = { id: 'dark-0002', name: 'Draft nursing card', active: false };
const LIVE = { id: 'live-0003', name: 'Pharmacy card 2026', active: true };
const LIVE_2 = { id: 'live-0004', name: 'Zzz dental card', active: true };

describe('print picker option list', () => {
  it('excludes inactive templates', () => {
    const options = activeTemplatesOnly([E2E, DARK, LIVE, LIVE_2]);

    expect(options.map((t) => t.id)).toEqual([LIVE.id, LIVE_2.id]);
    expect(options.some((t) => !t.active)).toBe(false);
  });

  it('offers nothing at all when every template is dark', () => {
    expect(activeTemplatesOnly([E2E, DARK])).toEqual([]);
  });

  it('leaves an all-active list untouched', () => {
    expect(activeTemplatesOnly([LIVE, LIVE_2])).toEqual([LIVE, LIVE_2]);
  });
});

describe('print picker default', () => {
  it('never pre-selects an inactive template, even when it sorts first', () => {
    // The exact live shape: server sort is active DESC then name ASC, so with
    // one active row the E2E template still sorts ahead of the dark one.
    const preferred = pickPreferredPrintTemplate([LIVE, E2E, DARK], null);

    expect(preferred?.id).toBe(LIVE.id);
    expect(preferred?.active).toBe(true);
  });

  it('ignores a remembered template that has since been switched off', () => {
    // The regression: an id left in localStorage from an earlier click.
    const preferred = pickPreferredPrintTemplate([LIVE, E2E], E2E.id);

    expect(preferred?.id).toBe(LIVE.id);
  });

  it('honours a remembered template while it is still active', () => {
    const preferred = pickPreferredPrintTemplate([LIVE, LIVE_2], LIVE_2.id);

    expect(preferred?.id).toBe(LIVE_2.id);
  });

  it('ignores a remembered id that no longer exists', () => {
    const preferred = pickPreferredPrintTemplate([LIVE], 'deleted-9999');

    expect(preferred?.id).toBe(LIVE.id);
  });

  it('selects nothing when no template is switched on', () => {
    // Production state on the day this shipped: every template dark. The
    // picker must come up EMPTY (button disabled) rather than loaded with a
    // test template — a wrong card is worse than no card.
    expect(pickPreferredPrintTemplate([E2E, DARK], null)).toBeNull();
    expect(pickPreferredPrintTemplate([E2E, DARK], E2E.id)).toBeNull();
    expect(pickPreferredPrintTemplate([], null)).toBeNull();
  });
});

describe('empty-state discrimination', () => {
  it('separates "none switched on" from "none exist"', () => {
    // Two different operator remedies, so they cannot share one message.
    expect(hasOnlyInactiveTemplates([E2E, DARK])).toBe(true);
    expect(hasOnlyInactiveTemplates([])).toBe(false);
    expect(hasOnlyInactiveTemplates([E2E, LIVE])).toBe(false);
  });
});

describe('admin picker keeps dark templates reachable', () => {
  it('prefers an active template as the default', () => {
    expect(pickPreferredAdminTemplateId([E2E, DARK, LIVE], '')).toBe(LIVE.id);
  });

  it('still opens a dark template when nothing is switched on', () => {
    // The whole point of admin: a template is designed BEFORE it is switched
    // on. Returning '' here would strand the design tab on an empty picker.
    expect(pickPreferredAdminTemplateId([E2E, DARK], '')).toBe(E2E.id);
  });

  it('lets the operator stay on a dark template they chose', () => {
    expect(pickPreferredAdminTemplateId([E2E, LIVE], E2E.id)).toBe(E2E.id);
  });

  it('drops a selection that no longer exists', () => {
    expect(pickPreferredAdminTemplateId([LIVE], 'deleted-9999')).toBe(LIVE.id);
  });

  it('returns an empty id when there are no templates', () => {
    expect(pickPreferredAdminTemplateId([], '')).toBe('');
  });
});
