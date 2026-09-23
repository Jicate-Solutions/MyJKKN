#!/usr/bin/env node
/**
 * scripts/ci/check-institution-param-guard.mjs
 *
 * CI guard: a NEW or CHANGED SECURITY DEFINER function that takes an institution
 * id from its caller must CHECK that the caller may see that institution before
 * it uses the id.
 *
 * WHY (receipt, measured live 2026-09-23):
 *   Three SECURITY DEFINER lookups — ai_rpc_students_summary,
 *   ai_rpc_students_by_department and ai_rpc_admission_referrers — did
 *       v_inst_id := COALESCE(p_institution_id, v_profile.institution_id);
 *       ... WHERE (v_profile.is_super_admin = TRUE OR institution_id = v_inst_id)
 *   and nothing else. A SECURITY DEFINER function runs as its owner, so row-level
 *   security does not apply inside it; the only thing standing between a caller
 *   and another college's rows is the function's own code. A one-college head of
 *   department passed the Engineering college's id and read its 1,511 learners
 *   and 10 referrer phone numbers. The flaw passed two AI reviewers and a human
 *   in July (20260712134500). An emergency hotfix is live; the full fix is PR
 *   #3983 (20270307090000_ai_rpc_scope_parameter_guards.sql), which this gate
 *   passes and which its tests carry as a fixture. The Director approved this
 *   gate on 2026-09-23 ("If someone later adds a new lookup with the same
 *   mistake -> Automatic check").
 *
 * WHICH FUNCTIONS ARE CHECKED
 *   Every CREATE [OR REPLACE] FUNCTION in an ADDED or CHANGED migration file
 *   that is ALL of:
 *     1. SECURITY DEFINER (a SECURITY INVOKER function is bound by the caller's
 *        own row-level security, so a caller-supplied id cannot widen it);
 *     2. not a trigger function (RETURNS trigger — a caller cannot pass it
 *        arguments);
 *     3. has an INPUT parameter whose name ends in `institution_id` or
 *        `institution_ids` — p_institution_id, p_target_institution_id,
 *        p_institution_ids uuid[], a bare institution_id. OUT parameters and
 *        RETURNS TABLE (...) columns are not inputs and are ignored.
 *     4. callable by a signed-in (or anonymous) user when the file has run.
 *        Supabase grants EXECUTE on every new function to anon, authenticated
 *        AND (via Postgres) PUBLIC, and CREATE OR REPLACE keeps whatever grants
 *        an earlier migration gave. So all three start GRANTED, and the function
 *        drops out of scope only when this file leaves anon, authenticated and
 *        PUBLIC all revoked (e.g. a helper only server code calls, granted to
 *        service_role). GRANT/REVOKE statements are read in file order.
 *
 * WHAT COUNTS AS "CHECKED" — the accepted patterns, each grounded in main:
 *   A. role_has_institution_access(<that parameter>) — the canonical check
 *      (55 call sites on that exact argument across supabase/migrations; the
 *      shape #3983 uses). It must sit in a DECISION position: after IF / ELSIF /
 *      WHEN / WHERE / AND / OR / NOT / CASE / EXISTS / COALESCE / THEN, or
 *      feeding a THEN / RAISE — or be assigned to a variable (`v := …` or
 *      `SELECT … INTO v`) that is itself later tested in a decision position.
 *   B. a per-domain authorisation helper fn_<domain>_can_<verb>(…) that is
 *      handed the parameter, in a decision position — e.g.
 *      `IF NOT public.fn_college_leadership_can_manage(p_institution_id) THEN`
 *      (7 call sites on main). Such a helper, when it is itself new and takes an
 *      institution id, is checked by this same gate.
 *   C. the caller's accessible-institution set applied as a ROW FILTER:
 *      ai_get_accessible_institutions(…) (pins the caller to auth.uid() inside;
 *      how six ai_rpc_* catalog lookups are scoped in 20260712134500), or
 *      get_user_accessible_institutions(auth.uid()) (121 call sites on main) —
 *      used inline after IN / ANY( / a decision keyword, or stored in a variable
 *      (`v := …` / `SELECT … INTO v FROM …`) that is applied with `= ANY(v)` /
 *      `unnest(v)`. get_user_accessible_institutions handed anything OTHER than
 *      auth.uid() does not count — a caller-supplied user id there is the
 *      confused-deputy shape the July sweep closed.
 *   D. a user_institution_access READ for the calling user: a statement that
 *      selects FROM / JOINs user_institution_access with `user_id = auth.uid()`
 *      (or a variable assigned auth.uid()), e.g. ai_rpc_hr_staff (20260712233000).
 *      WRITING that table (INSERT … (user_id, institution_id)) does not count.
 *   E. row scoping with role_has_institution_access(<anything else>) in a
 *      decision position — `AND role_has_institution_access(ay.institution_id)`,
 *      `SELECT array_agg(i.id) INTO v FROM institutions i WHERE
 *      role_has_institution_access(i.id)`, or a per-element check of an ARRAY
 *      parameter (`… FROM unnest(p_institution_ids) x WHERE NOT
 *      role_has_institution_access(x)`). The rows the function returns are then
 *      limited to colleges the caller may see, whatever id was passed.
 *
 *   Audit-mode census (2026-09-23, every SECURITY DEFINER function definition in
 *   supabase/migrations that takes an institution id, counted per parameter):
 *   A 56 · B 9 · C 84 · D 3 · E 72 · none 329. The 329 are the historical
 *   backlog (many are earlier versions later replaced); PR-scoped, none fails a PR.
 *
 * DELIBERATELY NOT a check:
 *   - is_super_admin() / is_admin() / a profile's is_super_admin column. The
 *     leak above HAD one: `WHERE (is_super_admin OR institution_id = v_inst_id)`
 *     decides who sees EVERYTHING, and says nothing about whether the caller
 *     may see the institution they named. Even a function that is super-admin
 *     only (`IF NOT is_super_admin() THEN RAISE`) is not accepted, because a
 *     static scan cannot prove that check is on every path to the parameter
 *     (it may sit inside one branch). Such a function takes the hatch below with
 *     its reason — one comment line, versus another leak.
 *   - comparing the parameter with the caller's own institution
 *     (auth_institution_id() / get_current_user_institution_id() / the profile
 *     column). Zero uses on main, and "own college only" silently refuses the
 *     people role_has_institution_access() rightly admits (a CAS sibling, an
 *     institution_scope='all' role, an explicit user_institution_access grant).
 *   - staff_teaches_in_institution(p). Every main call site ORs it with
 *     role_has_institution_access(p), so it never has to stand alone here.
 *   - anything inside a comment. The body is comment-stripped first, so a
 *     commented-out check cannot clear the gate.
 *
 * ESCAPE HATCH — per function, with a reason:
 *       -- institution-param-guard: allow <reason>
 *   placed in the block of `--` comment lines DIRECTLY above the
 *   CREATE [OR REPLACE] FUNCTION line (no blank line between). The reason must
 *   be non-empty: it is the audit trail, naming why this caller may pass any
 *   institution id (e.g. "super-admin only: first statement raises for anyone
 *   else"). A hatch with no reason FAILS. Unlike the anon gate's whole-file
 *   `-- ci:allow-secdef-anon` marker, this hatch covers ONE function, because
 *   the ai_rpc_* files define dozens of functions and a file-wide waiver would
 *   have waved the leak through.
 *
 * SCOPE — PR-scoped, NOT a full-history scan (like its sibling
 * check-secdef-anon-revoke.mjs): only migration files ADDED or MODIFIED relative
 * to the base branch. Hundreds of historical functions take an institution id;
 * `--all` reports them for audit and is never run in CI.
 *
 * LIMITATIONS (static SQL-text scan):
 *   - It proves an accepted check EXISTS in a decision position (tied to the
 *     parameter for A and B; row scoping for C, D and E). It does not prove the
 *     check guards EVERY use of the parameter: a function that checks one query
 *     and leaves a second query unscoped passes. It stops the shape that leaked
 *     — no check at all — not every shape. Review still reads the body.
 *   - Functions created by dynamic SQL (EXECUTE 'CREATE FUNCTION …' inside a DO
 *     block) are not seen; only top-level CREATE FUNCTION statements are.
 *   - PG14 `BEGIN ATOMIC … END` bodies are read as the text up to the first
 *     top-level `;` (none on main today).
 *
 * WHERE THIS GATE IS RECORDED: this header, and
 * .github/workflows/institution-param-guard.yml. The repo keeps no central list
 * of CI gates — each gate documents itself in its script header and workflow.
 *
 * Usage:
 *   node scripts/ci/check-institution-param-guard.mjs                      # PR-scoped (auto-base)
 *   node scripts/ci/check-institution-param-guard.mjs --base jicate/main
 *   node scripts/ci/check-institution-param-guard.mjs --files a.sql b.sql  # explicit files (tests)
 *   node scripts/ci/check-institution-param-guard.mjs --all                # every migration (audit only)
 *   node scripts/ci/check-institution-param-guard.mjs --verbose
 *
 * Auto-base (no --base, no BASE_REF env): prefers `jicate/main` when that remote
 * exists, else `origin/main` — same reasoning as check-secdef-anon-revoke.mjs (a
 * stale `origin` returns zero changed files and the gate false-passes).
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const HATCH_RE = /--\s*institution-param-guard:\s*allow\b(.*)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// Text preparation. Every transform keeps the text the SAME LENGTH (blanked
// spans become spaces, newlines kept) so an offset found in one view is valid in
// every other view and in the raw file — which is how the hatch comment above a
// function is found.
// ─────────────────────────────────────────────────────────────────────────────

const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;

function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

/**
 * Blank SQL comments, including those inside dollar-quoted bodies (plpgsql uses
 * the same comment syntax). String literals, quoted identifiers and the
 * dollar-quote delimiters themselves are kept. Block comments nest.
 */
