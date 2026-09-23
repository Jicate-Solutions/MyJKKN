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
 *     1. SECURITY DEFINER — said in the CREATE, or set later by
 *        `ALTER FUNCTION <name>(…) SECURITY DEFINER` in any of the PR's changed
 *        migration files. For an ALTER, the body checked is the latest CREATE of
 *        that function (same signature) that comes BEFORE the ALTER in those
 *        files; when the PR does not contain that body, the gate WARNS that it
 *        could not check it. (A SECURITY INVOKER function is bound by the
 *        caller's own row-level security, so a caller-supplied id cannot widen
 *        it.)
 *     2. not a trigger function (RETURNS trigger — a caller cannot pass it
 *        arguments);
 *     3. has an INPUT parameter whose NAME marks an institution id:
 *          - any name ending in `institution_id` / `institution_ids` —
 *            p_institution_id, p_institution_ids uuid[], p_target_institution_id,
 *            a bare institution_id;
 *          - p_institution, p_institutions_id, p_inst, p_inst_id and their plural
 *            forms: `^p_inst(itution)?s?(_ids?)?$`;
 *          - p_college_id / p_college_ids.
 *        Measured over every SECURITY DEFINER definition on main (2026-09-23):
 *        the last two lines add p_institution (6 definitions), p_inst (3),
 *        p_institutions_id (2) and p_college_id (1). NOT matched: a bare
 *        `inst_id` (is_business_day / add_business_hours) and boolean flags such
 *        as p_include_non_billing_institutions or p_within_college.
 *        OUT parameters and RETURNS TABLE (...) columns are not inputs and are
 *        ignored. An UNNAMED parameter (used as $1, $2 …) cannot be judged by
 *        its name, so the gate WARNS that it could not check it (none on main).
 *     4. callable by a signed-in (or anonymous) user when the file has run.
 *        Supabase grants EXECUTE on every new function to anon, authenticated
 *        AND (via Postgres) PUBLIC, and CREATE OR REPLACE keeps whatever grants
 *        an earlier migration gave. So all three start GRANTED, and the function
 *        drops out of scope only when this file leaves anon, authenticated and
 *        PUBLIC all revoked (e.g. a helper only server code calls, granted to
 *        service_role). GRANT/REVOKE statements are read in file order and
 *        matched by SIGNATURE — the name plus the input argument types, with
 *        spellings normalised (int = integer = int4, uuid[] = _uuid,
 *        numeric(10,2) = numeric …) — so revoking one overload never takes a
 *        different overload out of scope. A GRANT/REVOKE that names the
 *        function with no argument list is matched by name; when the function
 *        ends up out of scope and such a match was involved, the gate WARNS
 *        (in scope, a wrong match can only cause a false red, never a false
 *        green, so it is not warned).
 *
 * WHAT COUNTS AS "CHECKED" — the accepted patterns, each grounded in main:
 *   A. role_has_institution_access(<that parameter>) — the canonical check
 *      (55 call sites on that exact argument across supabase/migrations; the
 *      shape #3983 uses). It must sit in a DECISION position: after IF / ELSIF /
 *      WHEN / WHERE / AND / OR / NOT / CASE / EXISTS / HAVING, or feeding a
 *      THEN / RAISE — or be assigned to a variable (`v := …` or
 *      `SELECT … INTO v`) that is itself later tested in a decision position.
 *      COALESCE( and THEN do not count as decision words BEFORE the call:
 *      `'allowed', COALESCE(role_has_institution_access(p), false)` computes a
 *      value, and a value that is only returned decides nothing.
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
 *   E. role_has_institution_access(<anything else>) in a decision position —
 *      `AND role_has_institution_access(ay.institution_id)`,
 *      `SELECT array_agg(i.id) INTO v FROM institutions i WHERE
 *      role_has_institution_access(i.id)`, or a per-element check of an ARRAY
 *      parameter (`… FROM unnest(p_institution_ids) x WHERE NOT
 *      role_has_institution_access(x)`). This proves that SOME rows the function
 *      reads are limited to colleges the caller may see. It does NOT prove that
 *      the query reading the parameter is one of them: an unrelated check
 *      anywhere in the body satisfies it — even `IF NOT
 *      role_has_institution_access(<the caller's own college>) THEN RAISE`,
 *      which is always true. That is why E, like C and D, passes with a WARNING
 *      unless the check is tied to the parameter (next paragraph).
 *
 *   TIED TO THE PARAMETER, OR ONLY ROW-SCOPED. A and B inspect the parameter
 *   itself. So do these forms, which pass SILENTLY:
 *     - role_has_institution_access(v) where v holds the parameter
 *       (`v := <param>` or `v := COALESCE(<param>, …)`, the parameter first);
 *     - the parameter tested against the caller's set (C): `<param> = ANY(<set>)`,
 *       `<param> [NOT] IN (SELECT … <helper> …)`, `<param> <@ <set>`;
 *     - a user_institution_access read for the caller (D) whose statement names
 *       the parameter;
 *     - each element of an array parameter checked (E): `unnest(<param>)` and a
 *       role_has_institution_access( call in a decision position in one statement.
 *   A parameter that passes ONLY through row scoping (C, D or E without one of
 *   these) still PASSES — about 160 legitimate historical functions are scoped
 *   that way and must not be pushed into hatch lines — but the gate prints a
 *   WARNING naming the file, the function and the parameter: "passes because
 *   some rows are scoped; check every query that uses <param> is scoped too".
 *
 * WARNINGS never fail the job. They print after the summary line and, on GitHub
 * Actions, also as `::warning` annotations so they show on the PR's changed
 * lines. Four kinds: a parameter that passes only through row scoping · an
 * unnamed parameter · an ALTER … SECURITY DEFINER whose body is not in the PR ·
 * a name-only match (a GRANT/REVOKE that takes a function out of scope, or an
 * ALTER tied to its body, by name alone).
 *
 *   Audit-mode census (repair round 1, 2026-09-23 — every SECURITY DEFINER,
 *   non-trigger function definition in supabase/migrations that takes an
 *   institution id, counted per parameter by first matching pattern, grants
 *   ignored): A 56 · B 9 · C 84 · D 3 · E 72 · none 342. The widened names
 *   added 12 parameters, all unguarded (none was 330 before). Dropping
 *   COALESCE( and THEN from the decision words changed 0 of the 554 earlier
 *   classifications. Of the 159 row-scoped passes (C/D/E), 9 are tied to the
 *   parameter; 150 would print the warning if their file changed. The "none"
 *   are the historical backlog (many are earlier versions later replaced);
 *   PR-scoped, none fails a PR.
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
 *   CREATE [OR REPLACE] FUNCTION line (no blank line between) — or, for a
 *   function made SECURITY DEFINER by ALTER FUNCTION, above that ALTER line. The
 *   reason must be non-empty: it is the audit trail, naming why this caller may
 *   pass any institution id (e.g. "super-admin only: first statement raises for
 *   anyone else"). A hatch with no reason FAILS. Unlike the anon gate's
 *   whole-file `-- ci:allow-secdef-anon` marker, this hatch covers ONE
 *   function, because the ai_rpc_* files define dozens of functions and a
 *   file-wide waiver would have waved the leak through.
 *
 * SCOPE — PR-scoped, NOT a full-history scan (like its sibling
 * check-secdef-anon-revoke.mjs): only migration files ADDED, MODIFIED, or RENAMED
 * AND EDITED (git status R below 100 % similarity) relative to the base branch.
 * A pure rename changes no SQL and is not re-read. Hundreds of historical
 * functions take an institution id; `--all` reports them for audit and is never
 * run in CI.
 *
 * LIMITATIONS (static SQL-text scan):
 *   - Row scoping (C, D, E) proves some rows are scoped, not that every query
 *     reading the parameter is: WARNED, not failed (above). The gate stops the
 *     shape that leaked — no check at all — not every shape. Review still reads
 *     the body.
 *   - A check folded into a larger boolean that is only RETURNED
 *     (`'allowed', x OR role_has_institution_access(p)`) still reads as a
 *     decision, because AND / OR / NOT stay decision words (long WHERE clauses
 *     need them). The COALESCE(…, false) and THEN forms are caught.
 *   - Parameter names outside the list above (e.g. a bare `inst_id`) are not
 *     recognised, and unnamed parameters are not checked (WARNED).
 *   - GRANT/REVOKE are read in file order from the file's first statement, so a
 *     REVOKE placed BEFORE a DROP FUNCTION + CREATE of the same function is
 *     still applied, although the re-created function gets the default grants
 *     back.
 *   - Signatures are compared by normalised type names. A type the normaliser
 *     cannot compare (`%TYPE`, `interval day to second`) falls back to a
 *     name-only match (WARNED when it takes the function out of scope). A type
 *     spelled two ways it does not know (a domain vs its base type) reads as a
 *     different signature, which keeps the function IN scope — a false red at
 *     worst, never a false green.
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
 *   node scripts/ci/check-institution-param-guard.mjs --files a.sql b.sql  # explicit files, read in this order (tests)
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
 * CREATE / ALTER FUNCTION statements and statement ends without being fooled by
 * the same words inside a function body or a string.
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
// Parameters and signatures
// ─────────────────────────────────────────────────────────────────────────────

const IDENT = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';
const CREATE_FN_RE = new RegExp(
  `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})\\s*\\(`,
  'gi'
);
const ALTER_FN_RE = new RegExp(
  `\\balter\\s+(?:function|routine)\\s+(?:${IDENT}\\s*\\.\\s*)?(${IDENT})`,
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

/**
 * Parameter names that carry an institution id from the caller (see the header,
 * WHICH FUNCTIONS ARE CHECKED, 3). Anchored, so p_instance_id, p_installment_id,
 * p_instrument_id and p_include_non_billing_institutions do not match.
 */
const INSTITUTION_PARAM_RES = [
  /(?:^|_)institution_ids?$/i,               // p_institution_id(s), p_target_institution_id, institution_id
  /^p_inst(?:itution)?s?(?:_ids?)?$/i,       // p_institution, p_institutions_id, p_inst, p_inst_id (+ plurals)
  /^p_college_ids?$/i,                       // p_college_id(s)
];

export function isInstitutionParamName(name) {
  return INSTITUTION_PARAM_RES.some(re => re.test(name));
}

/** Rewrite multi-word type names to one token, so "name type" can be told apart from "type". */
function oneWordTypes(text) {
  return text
    .replace(/\bdouble\s+precision\b/gi, 'float8')
    .replace(/\bcharacter\s+varying\b/gi, 'varchar')
    .replace(/\bbit\s+varying\b/gi, 'varbit')
    .replace(/\btimestamp\s*(?:\(\s*\d+\s*\))?\s+with\s+time\s+zone\b/gi, 'timestamptz')
    .replace(/\btimestamp\s*(?:\(\s*\d+\s*\))?\s+without\s+time\s+zone\b/gi, 'timestamp')
    .replace(/\btime\s*(?:\(\s*\d+\s*\))?\s+with\s+time\s+zone\b/gi, 'timetz')
    .replace(/\btime\s*(?:\(\s*\d+\s*\))?\s+without\s+time\s+zone\b/gi, 'time');
}

/** One entry of a parameter list → { mode, name (null when unnamed), type }. DEFAULT is dropped. */
function parseParam(raw) {
  let p = raw.replace(/\s+(?:default\b|=)[\s\S]*$/i, '').trim();
  let mode = 'in';
  const modeM = /^(in|out|inout|variadic)\s+/i.exec(p);
  if (modeM) { mode = modeM[1].toLowerCase(); p = p.slice(modeM[0].length).trim(); }
  p = oneWordTypes(p);
  const nameM = new RegExp(`^(${IDENT})\\s+(\\S[\\s\\S]*)$`).exec(p);
  if (nameM) return { mode, name: unquote(nameM[1]), type: nameM[2].trim() };
  return { mode, name: null, type: p };
}

/** Input parameters (OUT excluded — Postgres leaves them out of a function's identity). */
function inputParams(paramList) {
  return splitTopLevel(paramList).map(parseParam).filter(p => p.mode !== 'out');
}

const TYPE_ALIASES = {
  int: 'int4', integer: 'int4', smallint: 'int2', bigint: 'int8',
  bool: 'bool', boolean: 'bool', real: 'float4', float: 'float8',
  decimal: 'numeric', character: 'bpchar', char: 'bpchar',
};

/**
 * One type, normalised for signature comparison — or null when the text cannot
 * be compared (a %TYPE reference, an unknown multi-word type).
 */
export function normType(type) {
  let t = oneWordTypes(type.trim().toLowerCase());
  if (!t || /%\s*(?:row)?type\b/.test(t)) return null;
  let array = false;
  const dims = /(?:\s*\[\s*\d*\s*\])+$/.exec(t);
  if (dims) { array = true; t = t.slice(0, dims.index); }
  if (/\s+array$/.test(t)) { array = true; t = t.replace(/\s+array$/, ''); }
  t = t.replace(/\s*\([^()]*\)$/, '');                     // typmod: numeric(10,2), varchar(50)
  t = t.replace(/"/g, '').replace(/^(?:public|pg_catalog)\s*\.\s*/, '');
  if (t.startsWith('_')) { array = true; t = t.slice(1); }  // _uuid is uuid[]
  if (Object.hasOwn(TYPE_ALIASES, t)) t = TYPE_ALIASES[t];
  if (!/^[a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?$/.test(t)) return null;
  return array ? `${t}[]` : t;
}

/** The normalised input argument types — a function's identity for GRANT / REVOKE / ALTER — or null. */
export function argSignature(paramList) {
  const types = inputParams(paramList).map(p => normType(p.type));
  return types.includes(null) ? null : types;
}

function sameSignature(a, b) {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Input parameters whose name marks an institution id: [{ name, isArray }]. */
export function institutionParams(paramList) {
  const out = [];
  for (const p of inputParams(paramList)) {
    if (!p.name || !isInstitutionParamName(p.name)) continue;
    const isArray = /\[\s*\]/.test(p.type) || /^_/.test(p.type.trim()) || /\barray\b/i.test(p.type) || /_ids$/i.test(p.name);
    out.push({ name: p.name, isArray });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Function extraction
// ─────────────────────────────────────────────────────────────────────────────

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

function lineOf(raw, offset) {
  return raw.slice(0, offset).split('\n').length;
}

/**
 * Every function defined at top level in this file:
 * [{ name, offset, line, secdef, trigger, params, unnamed, argTypes, body, stmt }]
 */
export function extractFunctions(raw) {
  const clean = blankComments(raw);
  const top = topLevelOnly(clean);
  const fns = [];
  const re = new RegExp(CREATE_FN_RE.source, 'gi');
  let m;
  while ((m = re.exec(top)) !== null) {
    const start = m.index;
    const open = m.index + m[0].length - 1;
    const close = matchParen(clean, open);
    if (close === -1) continue;
    const semi = top.indexOf(';', close);
    const end = semi === -1 ? top.length : semi;
    const stmt = clean.slice(start, end);
    const header = clean.slice(close + 1, end);
    const headerTop = top.slice(close + 1, end);
    const paramText = clean.slice(open + 1, close);
    fns.push({
      name: unquote(m[1]),
      offset: start,
      line: lineOf(raw, start),
      secdef: /\bsecurity\s+definer\b/i.test(headerTop),
      trigger: /\breturns\s+(?:setof\s+)?(?:event_)?trigger\b/i.test(headerTop),
      params: institutionParams(paramText),
      unnamed: inputParams(paramText).filter(p => !p.name).length,
      argTypes: argSignature(paramText),
      body: functionBody(header),
      stmt,
    });
    re.lastIndex = end;
  }
  return fns;
}

/**
 * Every top-level `ALTER FUNCTION|ROUTINE <name>[(<args>)] … SECURITY DEFINER`:
 * [{ name, argTypes, paramNames, offset, line }]. argTypes is null when the
 * statement gives no argument list (or one the gate cannot compare);
 * paramNames is null unless every argument in the list is named.
 */
export function extractSecdefAlters(raw) {
  const clean = blankComments(raw);
  const top = topLevelOnly(clean);
  const out = [];
  const re = new RegExp(ALTER_FN_RE.source, 'gi');
  let m;
  while ((m = re.exec(top)) !== null) {
    const semi = top.indexOf(';', m.index);
    const end = semi === -1 ? top.length : semi;
    re.lastIndex = end;
    let after = m.index + m[0].length;
    let argTypes = null, paramNames = null;
    const ws = /^\s*/.exec(top.slice(after))[0].length;
    if (top[after + ws] === '(') {
      const close = matchParen(clean, after + ws);
      if (close !== -1 && close < end) {
        const list = clean.slice(after + ws + 1, close);
        argTypes = argSignature(list);
        const ps = inputParams(list);
        paramNames = ps.every(p => p.name) ? ps.map(p => p.name) : null;
        after = close + 1;
      }
    }
    if (!/\bsecurity\s+definer\b/i.test(top.slice(after, end))) continue;
    out.push({ name: unquote(m[1]), argTypes, paramNames, offset: m.index, line: lineOf(raw, m.index) });
  }
  return out;
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

/**
 * The functions a GRANT/REVOKE … ON FUNCTION list names: [{ name, argTypes }].
 * argTypes is null when the item has no argument list, or one the gate cannot
 * compare — such an item is matched by name only.
 */
function grantTargets(stmt) {
  const on = /\bon\s+(?:function|routine|procedure)\s+/i.exec(stmt);
  if (!on) return [];
  const from = on.index + on[0].length;
  let depth = 0, end = stmt.length;
  for (let i = from; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && /\s/.test(c) && /^\s+(?:to|from)\b/i.test(stmt.slice(i, i + 12))) { end = i; break; }
  }
  const out = [];
  const itemRe = new RegExp(`^(?:${IDENT}\\s*\\.\\s*)?(${IDENT})\\s*(?:\\(([\\s\\S]*)\\))?$`);
  for (const item of splitTopLevel(stmt.slice(from, end))) {
    const m = itemRe.exec(item.trim());
    if (!m) continue;
    out.push({ name: unquote(m[1]), argTypes: m[2] === undefined ? null : argSignature(m[2]) });
  }
  return out;
}

/**
 * Roles (anon / authenticated / PUBLIC) still able to EXECUTE the function after
 * the statements run, matched by signature when both sides give one.
 * Returns { roles, byNameOnly } — byNameOnly: some statement that changed the
 * answer was matched by name alone.
 */
export function reachability(statements, fn, argTypes = null) {
  const state = { anon: true, authenticated: true, public: true };
  const want = fn.toLowerCase();
  let byNameOnly = false;
  for (const stmt of statements) {
    const head = /^(grant|revoke)\b/i.exec(stmt);
    if (!head) continue;
    if (!/\bexecute\b|\ball\b/i.test(stmt)) continue;
    let applies = false, nameOnly = false;
    if (/\bon\s+all\s+(?:functions|routines)\s+in\s+schema\b/i.test(stmt)) {
      applies = true;
    } else {
      for (const t of grantTargets(stmt)) {
        if (t.name.toLowerCase() !== want) continue;
        if (t.argTypes && argTypes) {
          if (sameSignature(t.argTypes, argTypes)) applies = true;
        } else {
          applies = true;
          nameOnly = true;
        }
      }
    }
    if (!applies) continue;
    if (nameOnly) byNameOnly = true;
    const revoke = head[1].toLowerCase() === 'revoke';
    const slots = granteeSlots(stmt, revoke);
    for (const k of Object.keys(slots)) if (slots[k]) state[k] = !revoke;
  }
  return {
    roles: Object.keys(state).filter(k => state[k]).map(k => (k === 'public' ? 'PUBLIC' : k)),
    byNameOnly,
  };
}

/** Roles (anon / authenticated / PUBLIC) still able to EXECUTE `fn` after the file runs. */
export function reachableBy(statements, fn, argTypes = null) {
  return reachability(statements, fn, argTypes).roles;
}

// ─────────────────────────────────────────────────────────────────────────────
// The check itself
// ─────────────────────────────────────────────────────────────────────────────

// Words that put a predicate in a DECISION position when they come BEFORE it in
// the same statement. COALESCE( and THEN are deliberately absent: they precede
// a computed VALUE (`COALESCE(role_has_institution_access(p), false)`), and a
// value that is only returned decides nothing (reviewer finding, repair round 1).
const DECISION = String.raw`\b(?:if|elsif|elseif|when|while|and|or|not|where|case|assert|exists|having|using|check)\b`;
const RHIA = String.raw`(?:public\s*\.\s*)?role_has_institution_access\s*`;
const HELPER = String.raw`(?:(?:public\s*\.\s*)?ai_get_accessible_institutions\s*\(|(?:public\s*\.\s*)?get_user_accessible_institutions\s*\(\s*auth\s*\.\s*uid\s*\(\s*\)\s*\))`;

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const decides = (body, predSrc) => inDecision(body, predSrc) || assignedThenTested(body, predSrc);

/** role_has_institution_access(<name>), the name given as regex source. */
const rhiaOf = nameSrc => `${RHIA}\\(\\s*${nameSrc}(?:\\s*::\\s*uuid)?\\s*\\)`;

/** fn_<domain>_can_<verb>(…, <name>, …) */
const canHelperWith = P =>
  String.raw`(?:public\s*\.\s*)?fn_[a-z0-9_]*_can_[a-z0-9_]+\s*\([^;()]*?\b` + P + String.raw`\b[^;()]*\)`;

/** Variables assigned the caller's accessible-institution set (pattern C). */
function setVariables(body) {
  const vars = new Set();
  let m;
  const assignRe = new RegExp(String.raw`\b([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*` + HELPER, 'gi');
  while ((m = assignRe.exec(body)) !== null) vars.add(m[1]);
  const intoRe = new RegExp(String.raw`\binto\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+` + HELPER, 'gi');
  while ((m = intoRe.exec(body)) !== null) vars.add(m[1]);
  return vars;
}

/** A read of user_institution_access for the calling user (pattern D). */
function uiaReadRe(body) {
  const uidVars = ['auth\\s*\\.\\s*uid\\s*\\(\\s*\\)'];
  const uidAssign = /\b([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*auth\s*\.\s*uid\s*\(\s*\)/gi;
  let m;
  while ((m = uidAssign.exec(body)) !== null) uidVars.push(`\\b${m[1]}\\b`);
  return new RegExp(
    String.raw`\b(?:from|join)\s+(?:public\s*\.\s*)?user_institution_access\b[^;]*?\buser_id\s*=\s*(?:` + uidVars.join('|') + ')',
    'i'
  );
}

/** Variables that hold the parameter: `v := <param>` or `v := COALESCE(<param>, …)`. */
function aliasesOf(body, P) {
  const out = [];
  const re = new RegExp(String.raw`\b([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(?:coalesce\s*\(\s*)?\b` + P + String.raw`\b(?:\s*::\s*uuid)?\s*[,;)]`, 'gi');
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[1].toLowerCase() !== P.toLowerCase()) out.push(`\\b${m[1]}\\b`);
  }
  return out;
}

/**
 * Which accepted pattern (A–E, see the header) guards `param` in `body`, or null.
 * `body` is comment-blanked already.
 */
export function guardFor(body, param) {
  const P = escRe(param.name);

  // A. role_has_institution_access(<param>) — the check tied to the parameter.
  if (!param.isArray && decides(body, rhiaOf(P))) return 'A';

  // B. fn_<domain>_can_<verb>(…, <param>, …)
  if (decides(body, canHelperWith(P))) return 'B';

  // C. the caller's accessible-institution set, applied as a row filter.
  //    ai_get_accessible_institutions(…) pins the caller to auth.uid() inside;
  //    get_user_accessible_institutions counts ONLY when handed auth.uid() — a
  //    caller-supplied user id there is the confused-deputy shape.
  if (new RegExp(String.raw`(?:` + DECISION + String.raw`|\bin\b|\bany\s*\(|\bunnest\s*\()[^;]{0,200}?` + HELPER, 'i').test(body)) return 'C';
  for (const v of setVariables(body)) {
    if (new RegExp(String.raw`\b(?:any|unnest)\s*\(\s*` + v + String.raw`\s*\)`, 'i').test(body)) return 'C';
  }

  // D. a user_institution_access READ for the calling user: a statement that
  //    selects FROM / JOINs user_institution_access with `user_id = auth.uid()`
  //    (or a variable assigned auth.uid()) — typically building the caller's
  //    allowed set, then filtering on it. A statement that WRITES the table
  //    (INSERT … (user_id, institution_id)) is not a read and does not count:
  //    that is what grant_user_institution_access does, for any user named.
  if (uiaReadRe(body).test(body)) return 'D';

  // E. role_has_institution_access(<something else>) in a decision position.
  //    Row scoping somewhere in the body — NOT proof the query reading the
  //    parameter is scoped (see inspectsParam and the header).
  if (inDecision(body, `${RHIA}\\(`)) return 'E';
  return null;
}

/**
 * Does some accepted check inspect the PARAMETER ITSELF (A, B, or a tied form of
 * C / D / E — see the header), rather than only scoping some rows? A parameter
 * that guardFor passes but this rejects gets the row-scoped WARNING.
 */
export function inspectsParam(body, param) {
  const P = escRe(param.name);

  // A, directly or through a variable that holds the parameter.
  if (!param.isArray) {
    for (const n of [P, ...aliasesOf(body, P)]) {
      if (decides(body, rhiaOf(n))) return true;
    }
  }

  // B.
  if (decides(body, canHelperWith(P))) return true;

  // C, tied: the parameter tested against the caller's set.
  const sets = [...setVariables(body)];
  const SETREF = sets.length ? String.raw`(?:` + HELPER + String.raw`|\b(?:` + sets.join('|') + String.raw`)\b)` : HELPER;
  const inSet = String.raw`\b` + P + String.raw`\s*(?:=\s*any\s*\(|<>\s*all\s*\(|!=\s*all\s*\(|(?:not\s+)?in\s*\(|<@)\s*(?:(?:select|array)\b[^;]{0,200}?)?` + SETREF;
  if (decides(body, inSet)) return true;

  const statements = body.split(';');
  const namesP = new RegExp(String.raw`\b` + P + String.raw`\b`, 'i');

  // D, tied: a user_institution_access read for the caller that names the parameter.
  const uia = uiaReadRe(body);
  if (statements.some(s => uia.test(s) && namesP.test(s))) return true;

  // E, tied: each element of an array parameter checked.
  const unnestP = new RegExp(String.raw`\bunnest\s*\(\s*` + P + String.raw`\s*\)`, 'i');
  if (statements.some(s => unnestP.test(s) && inDecision(s, `${RHIA}\\(`))) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checking a set of files (the PR's changed migrations, in order)
// ─────────────────────────────────────────────────────────────────────────────

const WARN = {
  rowScoped: (fn, param, pattern) =>
    `${fn} — ${param}: passes because some rows are scoped (pattern ${pattern}), not because ${param} itself is checked; check every query that uses ${param} is scoped too.`,
  unnamed: (fn, n) =>
    `${fn} — ${n} unnamed parameter(s), used as $1, $2 …: the gate cannot tell whether one is an institution id, so it could not check them. Name the parameters, or check by hand that any institution id among them goes through role_has_institution_access().`,
  alterUnchecked: fn =>
    `${fn} — ALTER FUNCTION makes it SECURITY DEFINER, but its body is not in this PR's migration files, so the gate could not check it. Check by hand that any institution id it takes goes through role_has_institution_access().`,
  nameOnlyScope: fn =>
    `${fn} — left out of scope by a GRANT/REVOKE matched by name only (no argument list, or a type the gate cannot compare). If ${fn} has another overload, the gate may have taken the wrong one out of scope; give the argument list.`,
  nameOnlyAlter: fn =>
    `${fn} — ALTER FUNCTION … SECURITY DEFINER was matched to its body by name only. If ${fn} has another overload, the gate may have checked the wrong body; give the argument list.`,
};

/** Check one definition that is SECURITY DEFINER (declared, or set by an ALTER). */
function checkDefinition(out, { file, line, f, statements, hatchSites, note }) {
  if (f.trigger || (f.params.length === 0 && f.unnamed === 0)) return;
  const reach = reachability(statements, f.name, f.argTypes);
  if (reach.roles.length === 0) {
    if (reach.byNameOnly) out.warnings.push({ file, line, fn: f.name, kind: 'name-only', message: WARN.nameOnlyScope(f.name) });
    return;
  }
  const hatch = hatchSites.map(s => hatchAbove(s.raw, s.offset)).find(h => h.present) || { present: false, reason: '' };
  if (f.params.length > 0) out.checked++;
  if (hatch.present) {
    if (f.params.length === 0) return;
    if (hatch.reason) {
      out.passed++;
      out.hatched.push({ file, fn: f.name, line, reason: hatch.reason });
    } else {
      out.violations.push({ file, fn: f.name, param: f.params.map(p => p.name).join(', '), line, reason: 'empty-hatch', reachable: reach.roles, note });
    }
    return;
  }
  if (f.unnamed > 0) out.warnings.push({ file, line, fn: f.name, kind: 'unnamed', message: WARN.unnamed(f.name, f.unnamed) });
  if (f.params.length === 0) return;
  let failed = false;
  for (const p of f.params) {
    const pattern = guardFor(f.body, p);
    if (pattern === null) {
      failed = true;
      out.violations.push({ file, fn: f.name, param: p.name, line, reason: 'unguarded', reachable: reach.roles, note });
    } else if (!inspectsParam(f.body, p)) {
      out.warnings.push({ file, line, fn: f.name, param: p.name, kind: 'row-scoped', message: WARN.rowScoped(f.name, p.name, pattern) });
    }
  }
  if (!failed) out.passed++;
}

/** The latest CREATE of the function an ALTER names, before the ALTER: { def, byName } or null. */
function latestDefinition(defs, alter) {
  const want = alter.name.toLowerCase();
  for (let i = defs.length - 1; i >= 0; i--) {
    const d = defs[i];
    if (d.f.name.toLowerCase() !== want) continue;
    if (alter.argTypes && d.f.argTypes) {
      if (sameSignature(alter.argTypes, d.f.argTypes)) return { def: d, byName: false };
      continue;
    }
    return { def: d, byName: true };
  }
  return null;
}

/**
 * Check migration files, read in the order given (the PR's changed files).
 * entries: [{ file, raw }]. Returns { checked, passed, hatched, violations, warnings }.
 * violations: [{ file, fn, param, line, reason: 'unguarded' | 'empty-hatch', reachable, note }]
 * warnings:   [{ file, line, fn, param?, kind, message }]
 */
export function checkFiles(entries) {
  const out = { checked: 0, passed: 0, hatched: [], violations: [], warnings: [] };
  const defs = [];
  const promoted = new Set();
  for (const { file, raw } of entries) {
    const statements = topLevelStatements(blankComments(raw));
    const events = [
      ...extractFunctions(raw).map(f => ({ at: f.offset, f })),
      ...extractSecdefAlters(raw).map(a => ({ at: a.offset, a })),
    ].sort((x, y) => x.at - y.at);
    for (const ev of events) {
      if (ev.f) {
        // EVERY definition is checked, including an earlier one a later CREATE
        // OR REPLACE in the same file supersedes: the earlier body is live
        // between the two statements, and a file that needs the unguarded one
        // briefly can say so with the hatch.
        const d = { file, raw, statements, f: ev.f };
        defs.push(d);
        if (ev.f.secdef) checkDefinition(out, { file, line: ev.f.line, f: ev.f, statements, hatchSites: [{ raw, offset: ev.f.offset }] });
        continue;
      }
      const a = ev.a;
      const match = latestDefinition(defs, a);
      if (!match) {
        if (a.paramNames && !a.paramNames.some(isInstitutionParamName)) continue;   // named, and takes no institution id
        out.warnings.push({ file, line: a.line, fn: a.name, kind: 'alter-unchecked', message: WARN.alterUnchecked(a.name) });
        continue;
      }
      const d = match.def;
      if (d.f.secdef || promoted.has(d)) continue;   // already checked as SECURITY DEFINER
      promoted.add(d);
      if (match.byName) out.warnings.push({ file, line: a.line, fn: a.name, kind: 'name-only', message: WARN.nameOnlyAlter(a.name) });
      checkDefinition(out, {
        file,
        line: a.line,
        f: { ...d.f, secdef: true },
        statements: d.file === file ? statements : [...d.statements, ...statements],
        hatchSites: [{ raw: d.raw, offset: d.f.offset }, { raw, offset: a.offset }],
        note: `made SECURITY DEFINER by the ALTER FUNCTION on this line; the body checked is at ${d.file}:${d.f.line}.`,
      });
    }
  }
  return out;
}

/** Check one migration file's text. Same result shape as checkFiles. */
export function checkSql(raw, file = '<sql>') {
  return checkFiles([{ file, raw }]);
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
  // Added (A), modified (M), and renamed AND edited (R below 100 % similarity):
  // a migration renumbered and changed in the same PR reports as R, not A or M,
  // and was skipped before. A pure rename (R100) changes no SQL.
  const out = [];
  for (const row of sh(`git diff --name-status -M --diff-filter=AMR ${merge}...HEAD -- ${MIG_DIR}`).split('\n')) {
    const cols = row.split('\t');
    if (cols.length < 2) continue;
    if (cols[0].startsWith('R')) {
      if (cols[0] !== 'R100' && cols[2]) out.push(cols[2]);
    } else {
      out.push(cols[1]);
    }
  }
  return out.filter(f => f.endsWith('.sql'));
}

const ghData = s => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const ghProp = s => ghData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

function printWarnings(warnings) {
  if (warnings.length === 0) return;
  console.log('');
  for (const w of warnings) {
    console.log(`${YELLOW}⚠ WARNING${RESET} ${w.file} (line ${w.line}) — ${w.message}`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::warning file=${ghProp(w.file)},line=${w.line},title=${ghProp('Institution-id parameter guard')}::${ghData(w.message)}`);
    }
  }
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

  const entries = files.filter(f => existsSync(f)).map(file => ({ file, raw: readFileSync(file, 'utf8') }));
  const r = checkFiles(entries);
  if (VERBOSE) {
    for (const h of r.hatched) console.log(`${DIM}allowed by hatch: ${h.fn} (${h.file}:${h.line}) — ${h.reason}${RESET}`);
  }

  const nw = r.warnings.length;
  console.log(`\n${BOLD}Institution-id parameter guard${RESET} — ${r.checked} SECURITY DEFINER function(s) taking an institution id checked, ${r.passed} guarded${nw ? `, ${nw} warning(s)` : ''}.`);
  printWarnings(r.warnings);

  if (r.violations.length === 0) {
    if (nw) {
      console.log(`\n${GREEN}✓ No lookup takes an institution id without any check.${RESET} ${YELLOW}Read the ${nw} warning(s) above: each names something the gate could not fully confirm. Warnings do not fail this check.${RESET}`);
    } else {
      console.log(`${GREEN}✓ Every new or changed SECURITY DEFINER function that takes an institution id checks the caller's access to it.${RESET}`);
    }
    process.exit(0);
  }

  console.error(`\n${RED}${BOLD}✗ ${r.violations.length} problem(s): a lookup takes an institution id from the caller and never checks the caller may see that institution.${RESET}\n`);
  for (const v of r.violations) {
    console.error(`  ${RED}•${RESET} File:      ${v.file} (line ${v.line})`);
    console.error(`    Function:  ${BOLD}${v.fn}${RESET}`);
    console.error(`    Parameter: ${v.param}`);
    if (v.reason === 'empty-hatch') {
      console.error(`    Problem:   it carries "-- institution-param-guard: allow" with NO reason. Write why this caller may pass any institution id, or remove the line and add the check.`);
    } else {
      console.error(`    Problem:   anyone who can call it (${v.reachable.join(', ')}) can pass ANOTHER college's id and read that college's data.`);
      console.error(`    Fix:       before using ${v.param}, refuse it unless public.role_has_institution_access(${v.param}) is true.`);
    }
    if (v.note) console.error(`    Note:      ${v.note}`);
    console.error('');
  }
  console.error(`${YELLOW}How to fix (the shape PR #3983 uses):${RESET}
  ${DIM}IF p_institution_id IS NOT NULL AND NOT public.role_has_institution_access(p_institution_id) THEN${RESET}
  ${DIM}  RETURN jsonb_build_object('success', false, 'error',${RESET}
  ${DIM}    jsonb_build_object('code', 'FORBIDDEN_INSTITUTION', 'message', 'You do not have access to that institution.'));${RESET}
  ${DIM}END IF;${RESET}
  (or RAISE EXCEPTION — refuse out loud; never quietly swap in the caller's own college.)

If ONLY server code calls it, take it away from signed-in users instead:
  ${DIM}REVOKE EXECUTE ON FUNCTION public.<fn>(<argument types>) FROM anon, authenticated, PUBLIC;${RESET}

If every caller may genuinely pass any institution id, say why on the line above CREATE FUNCTION:
  ${DIM}-- institution-param-guard: allow <reason>${RESET}

Why this gate exists: on 2026-09-23 a one-college head of department read another
college's 1,511 learners through ai_rpc_students_summary, which trusted this parameter.
See scripts/ci/check-institution-param-guard.mjs header.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
