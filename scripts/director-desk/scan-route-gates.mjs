#!/usr/bin/env node
// ============================================================================
// Director's Desk — scan every page for the gate it ACTUALLY uses.
//
// WHY THIS EXISTS
// ---------------
// The hand-over control writes a permission key onto the handover row, and that
// row IS the grant. So the key written has to be the key the page's own gate
// demands. Round 1 of PR #2840 resolved every route through MENU_PERMISSIONS
// (via routeMatcher) and claimed that was "exactly the key the page demands".
// Measured on this tree, that claim is true for a minority of pages:
//
//     1,446  page.tsx files under app/(routes)
//        37  files mount RoutePermissionGuard  <- MENU_PERMISSIONS is authoritative
//       112  files mount SuperAdminOnly        <- reads profiles.is_super_admin
//       359  files mount PermissionGuard       <- its OWN module/action pair
//
// A handover can never grant `is_super_admin`, so a SuperAdminOnly page is not
// handable AT ALL — yet 19 such pages carry a non-'super_admin'
// MENU_PERMISSIONS key, so the round-1 resolver wrote a real, unwalled,
// level-legal key, both server refusals passed, the dialog showed the green
// "Handed over" screen, and the receiver got access-denied.
// /hr/admin/payroll was the worked example: it resolves to ['hr.dashboard.view'].
//
// WHAT THIS EMITS
// ---------------
// components/director-desk/route-gate-map.generated.ts — for every route whose
// gate is NOT simply "the MENU_PERMISSIONS key", one entry saying so. Routes
// that are plain (no gate, or RoutePermissionGuard only) are omitted: the
// resolver's existing routeMatcher path is already correct for them, and
// carrying 1,400 no-op entries would only make the drift diff unreadable.
//
// HOW A GATE IS IDENTIFIED
// ------------------------
// For each page.tsx we read the page file plus every ancestor layout.tsx from
// app/(routes) down. Within one file, only the gate tags at the SHALLOWEST
// indentation count as that file's page-level gate; deeper ones are
// button-level render guards (a `<PermissionGuard action="delete">` around a
// Delete button is not the page's gate, and unioning its key in would widen the
// handover beyond what the Director chose). Layout files are treated as
// wrapping everything beneath them, so any gate they mount applies.
//
// Regenerate deliberately:
//     node scripts/director-desk/scan-route-gates.mjs
// The drift test __tests__/director-desk/route-gate-map.test.ts re-runs this
// scan in memory and fails if the committed file disagrees.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
const ROUTES_ROOT = path.join(REPO_ROOT, 'app', '(routes)');
const OUT_FILE = path.join(
  REPO_ROOT,
  'components',
  'director-desk',
  'route-gate-map.generated.ts'
);

