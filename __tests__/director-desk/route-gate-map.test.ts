// ============================================================================
// The generated route -> real-gate map, and the drift guard over it.
//
// components/director-desk/route-gate-map.generated.ts is what stops the
// hand-over control writing a key the page's own gate never reads (defect C2).
// It is generated, so the failure mode is not "it is wrong" but "it went stale":
// someone adds a SuperAdminOnly wrapper to a page, nobody regenerates, and the
// Director gets a green "Handed over" screen for a page the receiver cannot
// open. Same class of silence as the merge-order defect next door.
//
// So this file re-runs the scanner IN MEMORY against the live app/(routes) tree
// and compares byte-for-byte with what is committed. It reads the real pages,
// not a fixture — a fixture would prove the scanner agrees with a map I wrote
// (feedback_a_test_can_encode_your_own_misunderstanding).
//
// Regenerate with:  node scripts/director-desk/scan-route-gates.mjs
// ============================================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  scanRouteGates,
  renderModule,
  gatesInSource,
} from '../../scripts/director-desk/scan-route-gates.mjs';

import { ROUTE_GATE_MAP } from '@/components/director-desk/route-gate-map.generated';

const GENERATED_FILE = path.join(
  process.cwd(),
  'components',
  'director-desk',
  'route-gate-map.generated.ts'
);

/**
 * scanRouteGates() walks the whole of app/(routes) off disk — 1,142 pages and
 * climbing — so this one test is IO-bound in a way none of its neighbours are.
 * Vitest's default per-test budget is 5s, which it fits inside comfortably on an
 * idle machine (~1.8s measured) and does NOT fit inside on a busy one (~7.9s
 * measured at load average 35, with four concurrent `tsc --noEmit` runs from
 * sibling sessions on the same laptop).
 *
 * That produced the worst kind of red: a drift guard reporting
 *
 *     Error: Test timed out in 5000ms
 *
 * while the artifact it guards was provably correct — regenerating gave a
 * zero-byte diff. The failure said nothing about drift and everything about how
 * busy the machine was, and it is the assertion BELOW, not the clock, that this
 * test exists to make.
 *
 * 30s is deliberately far above the honest worst case rather than a whisker
 * above it: the point is to stop the timeout ever being the thing that speaks.
 * A scan that genuinely hangs still fails here, six times slower than the
 * slowest real reading on record.
 *
 * This matters more than it looks. Nothing globs __tests__/director-desk/ today,
 * so this file runs only where someone types it. PR #2988 ("actually run the
 * test suites that no workflow executes") turns it into a blocking check — at
 * which point a load-sensitive timeout becomes a gate that fails on how busy a
 * CI runner happens to be.
 */
const SCAN_TIMEOUT_MS = 30_000;

describe('route-gate-map.generated.ts is in step with app/(routes)', () => {
  it(
    'matches a fresh scan exactly',
    () => {
      const fresh = renderModule(scanRouteGates());
      const committed = readFileSync(GENERATED_FILE, 'utf8');
      expect(
        committed,
        'route-gate-map.generated.ts is stale. Run: node scripts/director-desk/scan-route-gates.mjs'
      ).toBe(fresh);
    },
    SCAN_TIMEOUT_MS
  );

  it('is not empty (a scanner that finds nothing would pass the check above)', () => {
    const routes = Object.keys(ROUTE_GATE_MAP);
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.filter((r) => ROUTE_GATE_MAP[r].blocked).length).toBeGreaterThan(80);
    expect(routes.filter((r) => ROUTE_GATE_MAP[r].keys?.length).length).toBeGreaterThan(200);
  });
});

describe('the scanner reads gates, not prose', () => {
  it('ignores a gate named only in a comment', () => {
    // Real shape from app/(routes)/rcltp/page.tsx, which explains in prose that
    // its destination pages use <SuperAdminOnly> and mounts no gate itself.
    const src = [
      '// The policies page uses <SuperAdminOnly> (writes platform_policies rows).',
      '/* <PermissionGuard module="x" action="view"> */',
      'export default function Page() {',
      '  return <div>hi</div>;',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([]);
  });

  it('ignores a gate named only inside a string', () => {
    const src = [
      'export default function Page() {',
      '  const help = "wrap it in <SuperAdminOnly> if you must";',
      '  return <div>{help}</div>;',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([]);
  });

  it('takes the page-level guard and ignores a deeper button-level one', () => {
    // Unioning the Delete button's key in would hand the receiver a delete
    // permission the Director never chose.
    const src = [
      'export default function Page() {',
      '  return (',
      '    <PermissionGuard module="academic.batches" action="view">',
      '      <div>',
      '        <PermissionGuard module="academic.batches" action="delete">',
      '          <DeleteButton />',
      '        </PermissionGuard>',
      '      </div>',
      '    </PermissionGuard>',
      '  );',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([{ kind: 'permission', keys: ['academic.batches.view'] }]);
  });

  it('does not read attributes out of a nested fallback element', () => {
    const src = [
      'export default function Page() {',
      '  return (',
      '    <PermissionGuard',
      '      module="hr.leave"',
      '      action="approve"',
      '      fallback={<Denied module="something.else" action="view" />}',
      '    >',
      '      <Body />',
      '    </PermissionGuard>',
      '  );',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([{ kind: 'permission', keys: ['hr.leave.approve'] }]);
  });

  it('marks a guard whose module/action cannot be read statically as unreadable', () => {
    // Fail closed. A gate we cannot read is a gate we cannot promise a handover
    // satisfies, and a wrong promise here ends in an access-denied panel.
    const src = [
      'export default function Page() {',
      '  return (',
      '    <PermissionGuard module={mod} action={act}>',
      '      <Body />',
      '    </PermissionGuard>',
      '  );',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([{ kind: 'unreadable' }]);
  });

  it('resolves PolicyPageShell through its own prop rules', () => {
    const keyed = [
      'export default function Page() {',
      '  return <PolicyPageShell title="X" permissionKey="hr.policies.view"><Body /></PolicyPageShell>;',
      '}',
    ].join('\n');
    expect(gatesInSource(keyed)).toEqual([
      { kind: 'permission', keys: ['hr.policies.view'] },
    ]);

    const superOnly = [
      'export default function Page() {',
      '  return <PolicyPageShell title="X" permission="super_admin"><Body /></PolicyPageShell>;',
      '}',
    ].join('\n');
    expect(gatesInSource(superOnly)).toEqual([{ kind: 'superAdmin' }]);

    const bare = [
      'export default function Page() {',
      '  return <PolicyPageShell title="X"><Body /></PolicyPageShell>;',
      '}',
    ].join('\n');
    expect(gatesInSource(bare)).toEqual([{ kind: 'adminRole' }]);
  });

  it('reads anyAction as "the first action is enough"', () => {
    const src = [
      'export default function Page() {',
      '  return (',
      '    <PermissionGuard module="billing" action={["view", "edit"]} anyAction={true}>',
      '      <Body />',
      '    </PermissionGuard>',
      '  );',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([{ kind: 'permission', keys: ['billing.view'] }]);
  });

  it('requires every action when anyAction is absent', () => {
    const src = [
      'export default function Page() {',
      '  return (',
      '    <PermissionGuard module="billing" action={["view", "edit"]}>',
      '      <Body />',
      '    </PermissionGuard>',
      '  );',
      '}',
    ].join('\n');
    expect(gatesInSource(src)).toEqual([
      { kind: 'permission', keys: ['billing.view', 'billing.edit'] },
    ]);
  });
});
