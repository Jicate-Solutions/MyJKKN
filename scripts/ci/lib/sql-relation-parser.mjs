/**
 * scripts/ci/lib/sql-relation-parser.mjs
 *
 * The SQL-text parsing layer behind scripts/ci/check-table-anon-revoke.mjs,
 * extracted so it can be unit-tested as a pure function. It answers exactly one
 * question: WHICH relations does this migration file create when it runs?
 *
 * WHY THIS EXISTS — the phantom-table bug it fixes:
 *   The previous parser stripped comments but kept string literals and
 *   dollar-quoted bodies VERBATIM, then ran a `CREATE TABLE` regex over the whole
 *   text. So `CREATE TABLE` written inside a plpgsql function body, or inside a
 *   single-quoted string, was read as a real relation. The gate then demanded an
 *   anon REVOKE for a table that the migration never creates — an unsatisfiable
 *   failure that trains people to reach for the escape hatch, which is how a
 *   security gate dies.
 *
 * THE RULE THIS FILE ENCODES — "does this text EXECUTE when the migration runs?"
 *   Not "is it inside quotes". Quoting is the mechanism, execution is the
 *   question, and the two come apart in the case that matters most:
 *
 *     DO $$ BEGIN CREATE TABLE public._bak_x AS SELECT * FROM learners; END $$;
 *
 *   That is dollar-quoted AND it runs at migration time AND it is the exact shape
 *   of the 2026-07-31 incident (a CTAS copy of learner rows, born with Supabase's
 *   default anon grant and without RLS). A parser that skips dollar-quoting to
 *   kill the phantoms would go blind to it. So:
 *
 *     REDACTED (cannot create anything now)      KEPT (executes now)
 *     ------------------------------------------ ---------------------------------
 *     line comments and block comments           top-level DDL
 *     'string literals' outside a DO body        "quoted identifiers" — a NAME,
 *     dollar-quoted FUNCTION/PROCEDURE bodies      not text; a relation can be
 *     dollar-quoted string constants               called "Bak Copy 20260802"
 *                                                dollar-quoted DO-block bodies
 *                                                'strings' INSIDE a DO body
 *
 *   Redaction blanks the text to spaces of equal length (newlines preserved), so
 *   offsets, line numbers and statement shapes survive and no keyword can leak
 *   across a redacted span.
 *
 * WHY 'strings' INSIDE a DO body are KEPT, deliberately erring toward a false
 * positive: inside plpgsql, `EXECUTE 'CREATE TABLE public._bak_x AS ...'` is real,
 * executes now, and is the natural way to write dynamic repair DDL. Blanking it
 * would be a false NEGATIVE on the incident shape. The cost is that a DO block
 * which merely mentions "CREATE TABLE" in a RAISE NOTICE gets flagged. That is the
 * documented, intended asymmetry: a false positive costs one line of SQL a new
 * table should carry anyway; a false negative costs learner identities.
 *
 * DEFERRED DDL is reported, not silently dropped. A `CREATE TABLE` inside a
 * CREATE FUNCTION body genuinely creates a public-schema relation — later, when
 * something calls the function. It is NOT created by this migration (so demanding
 * a same-migration REVOKE was the bug), but it is not nothing either, so
 * analyzeSql() hands it back separately under `deferred` for the gate to report.
 *
 * Two quoting bugs in the old name regex are fixed here as well, both of which
 * produced a WRONG NAME rather than a missing one — the failure mode that makes a
 * gate's output untrustworthy:
 *   - `"?[A-Za-z0-9_]+"?` stops at the first space, so
 *     CREATE TABLE public."Bak Copy 20260802" was reported as a relation called
 *     `Bak`. A REVOKE naming a DIFFERENT `"Bak Something Else"` then satisfied it,
 *     because both contain the substring `Bak`.
 *   - the name was interpolated straight into `new RegExp('\\b' + name + '\\b')`,
 *     so a quoted identifier containing a regex metacharacter matched the wrong
 *     statements (or threw).
 */

/** Sticky so tag detection is O(1) per `$` instead of slicing the rest of the file. */
const DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;

/** A SQL identifier: a quoted one (which may contain anything, `""` escapes a quote) or a bare word. */
const IDENT = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_$]*)';

/** Blank a span to spaces, keeping newlines so line numbers survive. */
function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

