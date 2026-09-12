import { describe, expect, it } from 'vitest';

import { PAGE_ACCESS_MAP } from '@/lib/permissions-audit/page-access-map.generated';
import { NON_KEY_GATES, isNonGateHook } from '@/lib/permissions-audit/non-key-gates';
import { resolvePageGate } from '@/lib/permissions-audit/page-gate';
import { getPermissionValue } from '@/lib/permissions-audit/role-user-counts';
import type { PageAccessEntry } from '@/types/permissions-audit';

/**
 * Guards the Page Access Lens against the two ways it can quietly become wrong:
 *
 *   1. The generated map drifts from the source it was extracted from — a page
 *      moves, a gate is renamed, and the committed artefact still describes the
 *      old shape. The build regenerates it, so the risk is not staleness but a
 *      SILENT extraction regression: a regex stops matching and a whole class of
 *      gate disappears from the lens without any error.
 *   2. A helper is "simplified" into comparing key presence rather than value,
 *      which turns every revoked permission into a grant.
 *
 * Both fail open — the screen still renders, it just tells you the wrong thing —
 * so they are asserted rather than left to review.
 */

const pageFor = (url: string): PageAccessEntry => {
  const page = PAGE_ACCESS_MAP.pages.find((p) => p.url === url);
  expect(page, `expected the map to contain ${url}`).toBeDefined();
  return page!;
};

describe('page access map — shape and coverage', () => {
  it('covers every page and records how each one is gated', () => {
    const { pages } = PAGE_ACCESS_MAP;
    // A large, healthy map. Exact counts move with the app, so assert the
    // magnitude and the invariant, not a frozen number.
    expect(pages.length).toBeGreaterThan(1400);

    const bySource = {
      direct: pages.filter((p) => p.gate.source === 'direct').length,
      inherited: pages.filter((p) => p.gate.source === 'inherited').length,
      ungated: pages.filter((p) => p.gate.source === 'ungated').length
    };
    expect(bySource.direct + bySource.inherited + bySource.ungated).toBe(pages.length);

    // Inherited pages are the majority-adjacent case the lens exists to expose.
    // If this collapses to zero, the longest-prefix walk broke.
    expect(bySource.inherited).toBeGreaterThan(400);

    // A gated page must name the entry that gated it; an ungated one must not
    // pretend to have a permission.
    for (const p of pages) {
      if (p.gate.source === 'ungated') {
        expect(p.gate.permission, `${p.url} is ungated but carries a permission`).toBeNull();
      } else {
        expect(p.gate.permission, `${p.url} is ${p.gate.source} with no permission`).toBeTruthy();
        expect(p.gate.matchedPath, `${p.url} has no matchedPath`).toBeTruthy();
      }
    }
  });

  it('records the RoutePermissionGuard subtrees, and they are a minority', () => {
    // This is a real finding the lens surfaces: most modules gate the sidebar
    // link but not the page, so typing the URL still opens the screen. The test
    // pins the fact, not a target — if someone wraps more subtrees the numbers
    // move and this still passes.
    expect(PAGE_ACCESS_MAP.guardedPrefixes.length).toBeGreaterThan(20);
    expect(PAGE_ACCESS_MAP.guardedPrefixes).toContain('/hr');
    expect(PAGE_ACCESS_MAP.guardedPrefixes).toContain('/users');

    const enforced = PAGE_ACCESS_MAP.pages.filter((p) => p.gate.enforcedByLayout).length;
    expect(enforced).toBeGreaterThan(0);
    expect(enforced).toBeLessThan(PAGE_ACCESS_MAP.pages.length);
  });

  it('buckets pages under the permission-key module the picker groups by', () => {
    expect(pageFor('/hr/leave/requests').moduleKey).toBe('hr');
    expect(pageFor('/hr/leave/approvals').moduleKey).toBe('hr');
    expect(pageFor('/organizations/institutions').moduleKey).toBe('organizations');

    // Every page lands somewhere — a nameless bucket would hide pages from the
    // only surface that lists them.
    for (const p of PAGE_ACCESS_MAP.pages) {
      expect(p.moduleKey, `${p.url} has no moduleKey`).toBeTruthy();
    }
  });
});

describe('page access map — the Approvals tab (the case this was built for)', () => {
  it('emits the Approvals tab with its RPC gate and the key that gate mirrors', () => {
    const page = pageFor('/hr/leave/requests');
    const approvals = page.tabs.find((t) => t.href === '/hr/leave/approvals');

    expect(approvals, 'Time Off should expose an Approvals tab').toBeDefined();
    expect(approvals!.kind).toBe('route');
    expect(approvals!.label).toBe('Approvals');

    // The whole point: this tab has NO permission key in its own file. Without
    // the gate hook being captured, every key-centric view reports it as
    // ungated while production shows it to five roles.
    expect(approvals!.gateHook).not.toBeNull();
    expect(approvals!.gateHook!.hook).toBe('useCanApproveLeave');
    expect(approvals!.gateHook!.file).toContain('time-off-tabs.tsx');

    expect(NON_KEY_GATES.useCanApproveLeave.mirrors).toBe('hr.leave.approve');
  });

  it('keeps the other Time Off tabs, and does not invent gates for them', () => {
    const hrefs = pageFor('/hr/leave/requests')
      .tabs.filter((t) => t.kind === 'route')
      .map((t) => t.href);

    expect(hrefs).toContain('/hr/leave/requests');
    expect(hrefs).toContain('/hr/leave/compensatory-off');
    expect(hrefs).toContain('/hr/leave/short-time-off');

    const compOff = pageFor('/hr/leave/requests').tabs.find(
      (t) => t.href === '/hr/leave/compensatory-off'
    );
    expect(compOff!.gateHook).toBeNull();
  });
});

