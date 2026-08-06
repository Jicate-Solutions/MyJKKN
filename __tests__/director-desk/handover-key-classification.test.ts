/**
 * THE TRIPWIRE FOR A DENYLIST THAT DEFAULTS OPEN.
 *
 * `fn_handover_key_is_blocked` ends in `ELSE false`. Every permission key that
 * matches none of its clauses is HANDABLE — so a key invented by a future PR is
 * handable by default, and nothing in code review is guaranteed to notice. That
 * is the correct default (an allowlist would break the feature every time a
 * module ships) but it needs something that fails loudly.
 *
 * This is that something. It asserts that every key in the UNION of
 * lib/constants/permissions.ts and MENU_PERMISSIONS is explicitly classified in
 * specs/director-desk/handover-key-classification.json, and that each key's
 * recorded classification still matches what the SQL walls actually say.
 *
 * ⚠️  THE UNION IS THE FIX. The first version of this test iterated
 * PERMISSION_CATEGORIES alone, reported "105 walled / 1,224 handable, zero
 * disagreements", and was validating THE WRONG KEY UNIVERSE. A handover does not
 * store keys from permissions.ts — it stores the MENU_PERMISSIONS value of the
 * route the Director was standing on, and TWENTY of those values are absent from
 * permissions.ts. All twenty were unclassified and therefore handable by default.
 * One of them was the literal string `super_admin`, which is not a permission at
 * all: it marks fourteen admin routes, and lib/navigation/permission-filter.ts
 * ended in a bare `return !!permissions[permission]`, so handing over the ID-card
 * printing policy page delegated /admin/ai-models (AI provider selection and
 * spend caps), /admin/loops, /admin/proof-disputes, /ai-query/admin and ten more.
 *
 * A cross-check can be internally flawless and still be pointed at the wrong set.
 * The manifest below therefore records `menuOnly` as its own list, so the twenty
 * are visible in the diff and a twenty-first cannot arrive quietly.
 *
 * Add a permission key → this test fails until you classify it. Map a route to a
 * new MENU_PERMISSIONS value → same. Widen or narrow a wall → this test fails
 * until you re-record which keys moved. Either way a human has to look at the
 * list of keys that changed side, which is the entire point.
 *
 * The classification is NOT re-derived from a TypeScript copy of the wall rules.
 * `handover-wall-eval.ts` parses and evaluates the real CASE expression out of
 * the migration file. A test that restates the rules would only prove the author
 * agreed with themselves twice — this repo has already shipped 40 green
 * assertions over a live bug that way.
 *
 * TO UPDATE after a deliberate change:
 *   UPDATE_HANDOVER_CLASSIFICATION=1 npx vitest run __tests__/director-desk
 * then READ the diff on the JSON before committing it. Regenerating without
 * reading it converts this gate back into decoration.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import { MENU_PERMISSIONS } from '@/lib/sidebarMenuLink';
import { isSentinelPermission } from '@/lib/navigation/permission-filter';
import { loadWalls, isBlocked, WALL_MIGRATION } from './handover-wall-eval';

const MANIFEST = 'specs/director-desk/handover-key-classification.json';

type Manifest = {
  walled: string[];
  handable: string[];
  /** Values that gate a route but are absent from lib/constants/permissions.ts. */
  menuOnly: string[];
};

/** Every key Role Management can enumerate. */
function permissionsFileKeys(): string[] {
  const keys: string[] = [];
  for (const category of PERMISSION_CATEGORIES as ReadonlyArray<{
    permissions?: ReadonlyArray<{ key: string }>;
  }>) {
    for (const p of category.permissions ?? []) {
      if (typeof p?.key === 'string' && p.key) keys.push(p.key);
    }
  }
  return [...new Set(keys)].sort();
}

/**
 * Every distinct value in MENU_PERMISSIONS.
 *
 * Imported from the module rather than parsed out of the file, so concatenated
 * entries (`'aiPulse:' + 'lab.score'`) and any future computed value are the
 * evaluated string a handover would actually store. A regex over the source text
 * reads that one entry as `aiPulse:` and invents a key that does not exist.
 */
function menuPermissionValues(): string[] {
  return [
    ...new Set(
      Object.values(MENU_PERMISSIONS as Record<string, string>).filter(
        (v): v is string => typeof v === 'string' && v.length > 0
      )
    )
  ].sort();
}

const walls = loadWalls();
const permKeys = permissionsFileKeys();
const menuValues = menuPermissionValues();

/**
 * THE KEY UNIVERSE A HANDOVER CAN ACTUALLY CONTAIN.
 * `fn_director_handover_create` takes whatever the capture control resolved from
 * MENU_PERMISSIONS for the route the Director was on. That is not a subset of
 * permissions.ts — it overlaps it. Classifying only one side leaves the other
 * side on the `ELSE false` default.
 */