/** `"Bak ""X"""` -> `Bak "X"`; a bare word is returned unchanged. */
export function unquoteIdent(ident) {
  if (ident.startsWith('"') && ident.endsWith('"') && ident.length >= 2) {
    return ident.slice(1, -1).replace(/""/g, '"');
  }
  return ident;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does `stmt` name the relation `name`?
 *
 * Quotes are normalised away on both sides so `public."Bak Copy"` and
 * `public.Bak Copy` compare equal. The name is regex-escaped (a quoted identifier
 * may legally contain `.`, `(`, `*`, `\`), and the word boundaries are applied
 * only where the name itself starts/ends with a word character — `\b` next to a
 * non-word character asserts the opposite of what is meant and would silently
 * never match.
 */
export function statementNamesRelation(stmt, name) {
  const bare = stmt.replace(/"/g, '');
  const left = /^[A-Za-z0-9_]/.test(name) ? '(?<![A-Za-z0-9_])' : '';
  const right = /[A-Za-z0-9_]$/.test(name) ? '(?![A-Za-z0-9_])' : '';
  return new RegExp(`${left}${escapeRe(name)}${right}`, 'i').test(bare);
}

/**
 * One lexer pass. Returns the redacted executable text, the statements that
 * really run (top level + DO-block bodies), and the deferred function/procedure
 * bodies.
 *
 * @param {string} sql
 * @param {boolean} inDoBody  true while scanning the body of a DO statement
 */
function scan(sql, inDoBody) {
  let out = '';
  const deferred = [];
  const doStatements = [];
  let i = 0;
  const n = sql.length;
  let stmtStart = 0;               // index into `out` where the current statement began

  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];

    // ---- line comment -------------------------------------------------------
    if (c === '-' && c2 === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? n : nl;      // the \n itself is copied on the next pass
      out += blank(sql.slice(i, end));
      i = end;
      continue;
    }

    // ---- block comment (PostgreSQL nests them) ------------------------------
    if (c === '/' && c2 === '*') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      out += blank(sql.slice(start, i));
      continue;
    }

    // ---- quoted identifier: this is a NAME, so it is executable text ---------
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') { i += 2; continue; }
        if (sql[i] === '"') { i++; break; }
        i++;
      }
      out += sql.slice(start, i);
      continue;
    }

    // ---- string literal -----------------------------------------------------
    if (c === "'") {
      // E'...' uses backslash escapes, so \' does NOT end the literal. Getting
      // this wrong desynchronises the scanner for the rest of the file.
      const prev = out[out.length - 1];
      const prev2 = out[out.length - 2];
      const isEString = (prev === 'E' || prev === 'e') && !/[A-Za-z0-9_$]/.test(prev2 ?? ' ');
      const start = i;
      i++;
      while (i < n) {
        if (isEString && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      const text = sql.slice(start, i);
      // Inside a DO body `EXECUTE 'CREATE TABLE ...'` runs at migration time, so
      // the literal is kept. Everywhere else a literal is inert data.
      out += inDoBody ? text : blank(text);
      continue;
    }

    // ---- dollar-quoted body -------------------------------------------------
    if (c === '$') {
      DOLLAR_TAG.lastIndex = i;
      const m = DOLLAR_TAG.exec(sql);
      if (m) {
        const tag = m[0];
        const bodyStart = i + tag.length;
        const end = sql.indexOf(tag, bodyStart);
        const bodyEnd = end === -1 ? n : end;          // unterminated: treat rest as body
        const body = sql.slice(bodyStart, bodyEnd);
        const closer = end === -1 ? '' : tag;

        // Whose body is this? Look at the statement accumulated so far. `DO $$..$$`
        // executes now; a CREATE FUNCTION/PROCEDURE body does not, and a
        // dollar-quoted string constant in an INSERT is plain data.
        //
        // `|| inDoBody` is load-bearing, and was added after it drew blood on a
        // REAL migration: 20260530150000_instagram_lead_attribution.sql wraps its
        // view in `DO $$ BEGIN ... EXECUTE $view$ CREATE VIEW public.v_ig_...
        // $view$; ... END $$;`. That view IS created when the migration runs. A
        // first cut of this parser only treated the OUTER $$ as executable and
        // blanked the nested $view$ tag as if it were a function body, which
        // turned a caught relation into a missed one — the false-negative
        // direction, on a view, which is the sharper hazard of the two. Any
        // dollar-quoted text nested inside a DO body is EXECUTE material until
        // proven otherwise, and "proven otherwise" is not worth guessing at.
        const isDo = /^\s*do\b/i.test(out.slice(stmtStart));

        if (isDo || inDoBody) {
          const inner = scan(body, true);
          out += tag + inner.executable + closer;
          deferred.push(...inner.deferred);
          // Statements inside a DO block really execute, so a REVOKE written
          // there must count. splitStatements() below keeps a dollar body as one
          // opaque statement (correctly — a `;` inside it is not a separator), so
          // they are surfaced here instead. The leading BEGIN of the block rides
          // on the first statement; strip it so an `ALTER TABLE ... ENABLE ROW
          // LEVEL SECURITY` written first in the block still anchors.
          doStatements.push(
            ...splitStatements(inner.executable).map(s => s.replace(/^begin\s+/i, '').trim()).filter(Boolean),
            ...inner.doStatements,
          );
        } else {
          // A CREATE FUNCTION / PROCEDURE body, or a dollar-quoted string
          // constant. Nothing in here runs when the migration runs, so it is
          // blanked out of `executable` — that is the phantom-table fix. It is
          // handed back under `deferred` instead, because a function that creates
          // a public-schema relation still creates one, later.
          //
          // Scanned with strings KEPT (the `true`), for the same reason the DO
          // branch keeps them: inside a body, DDL travels as
          // `EXECUTE 'CREATE VIEW ...'`. Real example — 20260616000000 builds
          // v_privilege_memberships_effective that way AND revokes anon on it the
          // same way, `EXECUTE 'REVOKE ALL ON ... FROM anon, PUBLIC'`. Blanking
          // literals here would hide both halves and report a correct migration
          // as unlocked.
          const inner = scan(body, true);
          deferred.push(
            {
              construct: out.slice(stmtStart).trim().replace(/\s+/g, ' ').slice(0, 120),
              executable: inner.executable,
              statements: splitStatements(unwrapDynamicSql(inner.executable)),
            },
            ...inner.deferred,
          );
          out += blank(tag) + blank(body) + blank(closer);
        }
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }

    // ---- ordinary character -------------------------------------------------
    out += c;
    i++;
    if (c === ';') stmtStart = out.length;
    continue;
  }

  return { executable: out, deferred, doStatements };
}