export function blankComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i], c2 = sql[i + 1];
    if (c === '-' && c2 === '-') {
      let j = i;
      while (j < n && sql[j] !== '\n') j++;
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let depth = 1, j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; }
        else j++;
      }
      out += blank(sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === c && sql[j + 1] === c) { j += 2; continue; }
        if (sql[j] === c) { j++; break; }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    if (c === '$') {
      DOLLAR_TAG.lastIndex = i;
      const m = DOLLAR_TAG.exec(sql);
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const innerEnd = end === -1 ? n : end;
        out += tag + blankComments(sql.slice(i + tag.length, innerEnd));
        if (end !== -1) out += tag;
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * From comment-blanked SQL, blank every string literal and dollar-quoted body
 * as well, leaving only the text that is a top-level statement. Used to find
 * CREATE FUNCTION statements and statement ends without being fooled by the
 * same words inside a function body or a string.
 */
function topLevelOnly(clean) {
  let out = '';
  let i = 0;
  const n = clean.length;
  while (i < n) {
    const c = clean[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (clean[j] === c && clean[j + 1] === c) { j += 2; continue; }
        if (clean[j] === c) { j++; break; }
        j++;
      }
      out += blank(clean.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"') {                              // an identifier: keep it (it is a name)
      let j = i + 1;
      while (j < n) {
        if (clean[j] === c && clean[j + 1] === c) { j += 2; continue; }
        if (clean[j] === c) { j++; break; }
        j++;
      }
      out += clean.slice(i, j);
      i = j;
      continue;
    }
    if (c === '$') {
      DOLLAR_TAG.lastIndex = i;
      const m = DOLLAR_TAG.exec(clean);
      if (m) {
        const tag = m[0];
        const end = clean.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        out += blank(clean.slice(i, stop));
        i = stop;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Function extraction
// ─────────────────────────────────────────────────────────────────────────────

const IDENT = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';
const CREATE_FN_RE = new RegExp(
  `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})\\s*\\(`,
  'gi'
);

function unquote(ident) {
  return ident.startsWith('"') ? ident.slice(1, -1).replace(/""/g, '"') : ident;
}

/** Index of the `)` closing the `(` at `open`, skipping nested parens and quotes. */
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c && text[j + 1] === c) { j += 2; continue; }
        if (text[j] === c) break;
        j++;
      }
      i = j;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Split a parameter list on top-level commas. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c && text[j + 1] === c) { j += 2; continue; }
        if (text[j] === c) break;
        j++;
      }
      cur += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

const INSTITUTION_PARAM_RE = /(?:^|_)institution_ids?$/i;

/** Input parameters whose name ends in institution_id(s): [{ name, isArray }]. */
export function institutionParams(paramList) {
  const out = [];
  for (const raw of splitTopLevel(paramList)) {
    let p = raw.replace(/\s+(?:default\b|=)[\s\S]*$/i, '').trim();
    let mode = 'in';
    const modeM = /^(in|out|inout|variadic)\s+/i.exec(p);
    if (modeM) { mode = modeM[1].toLowerCase(); p = p.slice(modeM[0].length).trim(); }
    if (mode === 'out') continue;
    const nameM = new RegExp(`^(${IDENT})\\s+(\\S[\\s\\S]*)$`).exec(p);
    if (!nameM) continue;                               // an unnamed parameter
    const name = unquote(nameM[1]);
    if (!INSTITUTION_PARAM_RE.test(name)) continue;
    const type = nameM[2];
    const isArray = /\[\s*\]/.test(type) || /^_/.test(type.trim()) || /_ids$/i.test(name);
    out.push({ name, isArray });
  }
  return out;
}

/** The function's body: the dollar-quoted text after AS, else the statement text. */
function functionBody(stmt) {
  const m = /\bas\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/i.exec(stmt);
  if (m) {
    const tag = m[1];
    const start = m.index + m[0].length;
    const end = stmt.indexOf(tag, start);
    return end === -1 ? stmt.slice(start) : stmt.slice(start, end);
  }
  return stmt;
}

/** Is the contiguous `--` comment block directly above `offset` carrying the hatch? */
function hatchAbove(raw, offset) {
  const lineStart = raw.lastIndexOf('\n', offset - 1) + 1;
  const before = raw.slice(0, lineStart).split('\n');
  before.pop();                                          // the empty tail after the last \n
  for (let k = before.length - 1; k >= 0; k--) {
    const line = before[k].trim();
    if (!line.startsWith('--')) break;
    const m = HATCH_RE.exec(line);
    if (m) return { present: true, reason: m[1].replace(/^[\s:—–-]+/, '').trim() };
  }
  return { present: false, reason: '' };
}

/**
 * Every function defined at top level in this file:
 * [{ name, offset, line, secdef, trigger, params, body, stmt }]
 */
export function extractFunctions(raw) {
  const clean = blankComments(raw);
  const top = topLevelOnly(clean);
  const fns = [];
  CREATE_FN_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_FN_RE.exec(top)) !== null) {
    const start = m.index;
    const open = m.index + m[0].length - 1;
    const close = matchParen(clean, open);
    if (close === -1) continue;
    const semi = top.indexOf(';', close);
    const end = semi === -1 ? top.length : semi;
    const stmt = clean.slice(start, end);
    const header = clean.slice(close + 1, end);
    const headerTop = top.slice(close + 1, end);
    fns.push({
      name: unquote(m[1]),
      offset: start,
      line: raw.slice(0, start).split('\n').length,
      secdef: /\bsecurity\s+definer\b/i.test(headerTop),
      trigger: /\breturns\s+(?:setof\s+)?(?:event_)?trigger\b/i.test(headerTop),
      params: institutionParams(clean.slice(open + 1, close)),
      body: functionBody(header),
      stmt,
    });
    CREATE_FN_RE.lastIndex = end;
  }
  return fns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reachability — who can call the function once this file has run.