const keys = [...new Set([...permKeys, ...menuValues])].sort();

/** MENU_PERMISSIONS values that Role Management cannot even enumerate. */
const menuOnly = menuValues.filter((v) => !permKeys.includes(v)).sort();

// Regeneration path. Runs before the assertions so a deliberate update is one
// command, and is inert in CI (the env var is never set there).
if (process.env.UPDATE_HANDOVER_CLASSIFICATION === '1') {
  const next: Manifest = {
    menuOnly,
    walled: keys.filter((k) => isBlocked(k, walls)),
    handable: keys.filter((k) => !isBlocked(k, walls))
  };
  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        $comment:
          'Generated by __tests__/director-desk/handover-key-classification.test.ts. ' +
          'The UNION of every permission key in lib/constants/permissions.ts and every ' +
          'distinct value in MENU_PERMISSIONS — the set a handover can actually store — ' +
          'classified against the walls in ' +
          WALL_MIGRATION +
          '. `menuOnly` is the subset that gates a route but is absent from permissions.ts; ' +
          'those are the ones the first version of this gate never looked at. ' +
          'Regenerate with UPDATE_HANDOVER_CLASSIFICATION=1 npx vitest run __tests__/director-desk — ' +
          'then read the diff. A key moving from walled to handable is a security change.',
        ...next
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

describe('Director handover — every permission key is explicitly classified', () => {
  it('the wall function is still parseable (if this fails, nothing below means anything)', () => {
    expect(walls.clauses.length).toBeGreaterThan(10);
    // The denylist defaults OPEN. If this ever flips to a default-deny the whole
    // premise of this test changes and it should be rewritten, not adjusted.
    expect(walls.fallback).toBe(false);
  });

  it('has a classification manifest', () => {
    expect(
      existsSync(MANIFEST),
      `${MANIFEST} is missing. Generate it with:\n  UPDATE_HANDOVER_CLASSIFICATION=1 npx vitest run __tests__/director-desk`
    ).toBe(true);
  });

  it('validates the key universe a handover can actually contain, not just permissions.ts', () => {
    // The bug this assertion exists for: the previous version of this file
    // iterated permissions.ts only, so 20 MENU_PERMISSIONS values were never
    // classified and fell through `ELSE false` to handable. If the union ever
    // stops being wider than permissions.ts, either MENU_PERMISSIONS stopped
    // being read or the import broke — and this gate is back to validating the
    // wrong set, silently.
    expect(menuValues.length, 'MENU_PERMISSIONS produced no values').toBeGreaterThan(100);
    expect(keys.length).toBeGreaterThan(permKeys.length);
    expect(menuOnly.length, 'menu-only values must be enumerated, not assumed away').toBeGreaterThan(
      0
    );
  });

  it('records the menu-only values explicitly, so a new one cannot arrive quietly', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    expect(
      manifest.menuOnly ?? [],
      [
        'MENU_PERMISSIONS gained or lost a value that lib/constants/permissions.ts does not carry.',
        'These gate real routes and a handover can store them, but Role Management cannot',
        'enumerate them, so nobody reviews them by accident. Decide each one on purpose,',
        'then regenerate with UPDATE_HANDOVER_CLASSIFICATION=1.'
      ].join('\n')
    ).toEqual(menuOnly);
  });

  it('walls every sentinel the client filter refuses — the two layers must agree', () => {
    // lib/navigation/permission-filter.ts returns false for these regardless of
    // the merged permission map. If SQL let one be handed over while the client
    // refused it, the Director would create a handover that silently grants
    // nothing — and the reverse would be a live privilege escalation.
    const clientSentinels = keys.filter((k) => isSentinelPermission(k));
    expect(clientSentinels.length, 'no sentinels found — the import is wrong').toBeGreaterThan(0);
    for (const key of clientSentinels) {
      expect(isBlocked(key, walls), `${key} is a client sentinel but SQL leaves it handable`).toBe(
        true
      );
    }
  });

  it('classifies every key in the union — no key is left to the default', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    const classified = new Set([...manifest.walled, ...manifest.handable]);
    const unclassified = keys.filter((k) => !classified.has(k));

    expect(
      unclassified,
      unclassified.length === 0
        ? ''
        : [
            `${unclassified.length} permission key(s) are not classified against the handover walls.`,
            '',
            'These keys are HANDABLE right now, because fn_handover_key_is_blocked ends in',
            'ELSE false. Decide that on purpose:',
            '  - if the key must never be delegated, add it to a wall in',
            `    ${WALL_MIGRATION};`,
            '  - if it is fine to delegate, record it by running',
            '    UPDATE_HANDOVER_CLASSIFICATION=1 npx vitest run __tests__/director-desk',
            '',
            unclassified.map((k) => `  • ${k}`).join('\n')
          ].join('\n')
    ).toEqual([]);
  });

  it('every recorded classification still matches what the SQL walls say', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    const walledInManifest = new Set(manifest.walled);

    const drifted = keys
      .filter((k) => walledInManifest.has(k) !== isBlocked(k, walls))
      .map((k) =>
        walledInManifest.has(k)
          ? `  • ${k}  — recorded WALLED, the SQL now lets it through`
          : `  • ${k}  — recorded HANDABLE, the SQL now blocks it`
      );

    expect(
      drifted,
      drifted.length === 0
        ? ''
        : [
            'The walls moved. Every line below is a key that changed side:',
            '',
            ...drifted,
            '',
            'A key going from walled to handable widens what the Director may delegate.',
            'If that is intended, regenerate the manifest and say so in the PR body.'
          ].join('\n')
    ).toEqual([]);
  });

  it('carries no stale keys (a permission that no longer exists must leave the manifest)', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
    const live = new Set(keys);
    const stale = [...manifest.walled, ...manifest.handable].filter((k) => !live.has(k));
    expect(stale).toEqual([]);
  });
});

