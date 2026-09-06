#!/usr/bin/env node
/**
 * scripts/ci/check-ungrantable-permissions.mjs
 *
 * Fails the build when something in this codebase demands a permission key that
 * nobody can ever hold.
 *
 * THE FAILURE CLASS
 *   An RLS policy, a page gate or an API route calls for `module.thing.view`.
 *   That key is absent from lib/constants/permissions.ts PERMISSION_CATEGORIES.
 *   PERMISSION_CATEGORIES is what Role Management renders its toggles from — so a
 *   key registered nowhere never appears as a toggle, so NO role can be given it,
 *   so the guarded object is permanently super-admin-only. The feature looks
 *   built, ships, and is unreachable for every real operator.
 *
 *   It fails SILENTLY. An RLS denial is not an error: PostgREST returns zero rows
 *   with `error: null`. The page renders its empty state. Nothing logs. The only
 *   way anyone finds out is a human saying "this list is always empty for me".
 *
 * TWO BUGS THAT LOOK IDENTICAL AND ARE NOT — this gate reports them separately.
 *   UNGRANTABLE  the key is absent from permissions.ts. Not fixable through any
 *                UI. Somebody must edit a source file and deploy. BLOCKING.
 *   UNGRANTED    the key IS registered but zero roles have it switched on. Fixable
 *                in Role Management in ten seconds by whoever owns the role.
 *                REPORTED, NEVER BLOCKING — and it needs a live database read,
 *                so it only runs when credentials are supplied.
 *   Conflating them makes the fix plan wrong: one is a deploy, the other is a
 *   checkbox, and a list that mixes them sends people to the wrong place.
 *
 * CONFIRMED INSTANCES, verified against production 2026-08-02 — the reason this
 * exists rather than being a hypothetical:
 *   · accreditation.evidence.view / .create / .manage — demanded by the live
 *     policies qem_select / qem_insert / qem_update on quality_evidence_mappings,
 *     absent from permissions.ts. UNGRANTABLE.
 *   · accreditation.submissions.view / .create / .manage — demanded by the
 *     submissions_* policies on accreditation_submissions. UNGRANTABLE.
 *   · accreditation.naac.narrative.view / .manage — registered, but true on ZERO
 *     roles. UNGRANTED. Same symptom, different bug, ten-second fix.
 *
 * WHY NOT scripts/check-permissions-catalog.mjs — it exists and it is not this.
 *   That gate reads ONE source, MENU_PERMISSIONS, and it downgrades a missing
 *   sub-key to a WARNING whenever the top-level module is catalogued. Both
 *   accreditation cases above are exactly that shape: `accreditation` is a
 *   catalogued module, so `accreditation.evidence.view` is at most a warning
 *   there, and it never looks at SQL or at app/ guards at all — which is where
 *   every confirmed instance actually lives.
 *
 * THE BASELINE IS A DEBT LEDGER, NOT A PARDON (ungrantable-permissions-baseline.json)
 *   189 keys were already in this state when the gate was written. Failing on all
 *   of them would have failed every build on day one, and a gate that fails
 *   everything gets deleted. So the known set is recorded, printed as a warning
 *   every run, and only NEW arrivals fail. Entries that stop being ungrantable are
 *   reported as stale so the ledger shrinks instead of rotting.
 *
 * PARSER TRAPS — the three ways `user_has_permission` appears without being a demand,
 * each handled deliberately and each with a fixture in __tests__/ci/:
 *   COMMENTS         `-- … user_has_permission('<key>')`. Prose. NOT a demand.
 *                    This is where the junk comes from: scanning naively over the
 *                    migration tree yields keys literally named `<key>`, `...`,
 *                    `X.action` and `` — all from header comments explaining the
 *                    policy template. Stripped.
 *   DOLLAR QUOTES    `$$ … user_has_permission('x') … $$`. This one is a REAL
 *                    demand and skipping it would be the bug. A function body is
 *                    executable code; the call runs. Scanned as code, recursively,
 *                    so a comment *inside* the body is still stripped.
 *   STRING LITERALS  `EXECUTE format('… user_has_permission(''x'') …')`. Also a
 *                    real demand — dynamic DDL that creates a policy calling it.
 *                    Two such cases exist in this tree today
 *                    (improvement.board.manage, meetings.analytics.view), and a
 *                    scanner that skips literal bodies loses both. Literals are
 *                    decoded ('' → ') and rescanned as code.
 *   The residue — arguments that survive all that but are not shaped like keys —
 *   is REPORTED in its own bucket rather than dropped. A scanner that silently
 *   discards what it cannot classify reports nothing and looks like safety.
 *
 * IT NEVER WRITES. Reads files; on --live, runs one read-only SELECT over
 * custom_roles. No migration, no DDL, no revoke.
 *
 * Usage:
 *   node scripts/ci/check-ungrantable-permissions.mjs
 *   … --live            also report registered-but-held-by-nobody (needs credentials)
 *   … --json            machine-readable output
 *   … --report-only     print findings, always exit 0
 *   … --update-baseline rewrite the debt ledger from the current tree
 *   … --root <dir>      scan a different tree (used by the tests)
 *   … --baseline <file> / --no-baseline
 *   … --roles-fixture <file>  JSON array of granted keys, drives --live offline
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
};

const JSON_OUT = argv.includes('--json');
const REPORT_ONLY = argv.includes('--report-only');
const LIVE = argv.includes('--live');
const UPDATE_BASELINE = argv.includes('--update-baseline');
const NO_BASELINE = argv.includes('--no-baseline');
const ROOT = resolve(process.cwd(), flagValue('--root') ?? '.');
const BASELINE_PATH = resolve(
  process.cwd(),
  flagValue('--baseline') ?? resolve(HERE, 'ungrantable-permissions-baseline.json'),
);
const ROLES_FIXTURE = flagValue('--roles-fixture');

/* ───────────────────────── key shape ─────────────────────────────────────── */

