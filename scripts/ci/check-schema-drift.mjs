#!/usr/bin/env node
/**
 * Schema-drift guard — code must not reference columns no migration creates.
 *
 * WHY: the same defect shipped twice from the Solutions Hub's first day and
 * lived undetected for months because the affected tables were empty:
 *   - sh_prospects.existing_client_id — referenced by the prospects service,
 *     created by NO migration → every Pipeline History load 500'd (PGRST200 /
 *     42703). Fixed by 20260814125517.
 *   - sh_prospects.reopen_date — referenced in five files, created by NO
 *     migration → GET /api/solutions/prospects/stats hard-500s. Fixed by
 *     20260908100000.
 * Type-check, build, and 26 CI gates all passed both times: PostgREST resolves
 * column names at REQUEST time, so this class is invisible to every static
 * gate that doesn't know the schema. This guard closes exactly that gap.
 *
 * WHAT IT CHECKS (deliberately narrow v1):
 *   Scope: lib/services/solutions/** — inside each query chain that starts
 *     with .from('sh_*') (a "segment": everything up to the next .from call),
 *     every column name referenced via .select('...') string literals
 *     (including alias:column renames and embed groups), the first string
 *     argument of .eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.is/.not/.order,
 *     and column names inside .or('col.op.val,...') strings —
 *   must exist in the KNOWN SCHEMA UNION:
 *     1. scripts/ci/schema-snapshot.json — a committed snapshot of the live
 *        production information_schema for sh_% tables. This repo's DDL
 *        history is deliberately incomplete (many sh_ tables were applied via
 *        the Management API and exist in prod but in no migration), so repo
 *        SQL alone cannot be ground truth here.
 *     2. every CREATE TABLE body / ALTER TABLE ADD COLUMN for sh_* found in
 *        supabase/**（quoted or not — pg_dump quotes BOTH parts）— so a column
 *        added by a migration in the SAME PR passes without a snapshot refresh.
 *
 * Segments on non-sh tables (students, departments, …) are skipped entirely.
 * Global-union matching (a column passes if ANY sh_ table declares it) trades
 * per-table precision for robustness on join-heavy services; both historical
 * bugs were missing from EVERYWHERE, which is the signature of this class.
 * Refresh the snapshot when hand-applied DDL adds columns: the query lives in
 * the _generated note inside the snapshot file.
 *
 * Known limits (accepted): dynamic select strings, columns only written via
 * insert/update payload objects, RPC-returned shapes, non-sh tables.
 * False positives go in scripts/ci/schema-drift-allowlist.json with a reason.
 *
 * Exit codes: 0 clean · 2 drift found · 1 operational error.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SQL_DIRS = [join(ROOT, 'supabase')];
const CODE_DIRS = [join(ROOT, 'lib', 'services', 'solutions')];
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'ci', 'schema-drift-allowlist.json');

// ── helpers ──────────────────────────────────────────────────────────────────
function* walk(dir, ext) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p, ext);
    else if (ext.some((e) => name.endsWith(e))) yield p;
  }
}

const unquote = (s) => s.replace(/"/g, '');

// ── 1. Build the known-column map from SQL ──────────────────────────────────
const known = new Map(); // table -> Set(columns)
const addCol = (t, c) => {
  t = unquote(t).replace(/^public\./, '');
  if (!t.startsWith('sh_')) return;
  if (!known.has(t)) known.set(t, new Set());
  known.get(t).add(unquote(c).toLowerCase());
};

const CREATE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?public"?\.)?"?sh_[a-z0-9_]+"?)\s*\(([\s\S]*?)\)\s*;/gi;
const ALTER_RE = /ALTER\s+TABLE\s+(?:ONLY\s+)?((?:"?public"?\.)?"?sh_[a-z0-9_]+"?)([\s\S]*?);/gi;
const ADDCOL_RE = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi;
const NONCOL = new Set(['constraint', 'primary', 'unique', 'check', 'foreign', 'like', 'exclude']);

for (const dir of SQL_DIRS) {
  for (const f of walk(dir, ['.sql'])) {
    const sql = readFileSync(f, 'utf8');
    for (const m of sql.matchAll(CREATE_RE)) {
      // split body on top-level commas
      let depth = 0, cur = '', parts = [];
      for (const ch of m[2]) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      for (const part of parts) {
        const w = part.trim().match(/^"?([a-z0-9_]+)"?/i);
        if (w && !NONCOL.has(w[1].toLowerCase())) addCol(m[1], w[1]);
      }
    }
    for (const m of sql.matchAll(ALTER_RE)) {
      for (const a of m[2].matchAll(ADDCOL_RE)) addCol(m[1], a[1]);
    }
  }
}

// merge the committed production snapshot (see header for why it exists)
const SNAPSHOT_PATH = join(ROOT, 'scripts', 'ci', 'schema-snapshot.json');
if (existsSync(SNAPSHOT_PATH)) {
  const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  for (const [t, cols] of Object.entries(snap)) {
    if (t.startsWith('_')) continue;
    for (const c of cols) addCol(t, c);
  }
} else {
  console.error('✗ operational error: scripts/ci/schema-snapshot.json missing — guard cannot run');
  process.exit(1);
}

const allKnown = new Set();
for (const cols of known.values()) for (const c of cols) allKnown.add(c);
if (allKnown.size < 100) {
  console.error('✗ operational error: implausibly few known sh_* columns — guard cannot run');
  process.exit(1);
}

// ── 2. Extract referenced columns from service code ─────────────────────────
const allowlist = existsSync(ALLOWLIST_PATH)
  ? new Set(JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')).map((e) => (typeof e === 'string' ? e : e.token)))
  : new Set();

const findings = [];
const SELECT_RE = /\.select\(\s*(['"`])([\s\S]*?)\1/g;
const FILTER_RE = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|not|order)\(\s*['"`]([a-z0-9_]+)['"`]/g;
const OR_RE = /\.or\(\s*(['"`])([\s\S]*?)\1/g;
const ORCOL_RE = /(?:^|,|\()([a-z0-9_]+)\.(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|not)\./g;

function tokensFromSelect(sel) {
  const out = [];
  // strip embed groups entirely; validate explicit sh_ embeds' inner columns
  let s = sel.replace(/([a-zA-Z0-9_]+:)?([a-zA-Z0-9_]+)!?[a-zA-Z0-9_]*\(([^()]*)\)/g,
    (_, _alias, tbl, inner) => {
      if (tbl.startsWith('sh_') && known.has(tbl)) {
        for (const t of inner.split(',')) {
          const c = t.trim().split(':').pop().trim();
          if (c && c !== '*' && /^[a-z0-9_]+$/.test(c) && !known.get(tbl).has(c)) {
            out.push({ token: c, note: `embed ${tbl}` });
          }
        }
      }
      return ''; // embeds resolved (or unresolvable FK-named) — drop from top level
    });
  for (const raw of s.split(',')) {
    const c = raw.trim().split(':').pop().trim(); // alias:column → column
    if (!c || c === '*' || !/^[a-z0-9_]+$/.test(c)) continue;
    out.push({ token: c, note: 'select' });
  }
  return out;
}

for (const dir of CODE_DIRS) {
  for (const f of walk(dir, ['.ts', '.tsx'])) {
    const src = readFileSync(f, 'utf8');
    if (!/\.from\(\s*['"`]sh_/.test(src)) continue; // only files querying sh_ tables
    const rel = relative(ROOT, f);

    // Segment the file at each .from('table') call; only harvest tokens from
    // segments whose table is sh_* — selects on students/departments/etc. in
    // the same file must not pollute the check.
    const FROM_RE = /\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)/g;
    const marks = [];
    for (const m of src.matchAll(FROM_RE)) marks.push({ table: m[1], start: m.index });
    const refs = [];
    for (let i = 0; i < marks.length; i++) {
      if (!marks[i].table.startsWith('sh_')) continue;
      const seg = src.slice(marks[i].start, i + 1 < marks.length ? marks[i + 1].start : src.length);
      for (const m of seg.matchAll(SELECT_RE)) refs.push(...tokensFromSelect(m[2]));
      for (const m of seg.matchAll(FILTER_RE)) refs.push({ token: m[1], note: 'filter' });
      for (const m of seg.matchAll(OR_RE)) {
        for (const c of m[2].matchAll(ORCOL_RE)) refs.push({ token: c[1], note: 'or()' });
      }
    }
    for (const { token, note } of refs) {
      if (allKnown.has(token)) continue;
      if (allowlist.has(token)) continue;
      findings.push({ file: rel, token, note });
    }
  }
}

// ── 3. Report ────────────────────────────────────────────────────────────────
if (findings.length === 0) {
  console.log(`✓ schema-drift guard: ${known.size} sh_* tables, ${allKnown.size} known columns, no unbacked references.`);
  process.exit(0);
}
const byToken = new Map();
for (const fnd of findings) {
  if (!byToken.has(fnd.token)) byToken.set(fnd.token, []);
  byToken.get(fnd.token).push(`${fnd.file} (${fnd.note})`);
}
console.error(`✗ ${byToken.size} column(s) referenced in code but created by NO migration:`);
for (const [token, places] of byToken) {
  console.error(`  • ${token}`);
  for (const p of [...new Set(places)].slice(0, 6)) console.error(`      ${p}`);
}
console.error('\nEither add the column in a migration, or (for a true false-positive)');
console.error('add the token to scripts/ci/schema-drift-allowlist.json with a reason.');
process.exit(2);