// ─────────────────────────────────────────────────────────────────────────────

/** Split comment-blanked SQL on top-level `;`. */
function topLevelStatements(clean) {
  const top = topLevelOnly(clean);
  const out = [];
  let from = 0;
  for (let i = 0; i < top.length; i++) {
    if (top[i] === ';') { out.push(clean.slice(from, i)); from = i + 1; }
  }
  if (clean.slice(from).trim()) out.push(clean.slice(from));
  return out.map(s => s.trim()).filter(Boolean);
}

function granteeSlots(stmt, revoke) {
  const re = new RegExp(`\\b${revoke ? 'from' : 'to'}\\b`, 'gi');
  let mm, last = -1;
  while ((mm = re.exec(stmt)) !== null) last = mm.index + mm[0].length;
  if (last === -1) return { anon: false, authenticated: false, public: false };
  const tail = stmt.slice(last);
  return {
    anon: /\banon\b/i.test(tail),
    authenticated: /\bauthenticated\b/i.test(tail),
    public: /\bpublic\b/i.test(tail),
  };
}

/** Roles (anon / authenticated / PUBLIC) still able to EXECUTE `fn` after the file runs. */
export function reachableBy(statements, fn) {
  const esc = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namesFn = new RegExp(`\\bon\\s+function\\b[\\s\\S]*?(?:^|[\\s."])${esc}(?:"|\\s*\\(|\\s*,|\\s*$|\\s+(?:from|to)\\b)`, 'i');
  const allInSchema = /\bon\s+all\s+functions\s+in\s+schema\b/i;
  const state = { anon: true, authenticated: true, public: true };
  for (const stmt of statements) {
    const head = /^(grant|revoke)\b/i.exec(stmt);
    if (!head) continue;
    if (!/\bexecute\b|\ball\b/i.test(stmt)) continue;
    if (!namesFn.test(stmt) && !allInSchema.test(stmt)) continue;
    const revoke = head[1].toLowerCase() === 'revoke';
    const slots = granteeSlots(stmt, revoke);
    for (const k of Object.keys(slots)) if (slots[k]) state[k] = !revoke;
  }
  return Object.keys(state).filter(k => state[k]).map(k => (k === 'public' ? 'PUBLIC' : k));
}