/**
 * What a real permission key looks like in this codebase. Two conventions live
 * here and BOTH are registered, so the shape has to admit both:
 *   module.thing.action    academic.bos-compositions.create, admission_documents.manage
 *   module:thing.action    aiPulse:view.self, aiPulse:opt_out.leaderboard_individual
 * The colon form is not a typo — 22 keys in PERMISSION_CATEGORIES use it. The
 * first draft of this regex was lowercase-and-dots only, which routed all 14
 * aiPulse demands into the ignored bucket. They happen to be registered, so it
 * produced no false positive — it produced a blind spot, which is worse: a new
 * unregistered `aiPulse:` key would have passed the gate in silence.
 *
 * At least one dot is required. Anything else is placeholder text, prose, or a
 * different namespace entirely (the startup-studio API routes use
 * `requiredPermission: 'read'` for Bearer-token scopes). Those go to the
 * `malformed` bucket and are PRINTED — never silently dropped, and never counted
 * as demands, because failing a build over a key named `<key>` teaches people to
 * switch the gate off.
 */
const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_]*(:[A-Za-z0-9_]+)?(\.[A-Za-z0-9_-]+)+$/;

/**
 * Baseline permissions every authenticated user carries, plus role-level flags.
 * They are granted by DEFAULT_ROLE_PERMISSIONS or by the is_super_admin column
 * rather than catalogued as toggles, so demanding one is not a lockout. Kept in
 * sync with EXEMPT_KEYS in scripts/check-permissions-catalog.mjs.
 */
const EXEMPT_KEYS = new Set([
  'view_dashboard', 'view_profile', 'view', 'admin_panel', 'manage_users', 'super_admin',
  // PermissionGuard sentinel: "is_admin() OR is_super_admin()", not a catalogued key.
  'admin_or_super_admin',
]);

/* ───────────────────────── SQL scanner ───────────────────────────────────── */