// ---------------------------------------------------------------------------
// Gate kinds. `superAdmin` and `adminRole` are both un-handable: one reads
// profiles.is_super_admin, the other reads profiles.role against a fixed list.
// Neither is something a handover row can ever set.
// ---------------------------------------------------------------------------
const SUPER_ADMIN_TAGS = ['SuperAdminOnly'];
const ADMIN_ROLE_TAGS = ['AdminPermissionGuard'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

/** app/(routes)/(x)/hr/admin/payroll/page.tsx -> /hr/admin/payroll */
export function routeForPageFile(absPageFile) {
  const rel = path.relative(ROUTES_ROOT, absPageFile);
  const segments = rel
    .split(path.sep)
    .slice(0, -1) // drop page.tsx
    .filter((s) => !(s.startsWith('(') && s.endsWith(')'))); // drop route groups
  return `/${segments.join('/')}` === '/' ? '/' : `/${segments.join('/')}`;
}

/** Every layout.tsx from app/(routes) down to the page's own directory. */
function ancestorLayouts(absPageFile) {
  const rel = path.relative(ROUTES_ROOT, path.dirname(absPageFile));
  const parts = rel === '' ? [] : rel.split(path.sep);
  const files = [];
  let cur = ROUTES_ROOT;
  files.push(path.join(cur, 'layout.tsx'));
  for (const p of parts) {
    cur = path.join(cur, p);
    files.push(path.join(cur, 'layout.tsx'));
  }
  return files;
}

function readIfExists(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Blank out line comments, block comments and string/template literals,
 * preserving every character position and every newline.
 *
 * Position-preserving matters: indentation is what tells a page-level gate from
 * a button-level one, so a stripper that collapses a line (or eats the \n that
 * ends a // comment) silently reindents the file and the whole heuristic goes
 * wrong. An earlier regex version did exactly that and lost /admin/nav-config,
 * a real <SuperAdminOnly> page, from the blocked list.
 *
 * Comments are removed because several files NAME a gate only in prose
 * ("matches the SuperAdminOnly gate on every payroll leaf"). Strings are
 * removed so a key mentioned in copy is never read as a mounted gate.
 */
export function stripComments(src) {
  const out = src.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i++) {
      if (out[i] !== '\n') out[i] = ' ';
    }
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) break;
        j++;
      }
      // Keep the quotes themselves: attribute readers below run on the ORIGINAL
      // text of a tag, not on this stripped copy, so blanking here only affects
      // gate-tag detection and indentation.
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Read a JSX string-ish attribute: foo="x" | foo='x' | foo={'x'} | foo={"x"} */
function readStringAttr(tagText, name) {
  const re = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*['"\`]([^'"\`]*)['"\`]\\s*\\})`
  );
  const m = tagText.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/** Read action= which may be a string or an array literal. */
function readActionAttr(tagText) {
  const single = readStringAttr(tagText, 'action');
  if (single !== null) return [single];
  const arr = tagText.match(/\baction\s*=\s*\{\s*\[([^\]]*)\]\s*\}/);
  if (!arr) return null;
  const items = arr[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

/**
 * The opening tag for a JSX element starting at `idx`, with everything nested
 * inside `{...}` blanked out.
 *
 * Brace-aware on both counts. `fallback={<Denied module="x" />}` must neither
 * end the tag early at its `>` nor donate its `module` attribute to the guard —
 * that would resolve a page to the key of its own access-denied panel.
 *
 * `braceIdx` positions come from the COMMENT-STRIPPED copy, and the returned
 * text is sliced from the ORIGINAL, which is safe because stripComments
 * preserves every character position.
 */
function openingTagAt(original, stripped, idx) {
  let depth = 0;
  let end = Math.min(original.length, idx + 4000);
  for (let i = idx; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) {
      end = i + 1;
      break;
    }
  }
  const chars = original.slice(idx, end).split('');
  let d = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = stripped[idx + i];
    if (c === '{') {
      d++;
      if (d === 1) continue; // keep the outer `{` so `foo={'x'}` still reads
    } else if (c === '}') {
      d--;
      if (d === 0) continue;
    }
    // Blank anything two or more braces deep: `foo={'x'}` survives (depth 1),
    // `fallback={<X module="y"/>}` loses its inner attributes only if nested
    // deeper. Nested JSX inside a depth-1 brace is handled by the `<` test.
    if (d >= 1 && chars[i] === '<') {
      // From the first nested element onward inside a brace, blank to the
      // matching close brace — that whole region belongs to another component.
      let k = i;
      let bd = d;
      while (k < chars.length && bd >= d) {
        if (stripped[idx + k] === '{') bd++;
        else if (stripped[idx + k] === '}') bd--;
        if (bd < d) break;
        chars[k] = ' ';
        k++;
      }
      i = k - 1;
      d = bd;
    }
  }
  return chars.join('');
}

const GATE_TAG_RE =
  /<(SuperAdminOnly|AdminPermissionGuard|PermissionGuard|PolicyPageShell)\b/g;

/**
 * All page-level gates a single file mounts.
 *
 * Only the shallowest-indented gate tags count. In a page.tsx the outermost JSX
 * is the page; anything indented deeper is inside it and gates a fragment, not
 * the page. Unioning a `<PermissionGuard action="delete">` from a Delete button
 * into the handover would grant the receiver more than the Director chose.
 */
export function gatesInSource(src) {
  const clean = stripComments(src);
  const found = [];

  GATE_TAG_RE.lastIndex = 0;
  let m;
  while ((m = GATE_TAG_RE.exec(clean)) !== null) {
    const idx = m.index;
    const lineStart = clean.lastIndexOf('\n', idx) + 1;
    const indent = idx - lineStart;
    found.push({ tag: m[1], idx, indent, text: openingTagAt(src, clean, idx) });
  }
  if (found.length === 0) return [];

  const minIndent = Math.min(...found.map((f) => f.indent));
  const outermost = found.filter((f) => f.indent === minIndent);

  const gates = [];
  for (const g of outermost) {
    if (SUPER_ADMIN_TAGS.includes(g.tag)) {
      gates.push({ kind: 'superAdmin' });
      continue;
    }
    if (ADMIN_ROLE_TAGS.includes(g.tag)) {
      gates.push({ kind: 'adminRole' });
      continue;
    }
    if (g.tag === 'PolicyPageShell') {
      // PolicyPageShell picks its own gate from its props — see
      // lib/admin/policy-shell/PolicyPageShell.tsx: permissionKey wins, then
      // permission="super_admin", else AdminPermissionGuard.
      const key = readStringAttr(g.text, 'permissionKey');
      if (key) {
        gates.push({ kind: 'permission', keys: [key] });
        continue;
      }
      const permission = readStringAttr(g.text, 'permission');
      gates.push({ kind: permission === 'super_admin' ? 'superAdmin' : 'adminRole' });
      continue;
    }
    // PermissionGuard
    const mod = readStringAttr(g.text, 'module');
    const actions = readActionAttr(g.text);
    if (!mod || !actions) {
      // A guard whose module/action we cannot read statically (a variable, a
      // prop) is a gate we do not understand. Fail closed and say so, rather
      // than resolve past it and report a success the receiver cannot use.
      gates.push({ kind: 'unreadable' });
      continue;
    }
    // anyAction={true} means ANY one of the actions opens the page, so the
    // smallest sufficient grant is the first. Default (all) needs every one.
    const anyAction = /\banyAction\s*=\s*(\{\s*true\s*\}|"true"|'true')/.test(g.text)
      || /\banyAction\b(?!\s*=)/.test(g.text);
    const keys = (anyAction ? [actions[0]] : actions).map((a) => `${mod}.${a}`);
    gates.push({ kind: 'permission', keys });
  }
  return gates;
}

export function scanRouteGates() {
  const pages = walk(ROUTES_ROOT).sort();
  const map = {};

  for (const pageFile of pages) {
    const route = routeForPageFile(pageFile);
    const chain = [...ancestorLayouts(pageFile), pageFile];

    let blocked = null; // 'superAdmin' | 'adminRole' | 'unreadable'
    let routeGuarded = false;
    const keys = new Set();

    for (const file of chain) {
      const src = readIfExists(file);
      if (src === null) continue;
      // RoutePermissionGuard is the ONE gate for which MENU_PERMISSIONS is
      // authoritative — it resolves through routeMatcher itself. Recorded so
      // the resolver knows when the menu key is actually enforced and must be
      // granted, rather than granting it everywhere "just in case".
      if (/<RoutePermissionGuard\b/.test(stripComments(src))) routeGuarded = true;
      for (const gate of gatesInSource(src)) {
        if (gate.kind === 'superAdmin') blocked = blocked ?? 'superAdmin';
        else if (gate.kind === 'adminRole') blocked = blocked ?? 'adminRole';
        else if (gate.kind === 'unreadable') blocked = blocked ?? 'unreadable';
        else for (const k of gate.keys) keys.add(k);
      }
    }

    if (!blocked && keys.size === 0) continue; // plain — routeMatcher is correct
    const entry = {};
    if (blocked) entry.blocked = blocked;
    if (keys.size > 0) entry.keys = [...keys].sort();
    if (routeGuarded && keys.size > 0) entry.routeGuarded = true;
    // Two page.tsx files can resolve to the same route only via parallel routes
    // (@slot) or duplicated route groups. Merge rather than overwrite, so the
    // stricter answer survives.
    const prev = map[route];
    if (prev) {
      if (entry.blocked && !prev.blocked) prev.blocked = entry.blocked;
      if (entry.keys) prev.keys = [...new Set([...(prev.keys ?? []), ...entry.keys])].sort();
      if (entry.routeGuarded) prev.routeGuarded = true;
    } else {
      map[route] = entry;
    }
  }

  return map;
}

export function renderModule(map) {
  const routes = Object.keys(map).sort();
  const blockedCount = routes.filter((r) => map[r].blocked).length;
  const keyedCount = routes.filter((r) => map[r].keys?.length).length;

  const lines = [];
  lines.push('// ============================================================================');
  lines.push('// GENERATED FILE — do not edit by hand.');
  lines.push('// Source: scripts/director-desk/scan-route-gates.mjs');
  lines.push('// Regenerate: node scripts/director-desk/scan-route-gates.mjs');
  lines.push('// Drift guard: __tests__/director-desk/route-gate-map.test.ts');
  lines.push('//');
  lines.push('// Every route whose real gate is NOT simply its MENU_PERMISSIONS key.');
  lines.push(`// ${blockedCount} routes cannot be handed over at all; ${keyedCount} declare`);
  lines.push('// their own permission keys through PermissionGuard / PolicyPageShell.');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push("/** Why a route refuses a handover. All three are gates a grant cannot satisfy. */");
  lines.push("export type RouteGateBlock = 'superAdmin' | 'adminRole' | 'unreadable';");
  lines.push('');
  lines.push('export interface RouteGateEntry {');
  lines.push('  /** Present when no handover can ever open this page. */');
  lines.push('  blocked?: RouteGateBlock;');
  lines.push("  /** The page's own gate keys, from PermissionGuard / PolicyPageShell. */");
  lines.push('  keys?: string[];');
  lines.push('  /**');
  lines.push('   * The route ALSO sits under a RoutePermissionGuard, so its');
  lines.push('   * MENU_PERMISSIONS key is enforced too and must be granted alongside');
  lines.push('   * the keys above. Absent means the menu key gates nothing here.');
  lines.push('   */');
  lines.push('  routeGuarded?: boolean;');
  lines.push('}');
  lines.push('');
  lines.push('export const ROUTE_GATE_MAP: Record<string, RouteGateEntry> = {');
  for (const route of routes) {
    const e = map[route];
    const parts = [];
    if (e.blocked) parts.push(`blocked: '${e.blocked}'`);
    if (e.keys?.length) parts.push(`keys: [${e.keys.map((k) => `'${k}'`).join(', ')}]`);
    if (e.routeGuarded) parts.push('routeGuarded: true');
    lines.push(`  ${JSON.stringify(route)}: { ${parts.join(', ')} },`);
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const map = scanRouteGates();
  const out = renderModule(map);
  writeFileSync(OUT_FILE, out, 'utf8');
  const routes = Object.keys(map);
  const blocked = routes.filter((r) => map[r].blocked);
  console.log(`scanned app/(routes) -> ${routes.length} non-plain routes`);
  console.log(`  un-handable (super admin / admin role / unreadable gate): ${blocked.length}`);
  console.log(`  own permission keys: ${routes.filter((r) => map[r].keys?.length).length}`);
  console.log(`wrote ${path.relative(REPO_ROOT, OUT_FILE)}`);
}