// ─────────────────────────────────────────────────────────────────────────────
// The check itself
// ─────────────────────────────────────────────────────────────────────────────

const DECISION = String.raw`\b(?:if|elsif|elseif|when|while|and|or|not|where|case|assert|exists|coalesce|then|having|using|check)\b`;

function inDecision(body, predSrc) {
  if (new RegExp(`${DECISION}[^;]{0,200}?${predSrc}`, 'i').test(body)) return true;
  if (new RegExp(`${predSrc}[^;]{0,200}?\\b(?:then|raise)\\b`, 'i').test(body)) return true;
  return false;
}

/** A predicate ASSIGNED to a variable that is later TESTED counts as a check. */
function assignedThenTested(body, predSrc) {
  const vars = new Set();
  const assign = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*:=\\s*[^;]{0,200}?${predSrc}`, 'gi');
  let m;
  while ((m = assign.exec(body)) !== null) vars.add(m[1]);
  const selectInto = new RegExp(`\\bselect\\b[^;]{0,200}?${predSrc}[^;]{0,200}?\\binto\\s+([A-Za-z_][A-Za-z0-9_]*)`, 'gi');
  while ((m = selectInto.exec(body)) !== null) vars.add(m[1]);
  for (const v of vars) {
    if (inDecision(body, `\\b${v}\\b`)) return true;
  }
  return false;
}

/**
 * Which accepted pattern (A–E, see the header) guards `param` in `body`, or null.
 * `body` is comment-blanked already.
 */
export function guardFor(body, param) {
  const P = param.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ARG = `\\(\\s*${P}(?:\\s*::\\s*uuid)?\\s*\\)`;
  const RHIA = String.raw`(?:public\s*\.\s*)?role_has_institution_access\s*`;

  // A. role_has_institution_access(<param>) — the check tied to the parameter.
  if (!param.isArray) {
    const pred = `${RHIA}${ARG}`;
    if (inDecision(body, pred) || assignedThenTested(body, pred)) return 'A';
  }

  // B. fn_<domain>_can_<verb>(…, <param>, …)
  const canHelper = String.raw`(?:public\s*\.\s*)?fn_[a-z0-9_]*_can_[a-z0-9_]+\s*\([^;()]*?\b` + P + String.raw`\b[^;()]*\)`;
  if (inDecision(body, canHelper) || assignedThenTested(body, canHelper)) return 'B';

  // C. the caller's accessible-institution set, applied as a row filter.
  //    ai_get_accessible_institutions(…) pins the caller to auth.uid() inside;
  //    get_user_accessible_institutions counts ONLY when handed auth.uid() — a
  //    caller-supplied user id there is the confused-deputy shape.
  const HELPER = String.raw`(?:(?:public\s*\.\s*)?ai_get_accessible_institutions\s*\(|(?:public\s*\.\s*)?get_user_accessible_institutions\s*\(\s*auth\s*\.\s*uid\s*\(\s*\)\s*\))`;
  if (new RegExp(String.raw`(?:` + DECISION + String.raw`|\bin\b|\bany\s*\(|\bunnest\s*\()[^;]{0,200}?` + HELPER, 'i').test(body)) return 'C';
  const setVars = new Set();
  let m;
  const assignRe = new RegExp(String.raw`\b([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*` + HELPER, 'gi');
  while ((m = assignRe.exec(body)) !== null) setVars.add(m[1]);
  const intoRe = new RegExp(String.raw`\binto\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+` + HELPER, 'gi');
  while ((m = intoRe.exec(body)) !== null) setVars.add(m[1]);
  for (const v of setVars) {
    if (new RegExp(String.raw`\b(?:any|unnest)\s*\(\s*` + v + String.raw`\s*\)`, 'i').test(body)) return 'C';
  }

  // D. a user_institution_access READ for the calling user: a statement that
  //    selects FROM / JOINs user_institution_access with `user_id = auth.uid()`
  //    (or a variable assigned auth.uid()) — typically building the caller's
  //    allowed set, then filtering on it. A statement that WRITES the table
  //    (INSERT … (user_id, institution_id)) is not a read and does not count:
  //    that is what grant_user_institution_access does, for any user named.
  const uidVars = ['auth\\s*\\.\\s*uid\\s*\\(\\s*\\)'];
  const uidAssign = /\b([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*auth\s*\.\s*uid\s*\(\s*\)/gi;
  while ((m = uidAssign.exec(body)) !== null) uidVars.push(`\\b${m[1]}\\b`);
  const uiaRead = new RegExp(
    String.raw`\b(?:from|join)\s+(?:public\s*\.\s*)?user_institution_access\b[^;]*?\buser_id\s*=\s*(?:` + uidVars.join('|') + ')',
    'i'
  );
  if (uiaRead.test(body)) return 'D';

  // E. row scoping: role_has_institution_access(<something else>) filtering the
  //    rows the function reads, e.g. `AND role_has_institution_access(ay.institution_id)`,
  //    building the caller's set with
  //    `SELECT array_agg(i.id) INTO v FROM institutions i WHERE role_has_institution_access(i.id)`,
  //    or checking each element of an array parameter.
  if (inDecision(body, `${RHIA}\\(`)) return 'E';
  return null;
}

/**
 * Check one migration file's text. Returns { checked, passed, violations, hatched }.
 * violations: [{ fn, param, line, reason: 'unguarded' | 'empty-hatch', reachable }]
 */
export function checkSql(raw) {
  const result = { checked: 0, passed: 0, hatched: [], violations: [] };
  const clean = blankComments(raw);
  const statements = topLevelStatements(clean);
  // EVERY definition is checked, including an earlier one a later CREATE OR
  // REPLACE in the same file supersedes: the earlier body is live between the two
  // statements, and a file that needs the unguarded one briefly can say so with
  // the hatch.
  for (const f of extractFunctions(raw)) {
    if (!f.secdef || f.trigger || f.params.length === 0) continue;
    const reachable = reachableBy(statements, f.name);
    if (reachable.length === 0) continue;
    result.checked++;
    const hatch = hatchAbove(raw, f.offset);
    if (hatch.present) {
      if (hatch.reason) {
        result.passed++;
        result.hatched.push({ fn: f.name, line: f.line, reason: hatch.reason });
      } else {
        result.violations.push({ fn: f.name, param: f.params.map(p => p.name).join(', '), line: f.line, reason: 'empty-hatch', reachable });
      }
      continue;
    }
    const unguarded = f.params.filter(p => guardFor(f.body, p) === null);
    if (unguarded.length === 0) {
      result.passed++;
    } else {
      for (const p of unguarded) {
        result.violations.push({ fn: f.name, param: p.name, line: f.line, reason: 'unguarded', reachable });
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch { return ''; }
}

function defaultBaseRef() {
  const remotes = sh('git remote').split('\n').filter(Boolean);
  if (remotes.includes('jicate') && sh('git rev-parse --verify --quiet jicate/main')) return 'jicate/main';
  return 'origin/main';
}

function targetFiles(argv, base) {
  const filesIdx = argv.indexOf('--files');
  if (filesIdx !== -1) return argv.slice(filesIdx + 1).filter(a => !a.startsWith('--'));
  const MIG_DIR = 'supabase/migrations/';
  if (argv.includes('--all')) {
    return sh(`git ls-files ${MIG_DIR}`).split('\n').filter(f => f.endsWith('.sql'));
  }
  let resolved = base;
  for (const cand of [base, 'jicate/main', 'origin/main', 'main']) {
    if (sh(`git rev-parse --verify --quiet ${cand}`)) { resolved = cand; break; }
  }
  const merge = sh(`git merge-base ${resolved} HEAD`) || resolved;
  return sh(`git diff --name-only --diff-filter=AM ${merge}...HEAD -- ${MIG_DIR}`)
    .split('\n').filter(f => f.endsWith('.sql'));
}

function main() {
  const argv = process.argv.slice(2);
  const VERBOSE = argv.includes('--verbose');
  const baseIdx = argv.indexOf('--base');
  const BASE = baseIdx !== -1 ? argv[baseIdx + 1] : (process.env.BASE_REF || defaultBaseRef());

  const files = targetFiles(argv, BASE).filter(Boolean);
  if (files.length === 0) {
    console.log(`${GREEN}✓${RESET} No added or changed migration files to check (base: ${BASE}).`);
    process.exit(0);
  }

  let checked = 0, passed = 0;
  const violations = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const r = checkSql(readFileSync(file, 'utf8'));
    checked += r.checked;
    passed += r.passed;
    for (const v of r.violations) violations.push({ file, ...v });
    if (VERBOSE) {
      for (const h of r.hatched) console.log(`${DIM}allowed by hatch: ${h.fn} (${file}:${h.line}) — ${h.reason}${RESET}`);
    }
  }

  console.log(`\n${BOLD}Institution-id parameter guard${RESET} — ${checked} SECURITY DEFINER function(s) taking an institution id checked, ${passed} guarded.`);

  if (violations.length === 0) {
    console.log(`${GREEN}✓ Every new or changed SECURITY DEFINER function that takes an institution id checks the caller's access to it.${RESET}`);
    process.exit(0);
  }

  console.error(`\n${RED}${BOLD}✗ ${violations.length} problem(s): a lookup takes an institution id from the caller and never checks the caller may see that institution.${RESET}\n`);
  for (const v of violations) {
    console.error(`  ${RED}•${RESET} File:      ${v.file} (line ${v.line})`);
    console.error(`    Function:  ${BOLD}${v.fn}${RESET}`);
    console.error(`    Parameter: ${v.param}`);
    if (v.reason === 'empty-hatch') {
      console.error(`    Problem:   it carries "-- institution-param-guard: allow" with NO reason. Write why this caller may pass any institution id, or remove the line and add the check.`);
    } else {
      console.error(`    Problem:   anyone who can call it (${v.reachable.join(', ')}) can pass ANOTHER college's id and read that college's data.`);
      console.error(`    Fix:       before using ${v.param}, refuse it unless public.role_has_institution_access(${v.param}) is true.`);
    }
    console.error('');
  }
  console.error(`${YELLOW}How to fix (the shape PR #3983 uses):${RESET}
  ${DIM}IF p_institution_id IS NOT NULL AND NOT public.role_has_institution_access(p_institution_id) THEN${RESET}
  ${DIM}  RETURN jsonb_build_object('success', false, 'error',${RESET}
  ${DIM}    jsonb_build_object('code', 'FORBIDDEN_INSTITUTION', 'message', 'You do not have access to that institution.'));${RESET}
  ${DIM}END IF;${RESET}
  (or RAISE EXCEPTION — refuse out loud; never quietly swap in the caller's own college.)

If ONLY server code calls it, take it away from signed-in users instead:
  ${DIM}REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM anon, authenticated, PUBLIC;${RESET}

If every caller may genuinely pass any institution id, say why on the line above CREATE FUNCTION:
  ${DIM}-- institution-param-guard: allow <reason>${RESET}

Why this gate exists: on 2026-09-23 a one-college head of department read another
college's 1,511 learners through ai_rpc_students_summary, which trusted this parameter.
See scripts/ci/check-institution-param-guard.mjs header.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
