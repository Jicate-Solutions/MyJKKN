#!/usr/bin/env tsx
/**
 * Generate Page Access Map
 * --------------------------------------------------------------------------
 * Walks app/(routes)/** and emits, for every page.tsx on disk, the permission
 * surface a user meets there: the route's own gate, its tabs, and the
 * permission-gated controls (row actions, toolbar buttons, columns) that the
 * page's component tree declares.
 *
 * Output: lib/permissions-audit/page-access-map.generated.ts
 *
 * WHY THIS IS A BUILD-TIME ARTEFACT
 *   The answer lives in .tsx source. A serverless route handler cannot read
 *   .tsx at runtime — the files are not deployed as source — so the extraction
 *   has to happen here, be committed, and be imported like any other module.
 *   Same contract as scripts/generate-route-manifest.ts: the build runs this
 *   and fails if the output differs from git, so a PR that adds a page or
 *   moves a permission gate must commit a fresh map.
 *
 * WHAT IT DOES **NOT** CLAIM
 *   This is static extraction, not evaluation. It records what the code SAYS
 *   gates a surface; it never says which role holds anything — that is
 *   resolved per request against custom_roles.permissions by
 *   app/api/users/permissions-audit/page-access/route.ts.
 *
 *   Where extraction cannot reach, the map says so rather than guessing:
 *     - `canAccess(module, action)` with variable arguments  → unresolvedGates
 *     - a gate hook wrapping an RPC (useCanApproveLeave, …)  → nonKeyGates,
 *       annotated from the curated lib/permissions-audit/non-key-gates.ts
 *   Under-reporting silently is the failure mode that matters on an audit
 *   screen, so every blind spot is emitted as data.
 *
 * ATTRIBUTION MODEL
 *   A page's gates are rarely in page.tsx — they live in its `_components/*`
 *   (columns.tsx, row-actions.tsx, …). So we build an import graph once over
 *   every scanned file and BFS it from each page.tsx, depth-capped. Every
 *   signal carries the file that declared it, because a shared component
 *   reached from two pages attributes to both and only the provenance tells
 *   an auditor whether that is real.
 *
 * Run via:
 *   npm run gen:page-access
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveTiers } from '../lib/navigation/tier-rendering';
import { ROUTE_MANIFEST, type RouteNode } from '../lib/navigation/route-manifest.generated';
import {
  getModuleForRoute,
  MODULE_TO_CATEGORY_KEY,
} from '../lib/permissions-audit/module-mappings';
import { isNonGateHook } from '../lib/permissions-audit/non-key-gates';
import { resolvePageGate } from '../lib/permissions-audit/page-gate';
import type {
  ControlSurface,
  GateHookRef,
  PageAccessEntry,
  StoredPageAction,
  StoredPageTab,
} from '../types/permissions-audit';

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, 'app', '(routes)');
const COMPONENTS_DIR = path.join(ROOT, 'components');
const OUT_PATH = path.join(
  ROOT,
  'lib',
  'permissions-audit',
  'page-access-map.generated.ts'
);

/** How far to follow imports out of a page before giving up. */
const MAX_IMPORT_DEPTH = 5;

// ─── Pass A: read every candidate file once ──────────────────────────────────

interface FileSignals {
  /** Repo-relative, forward-slashed. */
  rel: string;
  surface: ControlSurface;
  /** Resolved absolute paths of local imports worth following. */
  imports: string[];
  /** Permission keys this file gates a control on, with the verb. */
  keys: Array<{ key: string; verb: string }>;
  /** Radix <TabsTrigger> tabs declared here. */
  inPageTabs: Array<{ value: string; label: string }>;
  /** Link-based tabs declared here ({ label, href } literals in a tab bar). */
  routeTabs: Array<{ label: string; href: string; gateHook: string | null }>;
  /** Gate hooks (useCanX / useIsX / useHasX) referenced here. */
  gateHooks: string[];
  /** Gate expressions that could not be reduced to a key. */
  unresolved: string[];
}