const SQL_CALL = /(?:public\s*\.\s*)?user_has_permission\s*\(\s*/iy;

/**
 * Walk SQL as a character stream, tracking which lexical context each byte is in,
 * and collect the literal argument of every user_has_permission call that is
 * genuinely in code.
 *
 * Returns { keys: string[], malformed: string[] } — duplicates included; the
 * caller de-duplicates with provenance.
 */
export function scanSql(text, depth = 0) {
  const keys = [];
  const malformed = [];
  if (depth > 4) return { keys, malformed }; // pathological nesting guard
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];

    // -- line comment: prose, never a demand
    if (c === '-' && text[i + 1] === '-') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }

    // /* block comment */ — Postgres nests these, so count depth
    if (c === '/' && text[i + 1] === '*') {
      let d = 1;
      i += 2;
      while (i < n && d > 0) {
        if (text[i] === '/' && text[i + 1] === '*') { d++; i += 2; }
        else if (text[i] === '*' && text[i + 1] === '/') { d--; i += 2; }
        else i++;
      }
      continue;
    }

    // $tag$ … $tag$ — a function/DO body. Executable code: recurse, do not skip.
    const dq = dollarTagAt(text, i);
    if (dq !== null) {
      const close = text.indexOf(dq, i + dq.length);
      const body = close === -1 ? text.slice(i + dq.length) : text.slice(i + dq.length, close);
      const inner = scanSql(body, depth + 1);
      keys.push(...inner.keys);
      malformed.push(...inner.malformed);
      i = close === -1 ? n : close + dq.length;
      continue;
    }

    // "quoted identifier" — opaque, cannot contain a call
    if (c === '"') {
      i = skipDoubleQuoted(text, i);
      continue;
    }

    // 'string literal' — may be dynamic SQL. Decode and rescan.
    if (c === "'") {
      const lit = readSingleQuoted(text, i);
      const inner = scanSql(lit.value, depth + 1);
      keys.push(...inner.keys);
      malformed.push(...inner.malformed);
      i = lit.next;
      continue;
    }

    // code — is this the call?
    SQL_CALL.lastIndex = i;
    const m = SQL_CALL.exec(text);
    if (m) {
      let j = SQL_CALL.lastIndex;
      if (text[j] === "'") {
        const lit = readSingleQuoted(text, j);
        // Exempt keys are real demands that simply need no catalogue entry; they
        // are filtered at comparison time, not here, so SQL and TS agree on what
        // counts as "not key-shaped".
        const wellFormed = EXEMPT_KEYS.has(lit.value) || KEY_SHAPE.test(lit.value);
        (wellFormed ? keys : malformed).push(lit.value);
        i = lit.next;
      } else {
        // A non-literal argument (a variable, a format() call). Nothing to check.
        i = j;
      }
      continue;
    }

    i++;
  }

  return { keys, malformed };
}

/** `$$` or `$tag$` at position i, else null. `$1` positional params do not match. */
function dollarTagAt(text, i) {
  if (text[i] !== '$') return null;
  let j = i + 1;
  while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
  if (text[j] !== '$') return null;
  const tag = text.slice(i, j + 1);
  // A tag must be empty ($$) or start with a letter/underscore — $1$ is not one.
  if (tag.length > 2 && !/^[A-Za-z_]/.test(tag[1])) return null;
  return tag;
}

/** Read a single-quoted literal starting at i. '' is an escaped quote. */
function readSingleQuoted(text, i) {
  let j = i + 1;
  let out = '';
  while (j < text.length) {
    if (text[j] === "'") {
      if (text[j + 1] === "'") { out += "'"; j += 2; continue; }
      j++;
      break;
    }
    out += text[j];
    j++;
  }
  return { value: out, next: j };
}

function skipDoubleQuoted(text, i) {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '"') {
      if (text[j + 1] === '"') { j += 2; continue; }
      return j + 1;
    }
    j++;
  }
  return j;
}

/* ───────────────────────── TS/TSX scanner ───────────────────────────────── */

/**
 * The shapes an app-layer permission demand actually takes in this repo, counted
 * over app/ on 2026-08-02:
 *   requirePermission: 'key'      94   API route handlers
 *   requiredPermission='key'      20   page + layout guards
 *   permission="key"              10   PermissionGuard-family props
 *   hasPermission('key')           5
 *   checkPermission('key')         4
 *   permissionKey="key"            5
 * Written as one alternation followed by "and then a string literal", so a new
 * call site using any of them is covered without a change here.
 */