/**
 * Strip the wrapping of dynamic SQL so the statement inside becomes visible to the
 * plain `^revoke` / `^grant` / `^alter table` matchers.
 *
 * `EXECUTE 'REVOKE ALL ON v FROM anon, PUBLIC';` is a REVOKE for every purpose
 * this gate cares about, but it is a statement beginning with EXECUTE, so an
 * anchored matcher never sees it. Delimiters are replaced by spaces of equal
 * length so offsets are unchanged.
 *
 * Used ONLY on deferred (function-body) text, never on the executable text of the
 * migration itself. Loosening the top level this way would let a REVOKE that is
 * merely QUOTED — one that never runs — satisfy the gate, which is the exact
 * defect this file's sibling check-secdef-anon-revoke.mjs still carries.
 */
export function unwrapDynamicSql(text) {
  const pad = (m) => ' '.repeat(m.length);
  return text
    .replace(/\bexecute\b/gi, pad)
    .replace(/\bformat\s*\(/gi, pad)
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g, pad)
    .replace(/'/g, ' ');
}

/**
 * Split executable SQL into statements on top-level `;`.
 * Strings, quoted identifiers and dollar-quoted bodies never split.
 */
export function splitStatements(sql) {
  const stmts = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const q = c;
      cur += q;
      i++;
      while (i < n) {
        if (sql[i] === q && sql[i + 1] === q) { cur += q + q; i += 2; continue; }
        cur += sql[i];
        if (sql[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '$') {
      DOLLAR_TAG.lastIndex = i;
      const m = DOLLAR_TAG.exec(sql);
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        cur += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') { stmts.push(cur); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts.map(s => s.trim()).filter(Boolean);
}

const CREATE_TABLE_RE = new RegExp(
  '\\bcreate\\s+' +
  '(?:(?:global|local)\\s+)?' +
  '(temp|temporary|unlogged)?\\s*' +
  'table\\s+' +
  '(?:if\\s+not\\s+exists\\s+)?' +
  `(?:(${IDENT})\\s*\\.\\s*)?` +   // optional schema
  `(${IDENT})`,                    // table name
  'gi'
);

const CREATE_VIEW_RE = new RegExp(
  '\\bcreate\\s+' +
  '(?:or\\s+replace\\s+)?' +
  '(?:(temp|temporary)\\s+)?' +
  '(?:recursive\\s+)?' +
  '(materialized\\s+)?' +
  'view\\s+' +
  '(?:if\\s+not\\s+exists\\s+)?' +
  `(?:(${IDENT})\\s*\\.\\s*)?` +   // optional schema
  `(${IDENT})`,                    // view name
  'gi'
);

/**
 * PostgreSQL FULLY RESERVED keywords. None of these can be an unquoted relation
 * name — `CREATE TABLE as (...)` is a syntax error, not a table called `as`. So
 * when one turns up in the name position the regex has matched something that is
 * not a relation creation at all, and the match must be dropped rather than
 * reported as a table.
 *
 * The case this kills, by name: PR #2756's event-trigger migration
 * (20260808220000_autolock_new_public_relations.sql) has to write the literal DDL
 * command tags `'CREATE TABLE', 'CREATE TABLE AS', ...` in its WHEN TAG IN (...)
 * list — CREATE EVENT TRIGGER syntax offers no other spelling. The old parser read
 * `CREATE TABLE AS` and reported a phantom table named `AS`, so the migration that
 * installs the DATABASE half of this very defence had to burn BOTH escape hatches
 * on itself. Its header asks for this fix in as many words.
 *
 * Only UNQUOTED names are filtered. `CREATE TABLE public."as" (...)` is legal and
 * stays a real relation.
 *
 * Deliberately fully-reserved only. Words like `if`, `of`, `partition`, `like`,
 * `view`, `name`, `value`, `key`, `data`, `owner` are NON-reserved in PostgreSQL
 * and are perfectly legal unquoted table names, so listing them would silently
 * blind the gate to a real table.
 */
const RESERVED_WORDS = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
  'both', 'case', 'cast', 'check', 'collate', 'column', 'constraint', 'create',
  'current_catalog', 'current_date', 'current_role', 'current_time',
  'current_timestamp', 'current_user', 'default', 'deferrable', 'desc', 'distinct',
  'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign', 'from',
  'grant', 'group', 'having', 'in', 'initially', 'intersect', 'into', 'lateral',
  'leading', 'limit', 'localtime', 'localtimestamp', 'not', 'null', 'offset', 'on',
  'only', 'or', 'order', 'placing', 'primary', 'references', 'returning', 'select',
  'session_user', 'some', 'symmetric', 'table', 'then', 'to', 'trailing', 'true',
  'union', 'unique', 'user', 'using', 'variadic', 'when', 'where', 'window', 'with',
]);

/** True when this regex match landed on a reserved word rather than a real name. */
function isReservedBareWord(ident) {
  return !ident.startsWith('"') && RESERVED_WORDS.has(ident.toLowerCase());
}

/**
 * Names of tables CREATEd in schema public by the given EXECUTABLE text.
 *
 * Covers CREATE TABLE, CREATE UNLOGGED TABLE, IF NOT EXISTS, quoted names,
 * `CREATE TABLE x AS SELECT` (CTAS — the leak vector behind the 37 `_bak_*`
 * tables: it inherits the anon default grant AND never enables RLS) and
 * `PARTITION OF`.
 *
 * Excludes TEMP / TEMPORARY (session-local, unreachable via PostgREST) and any
 * explicitly non-public schema.
 */
export function createdTables(executable) {
  const names = [];
  CREATE_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_RE.exec(executable)) !== null) {
    const kind = (m[1] || '').toLowerCase();
    if (kind === 'temp' || kind === 'temporary') continue;
    if (isReservedBareWord(m[3])) continue;
    const schema = unquoteIdent(m[2] || '').toLowerCase();
    if (schema && schema !== 'public') continue;
    names.push(unquoteIdent(m[3]));
  }
  return [...new Set(names)];
}