function toRel(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function classifySurface(rel: string): ControlSurface {
  const base = rel.split('/').pop() ?? '';
  if (base === 'page.tsx') return 'page';
  if (/row-actions?\.tsx$/.test(base) || /-actions\.tsx$/.test(base)) return 'row-action';
  if (/columns?\.tsx$/.test(base)) return 'column';
  if (/data-table\.tsx$/.test(base) || /toolbar\.tsx$/.test(base)) return 'toolbar';
  if (/tabs?\.tsx$/.test(base) || /shell\.tsx$/.test(base)) return 'tab-bar';
  return 'component';
}

/**
 * Resolve an import specifier to a file we scanned, or null.
 *
 * Only `@/…` and relative specifiers are followed — a package import can never
 * declare one of this app's permission gates. `components/ui/` is dropped
 * deliberately: those are shadcn primitives, they gate nothing, and following
 * them would balloon every page's graph.
 */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else return null;

  const normalized = toRel(base);
  if (normalized.startsWith('components/ui/')) return null;

  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const PERMISSION_GUARD_RE = /<PermissionGuard\b([\s\S]{0,500}?)>/g;
const PROP_MODULE_RE = /\bmodule\s*=\s*['"]([^'"]+)['"]/;
const PROP_ACTION_STR_RE = /\baction\s*=\s*['"]([^'"]+)['"]/;
const PROP_ACTION_ARR_RE = /\baction\s*=\s*\{\s*\[([^\]]*)\]/;
const CAN_ACCESS_LITERAL_RE = /\bcanAccess\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
const CAN_ACCESS_ANY_RE = /\bcanAccess\(([^)]{0,120})\)/g;
const CAN_PERFORM_RE = /\bcanPerform(?:Any|All)\(\s*['"]([^'"]+)['"]\s*,\s*\[([^\]]*)\]/g;
const TABS_TRIGGER_RE = /<TabsTrigger\b([^>]*)>([\s\S]{0,300}?)<\/TabsTrigger>/g;
const TABS_VALUE_RE = /\bvalue\s*=\s*['"]([^'"]+)['"]/;
const GATE_HOOK_RE = /\buse(?:Can|Is|Has)[A-Z]\w*(?=\s*\()/g;
/** `{ label: 'X', href: '/y' }` in either property order. */
const TAB_OBJ_LABEL_FIRST_RE =
  /\{[^{}]{0,200}?\blabel:\s*['"]([^'"]+)['"][^{}]{0,200}?\bhref:\s*['"](\/[^'"]*)['"][^{}]{0,200}?\}/g;
const TAB_OBJ_HREF_FIRST_RE =
  /\{[^{}]{0,200}?\bhref:\s*['"](\/[^'"]*)['"][^{}]{0,200}?\blabel:\s*['"]([^'"]+)['"][^{}]{0,200}?\}/g;
/** `const APPROVALS_TAB = { … }` — a tab declared on its own, i.e. conditional. */
const SINGULAR_TAB_CONST_RE =
  /\bconst\s+([A-Z][A-Z0-9_]*(?:TAB|_TAB))\s*=\s*(\{[^{}]{0,300}?\})/g;
/** `canApprove ? [ …, APPROVALS_TAB ] : TOP_TABS` */
const TERNARY_TAB_RE = /\b(\w+)\s*\?\s*\[([^\]]{0,300})\]/g;
/** `const { data: canApprove } = useCanApproveLeave()` / `const x = useIsY()` */
const GATE_VAR_DESTRUCTURED_RE =
  /\bconst\s*\{[^}]*?\bdata\s*:\s*(\w+)[^}]*\}\s*=\s*(use(?:Can|Is|Has)[A-Z]\w*)\s*\(/g;
const GATE_VAR_PLAIN_RE = /\bconst\s+(\w+)\s*=\s*(use(?:Can|Is|Has)[A-Z]\w*)\s*\(/g;

/** Strip nested JSX tags and `{…}` expressions out of a tab's inner text. */
function cleanLabel(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Title-case a URL segment the way the route manifest does. */
function titleCase(seg: string): string {
  return seg
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function extractSignals(abs: string, source: string): FileSignals {
  const rel = toRel(abs);
  const surface = classifySurface(rel);
  const signals: FileSignals = {
    rel,
    surface,
    imports: [],
    keys: [],
    inPageTabs: [],
    routeTabs: [],
    gateHooks: [],
    unresolved: [],
  };

  // ── imports ──
  for (const m of source.matchAll(IMPORT_RE)) {
    const resolved = resolveImport(abs, m[1]);
    if (resolved) signals.imports.push(resolved);
  }

  // ── <PermissionGuard module action> ──
  for (const m of source.matchAll(PERMISSION_GUARD_RE)) {
    const props = m[1];
    const mod = PROP_MODULE_RE.exec(props)?.[1];
    if (!mod) {
      signals.unresolved.push('<PermissionGuard> with a non-literal module');
      continue;
    }
    const single = PROP_ACTION_STR_RE.exec(props)?.[1];
    const arr = PROP_ACTION_ARR_RE.exec(props)?.[1];
    const actions = single
      ? [single]
      : arr
        ? Array.from(arr.matchAll(/['"]([^'"]+)['"]/g)).map((a) => a[1])
        : [];
    if (actions.length === 0) {
      signals.unresolved.push(`<PermissionGuard module="${mod}"> with a non-literal action`);
      continue;
    }
    for (const action of actions) {
      signals.keys.push({ key: `${mod}.${action}`, verb: action });
    }
  }

  // ── canAccess('module','action') ──
  const literalCanAccess = new Set<string>();
  for (const m of source.matchAll(CAN_ACCESS_LITERAL_RE)) {
    literalCanAccess.add(m[0]);
    signals.keys.push({ key: `${m[1]}.${m[2]}`, verb: m[2] });
  }
  for (const m of source.matchAll(CAN_ACCESS_ANY_RE)) {
    if (literalCanAccess.has(m[0])) continue;
    const args = m[1].trim();
    if (!args) continue; // `canAccess(` destructure sites, not calls
    signals.unresolved.push(`canAccess(${args.replace(/\s+/g, ' ')})`);
  }

  // ── canPerformAny/All('module', ['a','b']) ──
  for (const m of source.matchAll(CAN_PERFORM_RE)) {
    for (const a of m[2].matchAll(/['"]([^'"]+)['"]/g)) {
      signals.keys.push({ key: `${m[1]}.${a[1]}`, verb: a[1] });
    }
  }

  // ── Radix <TabsTrigger> ──
  for (const m of source.matchAll(TABS_TRIGGER_RE)) {
    const value = TABS_VALUE_RE.exec(m[1])?.[1];
    if (!value) continue;
    const label = cleanLabel(m[2]) || titleCase(value);
    signals.inPageTabs.push({ value, label });
  }

  // ── link-based tabs, only in files that are actually tab bars ──
  if (surface === 'tab-bar') {
    const found = new Map<string, string>(); // href -> label
    for (const m of source.matchAll(TAB_OBJ_LABEL_FIRST_RE)) found.set(m[2], m[1]);
    for (const m of source.matchAll(TAB_OBJ_HREF_FIRST_RE)) {
      if (!found.has(m[1])) found.set(m[1], m[2]);
    }

    // Which of them are conditionally appended, and on what?
    const gateVarToHook = new Map<string, string>();
    for (const m of source.matchAll(GATE_VAR_DESTRUCTURED_RE)) gateVarToHook.set(m[1], m[2]);
    for (const m of source.matchAll(GATE_VAR_PLAIN_RE)) {
      if (!gateVarToHook.has(m[1])) gateVarToHook.set(m[1], m[2]);
    }

    const constToHref = new Map<string, string>();
    for (const m of source.matchAll(SINGULAR_TAB_CONST_RE)) {
      const href = /\bhref:\s*['"](\/[^'"]*)['"]/.exec(m[2])?.[1];
      if (href) constToHref.set(m[1], href);
    }

    const hrefToGateHook = new Map<string, string>();
    for (const m of source.matchAll(TERNARY_TAB_RE)) {
      const hook = gateVarToHook.get(m[1]);
      if (!hook) continue;
      for (const [constName, href] of constToHref) {
        if (new RegExp(`\\b${constName}\\b`).test(m[2])) hrefToGateHook.set(href, hook);
      }
    }

    for (const [href, label] of found) {
      signals.routeTabs.push({ label, href, gateHook: hrefToGateHook.get(href) ?? null });
    }
  }

  // ── gate hooks ──
  const hooks = new Set<string>();
  for (const m of source.matchAll(GATE_HOOK_RE)) {
    if (!isNonGateHook(m[0])) hooks.add(m[0]);
  }
  signals.gateHooks = Array.from(hooks);

  return signals;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const p = path.join(dir, entry);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (toRel(p).startsWith('components/ui')) continue;
      walkFiles(p, out);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

// ─── Pass B: enumerate page URLs ─────────────────────────────────────────────

/**
 * Same segment rules as scripts/generate-route-manifest.ts — `(group)` folders
 * contribute nothing to the URL, `_private` folders are skipped, `[id]` stays
 * as a placeholder. Kept in step deliberately: a URL this map calls
 * `/hr/leave/[id]` must be the URL routeMatcher and the manifest call it too.
 */
function enumeratePages(
  dir: string,
  url: string,
  out: Array<{ url: string; file: string }> = []
): Array<{ url: string; file: string }> {
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) {
      const seg = /^\(.+\)$/.test(entry) ? '' : `/${entry}`;
      enumeratePages(p, url + seg, out);
    } else if (entry === 'page.tsx') {
      out.push({ url: url || '/', file: p });
    }
  }
  return out;
}

/** Directories whose layout.tsx wraps the subtree in <RoutePermissionGuard>. */
function collectGuardedPrefixes(
  dir: string,
  url: string,
  out: Set<string> = new Set()
): Set<string> {
  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith('_') || entry.startsWith('.')) continue;
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) {
      const seg = /^\(.+\)$/.test(entry) ? '' : `/${entry}`;
      collectGuardedPrefixes(p, url + seg, out);
    } else if (entry === 'layout.tsx') {
      if (fs.readFileSync(p, 'utf8').includes('RoutePermissionGuard')) {
        out.add(url || '/');
      }
    }
  }
  return out;
}