const TS_DEMAND = /(?:requiredPermissions?|requirePermission|permissionKey|permission|hasPermission|checkPermission|assertPermission|userHasPermission)\s*(?:[:=]\s*\{?\s*|\(\s*)/y;

/** Cheap pre-filter — skip the ~5,500 files that cannot possibly contain a demand. */
const TS_MARKERS = ['equiredPermission', 'equirePermission', 'permissionKey', 'permission=',
                    'hasPermission(', 'checkPermission(', 'assertPermission(', 'userHasPermission('];

export function scanTs(text) {
  const keys = [];
  const malformed = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];

    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i = skipJsString(text, i);
      continue;
    }

    // Only try the demand match on an identifier boundary, so `hasPermission` does
    // not fire inside `useHasPermission` … it does, and that is fine: same key.
    TS_DEMAND.lastIndex = i;
    const m = TS_DEMAND.exec(text);
    if (m) {
      let j = TS_DEMAND.lastIndex;
      const q = text[j];
      if (q === '"' || q === "'") {
        const end = text.indexOf(q, j + 1);
        if (end !== -1) {
          const value = text.slice(j + 1, end);
          if (EXEMPT_KEYS.has(value)) { i = end + 1; continue; }
          (KEY_SHAPE.test(value) ? keys : malformed).push(value);
          i = end + 1;
          continue;
        }
      }
      i = j;
      continue;
    }

    i++;
  }

  return { keys, malformed };
}

function skipJsString(text, i) {
  const q = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '\\') { j += 2; continue; }
    if (text[j] === q) return j + 1;
    if (q !== '`' && text[j] === '\n') return j; // unterminated — bail on the line
    j++;
  }
  return j;
}

/* ───────────────────────── registry + menu ──────────────────────────────── */