describe('Director handover — walls that must hold regardless of the manifest', () => {
  // Hard-coded on purpose. Regenerating the manifest can bless anything; these
  // cannot be regenerated away. Each one is a decision from the Director
  // interview, not an implementation detail.
  const MUST_BE_WALLED = [
    // Wall 1a — SENTINELS. Not permissions; markers the nav filter reads
    // structurally. `super_admin` gates 14 admin routes, so ONE handover of the
    // ID-card printing policy page used to open all of them.
    'super_admin',
    'view_dashboard',
    'view_profile',
    // Wall 1b — keys that AUTHORISE A ROLE WRITE. The role outlives the
    // handover, which is decision 4 broken at its root. Derived from the SQL by
    // role-write-sweep.test.ts, repeated here so regeneration cannot bless them.
    'organizations.leadership.manage',
    'admission.counselors.create',
    // Wall 1 — access control. Every one of these outlives the handover.
    'roles',
    'roles.view',
    'roles.assign',
    'users',
    'users.create',
    'users.edit',
    'users.permissions_audit.view',
    'settings',
    'settings.general.edit',
    'director.handover',
    'director.handover.create',
    'some_module.user_roles.manage',
    'some_module.role.assign',
    // Wall 2 — salary and team-member files.
    'hr.payroll',
    'hr.payroll.view',
    'hr.employees.edit',
    'staff.status_update',
    // Wall 3 — exam marks, both spellings that exist in production.
    'academic.internal-marks.view',
    'academic.internal_marks.edit',
    'academic.course-grades.view',
    // Wall 4 — money movement.
    'billing',
    'billing.payments.create',
    'admission_fees',
    'admission_fees.waive',
    'campus_living.deposits.refund'
  ];

  const MUST_BE_HANDABLE = [
    // The key this entire feature exists for.
    'accreditation.naac.narrative.manage',
    // Verb collision: this is marking ATTENDANCE, not exam marks.
    'academic.attendance.mark',
    // Money REPORTS stay handable — an explicit Director decision.
    'billing.analytics.view',
    'billing.coverage.view',
    'billing.invoices.export',
    'admission_fees.view',
    'admission_fees.read',
    'admission_fees.export',
    // Routine delegated work, deliberately outside wall 2.
    'hr.leave.approve',
    'hr.attendance.view'
  ];

  it.each(MUST_BE_WALLED)('walls %s', (key) => {
    expect(isBlocked(key, walls)).toBe(true);
  });

  it.each(MUST_BE_HANDABLE)('leaves %s handable', (key) => {
    expect(isBlocked(key, walls)).toBe(false);
  });

  it('walls the bare prefix key, not just the dotted children', () => {
    // `LIKE 'prefix.%'` does not match `prefix`. Every wall is written as
    // `p_key = 'prefix' OR p_key LIKE 'prefix.%'` for this reason, and this is
    // the assertion that keeps it that way.
    for (const bare of ['roles', 'users', 'settings', 'billing', 'hr.payroll']) {
      expect(isBlocked(bare, walls), `bare prefix "${bare}" slipped through`).toBe(true);
    }
  });

  it('treats a null or empty key as walled', () => {
    expect(isBlocked(null, walls)).toBe(true);
    expect(isBlocked('', walls)).toBe(true);
  });
});