// ─── Manifest labels ─────────────────────────────────────────────────────────

function buildLabelMap(nodes: RouteNode[], map = new Map<string, string>()): Map<string, string> {
  for (const n of nodes) {
    map.set(n.path, n.label);
    buildLabelMap(n.children, map);
  }
  return map;
}

// ─── Gate resolution ─────────────────────────────────────────────────────────

/**
 * Which module bucket a page belongs to, in the SAME namespace the
 * Module → Roles picker uses (the first dot-segment of a permission key).
 *
 * Order matters. The resolved key is the truth when there is one: a page gated
 * on `hr.leave.apply` belongs under `hr` no matter where its URL sits. Only
 * sentinel and ungated routes fall through to the URL-prefix map, and then to
 * the first URL segment so nothing lands in a nameless bucket.
 */
function resolveModuleKey(url: string, gate: PageGate): string {
  if (gate.permission && !gate.isSentinel && gate.permission.includes('.')) {
    return gate.permission.split('.')[0];
  }
  const displayModule = getModuleForRoute(url);
  const category = displayModule ? MODULE_TO_CATEGORY_KEY[displayModule] : undefined;
  if (category) return category;
  const first = url.split('/').filter(Boolean)[0];
  return first ?? 'system';
}

function parentOf(url: string): string {
  const idx = url.lastIndexOf('/');
  return idx <= 0 ? '/' : url.slice(0, idx);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error(`Routes dir not found: ${ROUTES_DIR}`);
    process.exit(1);
  }

  // Pass A
  const files = [...walkFiles(ROUTES_DIR), ...walkFiles(COMPONENTS_DIR)];
  const signalsByFile = new Map<string, FileSignals>();
  for (const f of files) {
    try {
      signalsByFile.set(f, extractSignals(f, fs.readFileSync(f, 'utf8')));
    } catch (e) {
      console.warn(`[page-access] could not read ${toRel(f)}: ${String(e)}`);
    }
  }

  // Pass B + C prerequisites
  const pages = enumeratePages(ROUTES_DIR, '');
  const guardedPrefixes = collectGuardedPrefixes(ROUTES_DIR, '');
  const labels = buildLabelMap(ROUTE_MANIFEST);

  // Pass D: reachable-file set per page, memoized on the shared graph.
  const reachableCache = new Map<string, Set<string>>();
  function reachableFrom(start: string): Set<string> {
    const cached = reachableCache.get(start);
    if (cached) return cached;
    const seen = new Set<string>([start]);
    let frontier = [start];
    for (let depth = 0; depth < MAX_IMPORT_DEPTH && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const imp of signalsByFile.get(f)?.imports ?? []) {
          if (seen.has(imp)) continue;
          seen.add(imp);
          next.push(imp);
        }
      }
      frontier = next;
    }
    reachableCache.set(start, seen);
    return seen;
  }

  const entries: PageAccessEntry[] = [];

  for (const { url, file } of pages) {
    const gate = resolvePageGate(url, guardedPrefixes);
    const moduleKey = resolveModuleKey(url, gate);
    const reachable = reachableFrom(file);

    const actions: StoredPageAction[] = [];
    const inPageTabs = new Map<string, StoredPageTab>();
    const routeTabs = new Map<string, StoredPageTab>();
    const gateHooks: GateHookRef[] = [];
    const unresolved = new Set<string>();
    const seenAction = new Set<string>();
    const attachedHooks = new Set<string>();

    for (const f of reachable) {
      const sig = signalsByFile.get(f);
      if (!sig) continue;

      for (const { key, verb } of sig.keys) {
        const dedupe = `${key}|${sig.surface}`;
        if (seenAction.has(dedupe)) continue;
        seenAction.add(dedupe);
        actions.push({
          verb,
          permissionKey: key,
          surface: sig.surface,
          file: sig.rel,
        });
      }

      for (const t of sig.inPageTabs) {
        if (!inPageTabs.has(t.value)) {
          inPageTabs.set(t.value, {
            label: t.label,
            kind: 'in-page',
            value: t.value,
            gateHook: null,
          });
        }
      }

      for (const t of sig.routeTabs) {
        if (routeTabs.has(t.href)) continue;
        if (t.gateHook) attachedHooks.add(t.gateHook);
        routeTabs.set(t.href, {
          label: t.label,
          kind: 'route',
          href: t.href,
          gateHook: t.gateHook ? { hook: t.gateHook, file: sig.rel } : null,
        });
      }

      for (const hook of sig.gateHooks) {
        if (attachedHooks.has(hook)) continue;
        if (gateHooks.some((g) => g.hook === hook)) continue;
        gateHooks.push({ hook, file: sig.rel });
      }

      for (const u of sig.unresolved) unresolved.add(u);
    }

    // Pass E: sibling chips AutoTabNav would render at this page's own level
    // are this page's route tabs too. Bespoke tab bars win on collision — they
    // carry the human label and any non-key gate.
    const parent = parentOf(url);
    for (const tier of resolveTiers(url)) {
      const siblings = tier.filter((c) => parentOf(c.href) === parent);
      if (siblings.length < 2) continue;
      for (const chip of siblings) {
        if (routeTabs.has(chip.href)) continue;
        routeTabs.set(chip.href, {
          label: chip.label,
          kind: 'route',
          href: chip.href,
          gateHook: null,
        });
      }
    }

    entries.push({
      url,
      label: labels.get(url) ?? titleCase(url.split('/').filter(Boolean).pop() ?? 'Home'),
      moduleKey,
      gate,
      tabs: [...routeTabs.values(), ...inPageTabs.values()],
      actions: actions.sort(
        (a, b) => a.surface.localeCompare(b.surface) || a.verb.localeCompare(b.verb)
      ),
      gateHooks,
      unresolvedGates: Array.from(unresolved).sort(),
    });
  }

  entries.sort((a, b) => a.moduleKey.localeCompare(b.moduleKey) || a.url.localeCompare(b.url));

  const banner = `// AUTO-GENERATED by scripts/generate-page-access-map.ts — DO NOT EDIT BY HAND.
//
// Static extraction of the permission surface of every page.tsx under
// app/(routes). Records what the CODE says gates each page, tab and control;
// says nothing about which role holds anything (that is resolved per request
// in app/api/users/permissions-audit/page-access/route.ts).
//
// Regenerate with: npm run gen:page-access
// The build runs this and fails if the committed output is stale, so a PR that
// adds a page or moves a permission gate must commit a fresh map.

import type { PageAccessMap } from '@/types/permissions-audit';
`;

  // ONE LINE PER PAGE. Pretty-printing this produced a 4.5 MB / 160k-line file
  // that slowed the TS server and made every diff unreadable; a single line for
  // the whole array would have been worse to review. Line-per-page keeps `git
  // diff` to the pages that actually changed.
  const prefixes = Array.from(guardedPrefixes).sort();
  const out = `${banner}
export const PAGE_ACCESS_MAP: PageAccessMap = {
  generatedAt: '__GENERATED_AT__',
  guardedPrefixes: ${JSON.stringify(prefixes)},
  pages: [
${entries.map((e) => `    ${JSON.stringify(e)},`).join('\n')}
  ],
};
`;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  // Compare IGNORING the timestamp — otherwise every run is a diff and the
  // build gate cries wolf on a map whose content never changed.
  const previous = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
  const previousBody = previous.replace(/generatedAt: '[^']*'/, "generatedAt: '__X__'");
  const nextBody = out.replace(/generatedAt: '__GENERATED_AT__'/, "generatedAt: '__X__'");

  if (previousBody === nextBody && previous !== '') {
    console.log(`[page-access] unchanged — ${entries.length} pages`);
    return;
  }

  fs.writeFileSync(
    OUT_PATH,
    out.replace('__GENERATED_AT__', new Date().toISOString()),
    'utf8'
  );

  const direct = entries.filter((e) => e.gate.source === 'direct').length;
  const inherited = entries.filter((e) => e.gate.source === 'inherited').length;
  const ungated = entries.filter((e) => e.gate.source === 'ungated').length;
  const navOnly = entries.filter((e) => !e.gate.enforcedByLayout).length;
  console.log(
    `[page-access] wrote ${toRel(OUT_PATH)} — ${entries.length} pages ` +
      `(${direct} direct, ${inherited} inherited, ${ungated} ungated; ` +
      `${navOnly} not enforced by a RoutePermissionGuard layout)`
  );
}

main();