export function extractRegisteredKeys(src) {
  const keys = new Set();
  const m = src.match(/export const PERMISSION_CATEGORIES\s*=\s*\[([\s\S]*?)^\];\s*$/m);
  if (!m) return keys;
  const re = /\{\s*key:\s*['"]([^'"]+)['"]/g;
  let x;
  while ((x = re.exec(m[1]))) keys.add(x[1]);
  return keys;
}

/**
 * MENU_PERMISSIONS values. Its entries are `'/route': 'permission.key'` — the key
 * carries no marker word in front of it, so this file gets a shape-specific read
 * rather than the generic TS scanner.
 */
export function extractMenuKeys(src) {
  const keys = [];
  const start = src.match(/export const MENU_PERMISSIONS\s*:[^=]*=\s*\{/);
  if (!start) return keys;
  let depth = 1, i = start.index + start[0].length;
  const from = i;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const body = src.slice(from, i - 1);
  const entry = /['"]([^'"\n]+)['"]\s*:\s*(?:['"]([\w.\-]+)['"]|null)/g;
  let m;
  while ((m = entry.exec(body))) if (m[2]) keys.push(m[2]);
  return keys;
}

/* ───────────────────────── file walk ────────────────────────────────────── */

function walk(dir, test, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
}

/* ───────────────────────── collection ───────────────────────────────────── */

/** key -> { sources: Set<string> } ; plus malformed with provenance. */
function collectDemands(root) {
  const demands = new Map();
  const malformed = new Map();
  const counts = { sql: 0, menu: 0, app: 0 };

  const add = (map, key, source) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(source);
  };

  // 1. SQL migrations — where every confirmed instance lives.
  const migDir = join(root, 'supabase/migrations');
  if (existsSync(migDir)) {
    for (const f of walk(migDir, (n) => n.endsWith('.sql'))) {
      const text = readFileSync(f, 'utf8');
      if (!text.includes('user_has_permission')) continue;
      const rel = relative(root, f);
      const { keys, malformed: bad } = scanSql(text);
      for (const k of keys) { add(demands, k, rel); counts.sql++; }
      for (const k of bad) add(malformed, k, rel);
    }
  }

  // 2. MENU_PERMISSIONS — the desktop sidebar's route→permission map.
  const menuFile = join(root, 'lib/sidebarMenuLink.ts');
  if (existsSync(menuFile)) {
    const rel = relative(root, menuFile);
    for (const k of extractMenuKeys(readFileSync(menuFile, 'utf8'))) {
      if (EXEMPT_KEYS.has(k)) continue;
      if (KEY_SHAPE.test(k)) { add(demands, k, rel); counts.menu++; }
      else add(malformed, k, rel);
    }
  }

  // 3. Page gates and API routes under app/.
  const appDir = join(root, 'app');
  if (existsSync(appDir)) {
    for (const f of walk(appDir, (n) => n.endsWith('.ts') || n.endsWith('.tsx'))) {
      const text = readFileSync(f, 'utf8');
      if (!TS_MARKERS.some((mk) => text.includes(mk))) continue;
      const rel = relative(root, f);
      const { keys, malformed: bad } = scanTs(text);
      for (const k of keys) { add(demands, k, rel); counts.app++; }
      for (const k of bad) add(malformed, k, rel);
    }
  }

  return { demands, malformed, counts };
}

/* ───────────────────────── live half ────────────────────────────────────── */

/**
 * Which registered keys are switched on for at least one active role.
 *
 * `permissions ? 'key'` is deliberately NOT used: jsonb `?` tests that the key
 * EXISTS, and a role carrying `{"billing.x": false}` would read as granted. A
 * false-positive here would report a real lockout as fine.
 */
const GRANTED_KEYS_SQL = `
SELECT DISTINCT kv.key AS key
FROM public.custom_roles r
CROSS JOIN LATERAL jsonb_each(COALESCE(r.permissions, '{}'::jsonb)) AS kv(key, value)
WHERE COALESCE(r.is_active, true) IS TRUE
  AND (kv.value = 'true'::jsonb OR kv.value = '"true"'::jsonb)
`.trim();

async function fetchGrantedKeys() {
  if (ROLES_FIXTURE) {
    const parsed = JSON.parse(readFileSync(resolve(process.cwd(), ROLES_FIXTURE), 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed : parsed.granted ?? []);
  }

  const DB_URL = process.env.SUPABASE_DB_URL;
  const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  const MGMT_REF = process.env.SUPABASE_PROJECT_REF;

  if (DB_URL) {
    const pg = (await import('pg')).default;
    const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const res = await client.query(GRANTED_KEYS_SQL);
      return new Set(res.rows.map((r) => r.key));
    } finally {
      await client.end();
    }
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${MGMT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
      // Required — the endpoint refuses a request without a browser-ish UA.
      'User-Agent': 'Mozilla/5.0 (Macintosh)',
    },
    body: JSON.stringify({ query: GRANTED_KEYS_SQL }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body)) {
    // An empty result and a failed request must never look the same to a gate.
    throw new Error(
      `Management API query failed (HTTP ${res.status}): ${JSON.stringify(body)?.slice(0, 300)}`,
    );
  }
  return new Set(body.map((r) => r.key));
}

function haveLiveCredentials() {
  return Boolean(
    ROLES_FIXTURE ||
    process.env.SUPABASE_DB_URL ||
    (process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_PROJECT_REF),
  );
}

/* ───────────────────────── baseline ─────────────────────────────────────── */

function loadBaseline() {
  if (NO_BASELINE) return { keys: new Set(), raw: null };
  if (!existsSync(BASELINE_PATH)) return { keys: new Set(), raw: null };
  const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.ungrantable ?? [];
  return { keys: new Set(list.map((e) => (typeof e === 'string' ? e : e.key))), raw };
}

/* ───────────────────────── main ─────────────────────────────────────────── */

async function main() {
  const permsFile = join(ROOT, 'lib/constants/permissions.ts');
  if (!existsSync(permsFile)) {
    console.error(`${RED}✗ lib/constants/permissions.ts not found under ${ROOT}.${RESET}
Without the registry there is nothing to compare demands against, and a run that
cannot compare must not report success.`);
    process.exit(1);
  }

  const registered = extractRegisteredKeys(readFileSync(permsFile, 'utf8'));
  if (registered.size === 0) {
    console.error(`${RED}✗ PERMISSION_CATEGORIES parsed to zero keys.${RESET}
Every demand would look ungrantable, or (worse) a future refactor of that file
would make every demand look fine. Exiting 1 rather than reporting on nonsense.`);
    process.exit(1);
  }

  const { demands, malformed, counts } = collectDemands(ROOT);
  const { keys: baseline } = loadBaseline();

  const ungrantable = [];
  for (const [key, sources] of [...demands.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (EXEMPT_KEYS.has(key) || registered.has(key)) continue;
    ungrantable.push({ key, sources: [...sources].sort(), baselined: baseline.has(key) });
  }

  const fresh = ungrantable.filter((u) => !u.baselined);
  const known = ungrantable.filter((u) => u.baselined);
  const stale = [...baseline].filter((k) => !ungrantable.some((u) => u.key === k)).sort();

  if (UPDATE_BASELINE) {
    // Keys only, no source paths. Every entry is a feature nobody but a super
    // admin can reach, so this list wants to be read, and 191 keys is readable
    // where 191 keys × their call sites is a wall. Run the gate itself for the
    // paths — it prints them for anything NEW, which is the case that needs them.
    const payload = {
      _comment: 'Keys demanded somewhere in this codebase but absent from ' +
        'lib/constants/permissions.ts PERMISSION_CATEGORIES, so no role can hold them ' +
        'and whatever they guard is super-admin-only. Recorded so the gate fails on NEW ' +
        'arrivals without failing on pre-existing debt. SHRINK THIS LIST; DO NOT GROW IT. ' +
        'Regenerate: node scripts/ci/check-ungrantable-permissions.mjs --update-baseline',
      generated: new Date().toISOString().slice(0, 10),
      ungrantable: ungrantable.map((u) => u.key),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log(`${GREEN}wrote${RESET} ${BASELINE_PATH} — ${ungrantable.length} entries`);
    process.exit(0);
  }

  // ── live half ────────────────────────────────────────────────────────────
  let ungranted = null;
  let liveError = null;
  if (LIVE) {
    if (!haveLiveCredentials()) {
      console.error(`${RED}✗ --live asked for the held-by-nobody report and there is no way to reach the database.${RESET}
Set ONE of:
  SUPABASE_DB_URL                                (direct Postgres — session pooler,
                                                  port 6543; GitHub runners cannot
                                                  reach the direct 5432 host)
  SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF   (Management API)

Exiting 1 rather than 0: "the ungranted check did not run" and "no key is
ungranted" are the same silence, and treating the first as the second is how a
lockout survives a green build.`);
      process.exit(1);
    }
    try {
      const granted = await fetchGrantedKeys();
      ungranted = [...registered]
        .filter((k) => !granted.has(k))
        .filter((k) => demands.has(k)) // only keys something actually enforces
        .sort();
    } catch (err) {
      liveError = err.message;
    }
  }

  // ── report ───────────────────────────────────────────────────────────────
  if (JSON_OUT) {
    console.log(JSON.stringify({
      registered: registered.size,
      demanded: demands.size,
      sources: counts,
      ungrantable_new: fresh.map((u) => ({ key: u.key, sources: u.sources })),
      ungrantable_baselined: known.map((u) => u.key),
      baseline_stale: stale,
      malformed: [...malformed.keys()].sort(),
      ungranted,
      live_error: liveError,
    }, null, 2));
  } else {
    console.log(`${DIM}ungrantable-permissions — demanded keys vs the Role-Management registry${RESET}`);
    console.log(`  registered keys        ${registered.size}`);
    console.log(`  demanded keys          ${demands.size}   ${DIM}(sql ${counts.sql} · menu ${counts.menu} · app ${counts.app} call sites)${RESET}`);
    console.log(`  ${BOLD}UNGRANTABLE (new)      ${fresh.length}${RESET}   ${DIM}absent from permissions.ts — blocks this run${RESET}`);
    console.log(`  UNGRANTABLE (baselined) ${known.length}  ${DIM}known debt — warns${RESET}`);
    console.log(`  malformed / ignored    ${malformed.size}   ${DIM}not key-shaped, never counted as demands${RESET}`);
    console.log(`  UNGRANTED              ${ungranted === null ? '—    ' + DIM + '(needs --live + credentials)' + RESET : ungranted.length + '   ' + DIM + 'registered, held by no active role' + RESET}`);

    if (fresh.length > 0) {
      console.log(`\n${RED}UNGRANTABLE${RESET} — demanded, but not in PERMISSION_CATEGORIES.`);
      console.log(`${DIM}No toggle exists in Role Management, so no role can ever hold these. Every${RESET}`);
      console.log(`${DIM}object they guard is super-admin-only, and denial is silent (0 rows, no error).${RESET}\n`);
      for (const u of fresh) {
        console.log(`  ${RED}✗${RESET} ${u.key}`);
        for (const s of u.sources.slice(0, 3)) console.log(`      ${DIM}${s}${RESET}`);
        if (u.sources.length > 3) console.log(`      ${DIM}… and ${u.sources.length - 3} more${RESET}`);
      }
      console.log(`\n${DIM}Fix: add each key to lib/constants/permissions.ts PERMISSION_CATEGORIES under`);
      console.log(`its module, then grant it to the roles that need it in Role Management.`);
      console.log(`Registering the key is a deploy; granting it afterwards is a checkbox.${RESET}`);
    }

    if (known.length > 0) {
      console.log(`\n${YELLOW}UNGRANTABLE (baselined)${RESET} — ${known.length} pre-existing, not failing this run.`);
      console.log(`${DIM}Each is a feature no non-super-admin can reach. First 10:${RESET}`);
      for (const u of known.slice(0, 10)) console.log(`  ${YELLOW}!${RESET} ${u.key}`);
      if (known.length > 10) console.log(`  ${DIM}… ${known.length - 10} more (--json for the full list)${RESET}`);
    }

    if (stale.length > 0) {
      console.log(`\n${GREEN}Baseline entries that are no longer ungrantable${RESET} (${stale.length}) — remove them:`);
      for (const k of stale.slice(0, 10)) console.log(`  ${DIM}• ${k}${RESET}`);
      if (stale.length > 10) console.log(`  ${DIM}… ${stale.length - 10} more${RESET}`);
      console.log(`${DIM}Run --update-baseline to rewrite the ledger.${RESET}`);
    }

    if (malformed.size > 0) {
      console.log(`\n${DIM}Ignored (not key-shaped — placeholders in comments, template text):${RESET}`);
      for (const k of [...malformed.keys()].sort().slice(0, 8)) {
        console.log(`  ${DIM}· ${JSON.stringify(k)}${RESET}`);
      }
      if (malformed.size > 8) console.log(`  ${DIM}… ${malformed.size - 8} more${RESET}`);
    }

    if (liveError) {
      console.log(`\n${YELLOW}UNGRANTED check could not run:${RESET} ${liveError}`);
    } else if (ungranted && ungranted.length > 0) {
      console.log(`\n${YELLOW}UNGRANTED${RESET} — registered and enforced, but switched on for NO active role.`);
      console.log(`${DIM}A different bug from the list above and a much cheaper one: the toggle exists,`);
      console.log(`somebody just has to turn it on. Never fails this run.${RESET}\n`);
      for (const k of ungranted.slice(0, 25)) console.log(`  ${YELLOW}○${RESET} ${k}`);
      if (ungranted.length > 25) console.log(`  ${DIM}… ${ungranted.length - 25} more (--json for the full list)${RESET}`);
    }
  }

  if (liveError) {
    // A transport failure is not a pass, and --report-only does not cover it:
    // that flag says "do not fail on FINDINGS", not "do not fail when the query
    // never ran". An empty result and a failed request must never look the same
    // to a gate.
    process.exit(1);
  }

  if (fresh.length > 0 && !REPORT_ONLY) {
    if (!JSON_OUT) {
      console.log(`\n${RED}FAIL${RESET}: ${fresh.length} permission key(s) are demanded by code that nobody can be granted.`);
    }
    process.exit(1);
  }

  if (!JSON_OUT) {
    console.log(`\n${GREEN}OK${RESET}: every newly demanded permission key has a home in PERMISSION_CATEGORIES.`);
  }
  process.exit(0);
}

// Importable for unit tests without executing the CLI.
const INVOKED_DIRECTLY = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (INVOKED_DIRECTLY) {
  main().catch((err) => {
    console.error(`${RED}✗ ${err.stack || err.message}${RESET}`);
    process.exit(1);
  });
}