/**
 * Views and materialised views CREATEd in schema public, as {name, kind}.
 *
 * These carry the SAME exposure as a table: Supabase's ALTER DEFAULT PRIVILEGES
 * grant covers them, so a fresh view in schema public is born readable by the anon
 * key. A view is in fact the sharper hazard — it can republish a table that IS
 * locked, and RLS on the underlying table does not follow: a non-SECURITY_INVOKER
 * view executes as its owner.
 */
export function createdViews(executable) {
  const found = new Map();
  CREATE_VIEW_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_VIEW_RE.exec(executable)) !== null) {
    const temp = (m[1] || '').toLowerCase();
    if (temp === 'temp' || temp === 'temporary') continue;
    if (isReservedBareWord(m[4])) continue;
    const schema = unquoteIdent(m[3] || '').toLowerCase();
    if (schema && schema !== 'public') continue;
    const name = unquoteIdent(m[4]);
    const kind = m[2] ? 'materialized view' : 'view';
    if (!found.has(name)) found.set(name, kind);
  }
  return [...found].map(([name, kind]) => ({ name, kind }));
}

/**
 * Parse one migration file.
 *
 * @returns {{
 *   executable: string,                 // comments + inert quoted text redacted
 *   statements: string[],               // statements that really run (top level + DO bodies)
 *   tables: string[],                   // tables created in schema public when this migration runs
 *   views: {name: string, kind: string}[],
 *   deferred: {construct: string, tables: string[], views: {name: string, kind: string}[], statements: string[]}[],
 * }}
 */
export function analyzeSql(rawSql) {
  const { executable, deferred, doStatements } = scan(rawSql, false);
  return {
    executable,
    statements: [...splitStatements(executable), ...doStatements],
    tables: createdTables(executable),
    views: createdViews(executable),
    deferred: deferred
      .map(d => ({
        construct: d.construct,
        statements: d.statements,
        tables: createdTables(d.executable),
        views: createdViews(d.executable),
      }))
      .filter(d => d.tables.length > 0 || d.views.length > 0),
  };
}