describe('page access map — control extraction', () => {
  it('finds the row actions, column and toolbar gates on a standard CRUD page', () => {
    const { actions } = pageFor('/organizations/institutions');
    const find = (verb: string, surface: string) =>
      actions.find((a) => a.verb === verb && a.surface === surface);

    const view = find('view', 'row-action');
    const edit = find('edit', 'row-action');
    const del = find('delete', 'row-action');
    const create = find('create', 'toolbar');

    expect(view?.permissionKey).toBe('organizations.institutions.view');
    expect(edit?.permissionKey).toBe('organizations.institutions.edit');
    expect(del?.permissionKey).toBe('organizations.institutions.delete');
    expect(create?.permissionKey).toBe('organizations.institutions.create');

    // Provenance is what lets an auditor judge an over-attributed shared
    // component, so it must never be blank.
    for (const a of actions) {
      expect(a.file, `${a.permissionKey} has no declaring file`).toBeTruthy();
    }
  });

  it('extracts a meaningful number of gated controls overall', () => {
    const total = PAGE_ACCESS_MAP.pages.reduce((n, p) => n + p.actions.length, 0);
    expect(total).toBeGreaterThan(500);

    // Every extracted key must be a real dotted key, never a half-parsed
    // fragment — a regex that starts matching junk shows up here first.
    for (const p of PAGE_ACCESS_MAP.pages) {
      for (const a of p.actions) {
        expect(a.permissionKey, `${p.url}: "${a.permissionKey}"`).toMatch(
          /^[a-z0-9_-]+(\.[a-z0-9_.-]+)+$/i
        );
      }
    }
  });

  it('captures gate hooks precisely rather than sweeping up data hooks', () => {
    const hooks = new Set<string>();
    for (const p of PAGE_ACCESS_MAP.pages) {
      for (const g of p.gateHooks) hooks.add(g.hook);
      for (const t of p.tabs) if (t.gateHook) hooks.add(t.gateHook.hook);
    }

    // The heuristic is use(Can|Is|Has)X, narrowed by an explicit deny-list.
    // If that filter regresses, useCandidates / useCancelReservation and
    // friends flood the lens with phantom "code-gated" badges.
    expect(hooks.size).toBeLessThan(40);
    expect(hooks).toContain('useCanApproveLeave');
    for (const h of hooks) {
      expect(isNonGateHook(h), `${h} should have been filtered out`).toBe(false);
    }
  });
});

describe('resolvePageGate — the shared rule', () => {
  it('agrees with the stored gate for every page in the map', () => {
    // The generator and the API compute gates through this one function. If
    // they ever disagree, a tab's gate and its own page row would contradict
    // each other on screen.
    for (const p of PAGE_ACCESS_MAP.pages) {
      expect(resolvePageGate(p.url, PAGE_ACCESS_MAP.guardedPrefixes), p.url).toEqual(p.gate);
    }
  });

  it('marks sentinel values as sentinels rather than as grantable keys', () => {
    const sentinelPages = PAGE_ACCESS_MAP.pages.filter((p) => p.gate.isSentinel);
    expect(sentinelPages.length).toBeGreaterThan(0);
    for (const p of sentinelPages) {
      expect(['super_admin', 'view_dashboard', 'view_profile']).toContain(p.gate.permission);
    }
  });
});

describe('getPermissionValue — value, never key presence', () => {
  it('reads both the flat-dotted and the nested JSONB shapes', () => {
    expect(getPermissionValue({ 'hr.leave.approve': true }, 'hr.leave.approve')).toBe(true);
    expect(getPermissionValue({ hr: { leave: { approve: true } } }, 'hr.leave.approve')).toBe(
      true
    );
  });

  it('treats an explicit false as a denial, not as a grant', () => {
    // Revocation stores `false` rather than removing the key: 63 roles CONTAIN
    // hr.leave.approve while only 5 hold it. `permissions ? 'key'` would report
    // all 63.
    expect(getPermissionValue({ 'hr.leave.approve': false }, 'hr.leave.approve')).toBe(false);
    expect(getPermissionValue({ hr: { leave: { approve: false } } }, 'hr.leave.approve')).toBe(
      false
    );
    expect(getPermissionValue({}, 'hr.leave.approve')).toBe(false);
    expect(getPermissionValue(null, 'hr.leave.approve')).toBe(false);
  });
});

describe('non-key gate catalogue', () => {
  it('only claims a mirrored key where the predicate was verified', () => {
    for (const [hook, def] of Object.entries(NON_KEY_GATES)) {
      expect(def.note.length, `${hook} needs a usable note`).toBeGreaterThan(40);
      if (def.mirrors) {
        // A claimed mirror must be a real dotted permission key and the note
        // must say where it was read from, or the lens is asserting a role list
        // nobody can check.
        expect(def.mirrors).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/);
        expect(def.note).toMatch(/Verified in|supabase\/migrations/);
      }
    }
  });

  it('filters data hooks that merely match the gate-hook shape', () => {
    expect(isNonGateHook('useCandidates')).toBe(true);
    expect(isNonGateHook('useCancelReservation')).toBe(true);
    expect(isNonGateHook('useCanApproveLeave')).toBe(false);
    expect(isNonGateHook('useIsCdcHead')).toBe(false);
  });
});
