import { describe, it, expect, vi } from 'vitest';
import { canSeeModule } from '@/lib/changelog/use-changelog';
import type { ChangelogModule } from '@/lib/changelog/types';

// use-changelog.ts is a client module. Importing it for the one pure function
// it exports would otherwise drag in usePermissions -> @tanstack/react-query ->
// the Supabase browser client, which reads NEXT_PUBLIC_* at import time and has
// no values on a CI runner. vi.mock is hoisted above the import above, so the
// real hook never loads and canSeeModule() is tested as what it is: a pure
// predicate.
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ permissions: {}, isSuperAdmin: false, isLoading: false }),
}));

/** Minimal module record; only `perm` matters to the gate. */
const mod = (perm: ChangelogModule['perm']): ChangelogModule => ({
  label: 'Test Module',
  perm,
  href: null,
});

describe('canSeeModule — namespace matching', () => {
  it('grants on a sub-permission inside the namespace', () => {
    // The whole reason perm is a namespace: Billing has ~20 sub-permissions and
    // no `billing.view`, so holding any one of them must open Billing news.
    expect(canSeeModule(mod('billing'), { 'billing.receipts.view': true }, false)).toBe(true);
    expect(canSeeModule(mod('billing'), { 'billing.invoices.create': true }, false)).toBe(true);
  });

  it('grants on an exact namespace key with no dot', () => {
    expect(canSeeModule(mod('billing'), { billing: true }, false)).toBe(true);
  });

  it('does NOT grant on a namespace that merely starts with the same letters', () => {
    // The boundary is the dot. Without it, `billing` would match
    // `billing_reports.*` and `billingsomething.*` and leak Billing news to
    // whoever holds an unrelated permission with a similar prefix.
    expect(canSeeModule(mod('billing'), { 'billingsomething.view': true }, false)).toBe(false);
    expect(canSeeModule(mod('billing'), { 'billing_reports.view': true }, false)).toBe(false);
    expect(canSeeModule(mod('billing'), { 'billings.view': true }, false)).toBe(false);
  });

  it('does not treat a namespace as a suffix or a substring match', () => {
    expect(canSeeModule(mod('billing'), { 'admin.billing.view': true }, false)).toBe(false);
    expect(canSeeModule(mod('hr'), { 'chr.view': true }, false)).toBe(false);
  });

  it('does not grant from an unrelated namespace', () => {
    expect(canSeeModule(mod('billing'), { 'academic.attendance.mark': true }, false)).toBe(false);
  });

  it('does not grant on an empty permission map', () => {
    expect(canSeeModule(mod('billing'), {}, false)).toBe(false);
  });
});

describe('canSeeModule — a permission present but FALSE', () => {
  it('does not grant when the only matching key is denied', () => {
    // usePermissions returns the full map with false values, not just the
    // granted keys. Reading key presence instead of the value would show every
    // module to everyone.
    expect(canSeeModule(mod('billing'), { 'billing.receipts.view': false }, false)).toBe(false);
    expect(canSeeModule(mod('billing'), { billing: false }, false)).toBe(false);
  });

  it('still grants when a different key in the namespace is true', () => {
    expect(
      canSeeModule(
        mod('billing'),
        { 'billing.receipts.view': false, 'billing.invoices.view': true },
        false
      )
    ).toBe(true);
  });
});

describe('canSeeModule — array of namespaces', () => {
  const usersAndRoles = mod(['users', 'roles']);

  it('grants on any one of the listed namespaces', () => {
    expect(canSeeModule(usersAndRoles, { 'users.view': true }, false)).toBe(true);
    expect(canSeeModule(usersAndRoles, { 'roles.assign.edit': true }, false)).toBe(true);
  });

  it('applies the same dot boundary to every namespace in the list', () => {
    expect(canSeeModule(usersAndRoles, { 'usersomething.view': true }, false)).toBe(false);
    expect(canSeeModule(usersAndRoles, { 'rolesomething.view': true }, false)).toBe(false);
  });

  it('does not grant when none of the namespaces is held', () => {
    expect(canSeeModule(usersAndRoles, { 'organizations.view': true }, false)).toBe(false);
  });

  it('does not grant when the matching key is denied', () => {
    expect(canSeeModule(usersAndRoles, { 'roles.assign.edit': false }, false)).toBe(false);
  });
});

describe('canSeeModule — platform-wide modules (perm: null)', () => {
  it('is visible to a signed-in viewer holding nothing', () => {
    // Sign-in, navigation, mobile and speed changes concern everyone. This is
    // intended, not a hole.
    expect(canSeeModule(mod(null), {}, false)).toBe(true);
  });

  it('is visible even when every permission the viewer has is false', () => {
    expect(canSeeModule(mod(null), { 'billing.receipts.view': false }, false)).toBe(true);
  });
});

describe('canSeeModule — super admin', () => {
  it('sees a module it holds no permission for', () => {
    expect(canSeeModule(mod('billing'), {}, true)).toBe(true);
  });

  it('sees a module whose only matching permission is denied', () => {
    expect(canSeeModule(mod('billing'), { 'billing.receipts.view': false }, true)).toBe(true);
  });

  it('bypass is checked before the module exists — an unknown module is still visible', () => {
    // Documenting the order deliberately: the super-admin return precedes the
    // `!mod` guard, so a slug missing from meta.modules shows to a super admin
    // and hides from everyone else.
    expect(canSeeModule(undefined, {}, true)).toBe(true);
  });
});

describe('canSeeModule — unknown module', () => {
  it('hides an entry whose module slug is not in the dictionary', () => {
    // Fail closed: a generator change that emits a slug the meta dictionary
    // lacks must not spill that module's entries onto every screen.
    expect(canSeeModule(undefined, { 'billing.receipts.view': true }, false)).toBe(false);
  });
});
