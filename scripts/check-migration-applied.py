#!/usr/bin/env python3
"""check-migration-applied.py — the /deploy-myjkkn Step 1.6 migration gate.

Deploy ships CODE. It does NOT apply migrations. So a merged PR can put code
live that expects schema which was never applied to production, and the page
500s. This gate reads a migration SQL file, extracts the schema objects it
DECLARES, and asks live production whether each one actually exists.

WHY INTROSPECTION, NOT supabase_migrations.schema_migrations:
    SQL here is applied through the Supabase Management API, which does not
    write the migration ledger (only `supabase db push` does). The ledger lies.
    Direct catalog introspection is ground truth regardless of how the SQL got
    applied.

CONTRACT
    usage:  check-migration-applied.py <file.sql> [<file.sql> ...]
    exit 0  every declared object verified present in production
    exit 1  operational error (no token, unreadable file, query failed)
    exit 2  GAP — at least one declared object is MISSING from production
    exit 3  NOT CHECKABLE — the migration declares nothing this gate can verify
            (pure DML, or dynamic GRANT/REVOKE built with EXECUTE format()).
            Non-zero ON PURPOSE: a gate that cannot fail is not a gate.

LIMITATION — REVOKE/GRANT-ONLY MIGRATIONS
    A privilege-only migration creates no objects, so an object-existence check
    passes it while verifying literally nothing — and those are the most
    security-critical files shipped. This gate therefore parses literal
    GRANT/REVOKE statements and verifies the real privilege state with
    has_function_privilege() / has_table_privilege(). When the grants are built
    dynamically (EXECUTE format('REVOKE ... %s', sig)) no concrete signature can
    be recovered, and the gate exits 3 with an explicit
    "NOT CHECKABLE BY OBJECT EXISTENCE" message rather than passing.

CREDENTIALS  (read-only queries only; this gate never writes)
    SUPABASE_PROJECT_REF        project ref            (default: prod ref below)
    SUPABASE_ACCESS_TOKEN       management API token   (preferred)
    SUPABASE_ACCESS_TOKEN_FILE  path to a token file   (default ~/.supabase/access-token)
    The token is passed to curl on stdin, never on argv, and is never printed.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

DEFAULT_REF = "kvizhngldtiuufknvehv"
DEFAULT_TOKEN_FILE = "~/.supabase/access-token"
USER_AGENT = "supabase-cli/2.75.0"  # the API rejects curl's default UA

EXIT_OK, EXIT_OPERR, EXIT_GAP, EXIT_UNCHECKABLE = 0, 1, 2, 3


# ---------------------------------------------------------------- credentials
def load_token():
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if tok:
        return tok
    path = os.path.expanduser(
        os.environ.get("SUPABASE_ACCESS_TOKEN_FILE", DEFAULT_TOKEN_FILE)
    )
    try:
        with open(path) as fh:
            return fh.read().strip()
    except OSError as exc:
        sys.stderr.write(
            "check-migration-applied: no management token. Set SUPABASE_ACCESS_TOKEN "
            f"or provide {path} ({exc.__class__.__name__}).\n"
        )
        sys.exit(EXIT_OPERR)


def query(sql, ref, token):
    """POST one read-only statement to the Management API. Returns rows or raises."""
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
    # Token goes in via a curl config file on stdin so it never appears in argv.
    config = (
        f'url = "{url}"\n'
        'request = "POST"\n'
        f'header = "Authorization: Bearer {token}"\n'
        'header = "Content-Type: application/json"\n'
        f'user-agent = "{USER_AGENT}"\n'
        "silent\n"
    )
    # The request body goes in a temp file because curl's stdin is already
    # carrying the config (which is what keeps the token out of argv).
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as body:
        json.dump({"query": sql}, body)
        body_path = body.name
    cfg = config + f"data-binary = @{body_path}\n"
    try:
        proc = subprocess.run(
            ["curl", "--config", "-"],
            input=cfg,
            capture_output=True,
            text=True,
            timeout=120,
        )
    finally:
        os.unlink(body_path)
    if proc.returncode != 0:
        raise RuntimeError(f"curl exited {proc.returncode}: {proc.stderr[:200]}")
    try:
        data = json.loads(proc.stdout)
    except ValueError:
        raise RuntimeError(f"non-JSON response: {proc.stdout[:200]}")
    if isinstance(data, dict):
        raise RuntimeError(f"API error: {json.dumps(data)[:300]}")
    return data


# ------------------------------------------------------------------- parsing
def strip_comments(sql):
    """Remove -- line comments and /* */ block comments.

    Load-bearing: prose comments in these migrations quote real DDL and real
    GRANT statements. Counting those would invent objects that were never
    declared.
    """
    sql = re.sub(r"/\*[\s\S]*?\*/", " ", sql)
    return "\n".join(re.sub(r"--.*$", "", line) for line in sql.splitlines())


def split_top_level(text):
    """Split a parameter list on commas that are not inside brackets/quotes."""
    out, depth, cur, quote = [], 0, [], None
    for ch in text:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "'\"":
            quote = ch
            cur.append(ch)
        elif ch in "([":
            depth += 1
            cur.append(ch)
        elif ch in ")]":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        out.append("".join(cur))
    return [p.strip() for p in out if p.strip()]


def balanced_paren(text, start):
    """Return the substring inside the parens beginning at text[start] == '('."""
    depth, i, quote = 0, start, None
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in "'\"":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
        i += 1
    return None


def qualify(name, default_schema="public"):
    name = name.strip().strip('"')
    if "." in name:
        schema, _, obj = name.partition(".")
        return schema.strip('"'), obj.strip('"')
    return default_schema, name


class Check:
    """One thing to verify: a label plus the boolean SQL that proves it."""

    def __init__(self, label, expr, note=""):
        self.label = label
        self.expr = expr
        self.note = note


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def extract(sql):
    """Return (checks, grant_stmts, unparsed_grants, has_dml)."""
    body = strip_comments(sql)
    checks = []

    # -- CREATE TABLE ---------------------------------------------------------
    for m in re.finditer(
        r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)", body, re.I
    ):
        schema, tbl = qualify(m.group(1))
        checks.append(
            Check(
                f"table {schema}.{tbl}",
                f"to_regclass({lit(schema + '.' + tbl)}) is not null",
            )
        )

    # -- ALTER TABLE ... ADD COLUMN / ADD CONSTRAINT ---------------------------
    for m in re.finditer(
        r"\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w.\"]+)([\s\S]*?);",
        body,
        re.I,
    ):
        schema, tbl = qualify(m.group(1))
        tail = m.group(2)
        for col in re.findall(
            r"\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w\"]+)", tail, re.I
        ):
            col = col.strip('"')
            checks.append(
                Check(
                    f"column {schema}.{tbl}.{col}",
                    "exists(select 1 from information_schema.columns "
                    f"where table_schema={lit(schema)} and table_name={lit(tbl)} "
                    f"and column_name={lit(col)})",
                )
            )
        for cm in re.finditer(r"\bADD\s+CONSTRAINT\s+([\w\"]+)", tail, re.I):
            con = cm.group(1).strip('"')
            expr = (
                "exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid "
                "join pg_namespace n on n.oid=r.relnamespace "
                f"where n.nspname={lit(schema)} and r.relname={lit(tbl)} and c.conname={lit(con)})"
            )
            # A DROP+ADD of an existing constraint name passes an existence check
            # while the definition change (e.g. widening a CHECK vocabulary) may
            # never have landed. Assert every string literal the CHECK declares
            # actually appears in the live constraint definition.
            chk = re.search(
                r"\bADD\s+CONSTRAINT\s+" + re.escape(cm.group(1)) + r"\s+CHECK\s*\(",
                tail,
                re.I,
            )
            if chk:
                inner = balanced_paren(tail, chk.end() - 1)
                for value in sorted(set(re.findall(r"'([^']*)'", inner or ""))):
                    expr += (
                        " and exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid "
                        "join pg_namespace n on n.oid=r.relnamespace "
                        f"where n.nspname={lit(schema)} and r.relname={lit(tbl)} "
                        f"and c.conname={lit(con)} "
                        f"and pg_get_constraintdef(c.oid) like {lit('%' + value + '%')})"
                    )
            checks.append(Check(f"constraint {schema}.{tbl}.{con}", expr))

    # -- CREATE [OR REPLACE] FUNCTION -----------------------------------------
    for m in re.finditer(
        r"\bCREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+([\w.\"]+)\s*\(", body, re.I
    ):
        schema, fn = qualify(m.group(2))
        params = balanced_paren(body, m.end() - 1)
        nargs = len(split_top_level(params)) if params is not None else None
        expr = (
            "exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
            f"where n.nspname={lit(schema)} and p.proname={lit(fn)}"
        )
        label = f"function {schema}.{fn}"
        if nargs is not None:
            # Arity matters: a migration that ADDS a parameter produces a new
            # overload. Name-only existence would pass on the old signature and
            # miss the change entirely.
            expr += f" and p.pronargs={nargs}"
            label += f"/{nargs}"
        expr += ")"
        note = "OR REPLACE — existence proves the name, not the body" if m.group(1) else ""
        checks.append(Check(label, expr, note))

    # -- CREATE TYPE / ALTER TYPE ADD VALUE ------------------------------------
    for m in re.finditer(r"\bCREATE\s+TYPE\s+([\w.\"]+)", body, re.I):
        schema, typ = qualify(m.group(1))
        checks.append(
            Check(
                f"type {schema}.{typ}",
                "exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace "
                f"where n.nspname={lit(schema)} and t.typname={lit(typ)})",
            )
        )
    for m in re.finditer(
        r"\bALTER\s+TYPE\s+([\w.\"]+)\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'",
        body,
        re.I,
    ):
        schema, typ = qualify(m.group(1))
        checks.append(
            Check(
                f"enum value {schema}.{typ}.{m.group(2)}",
                "exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid "
                "join pg_namespace n on n.oid=t.typnamespace "
                f"where n.nspname={lit(schema)} and t.typname={lit(typ)} "
                f"and e.enumlabel={lit(m.group(2))})",
            )
        )

    # -- CREATE INDEX ----------------------------------------------------------
    for m in re.finditer(
        r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?"
        r"(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)\s+ON\b",
        body,
        re.I,
    ):
        schema, idx = qualify(m.group(1))
        checks.append(
            Check(
                f"index {schema}.{idx}",
                "exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                f"where c.relkind='i' and n.nspname={lit(schema)} and c.relname={lit(idx)})",
            )
        )

    # -- CREATE [MATERIALIZED] VIEW -------------------------------------------
    for m in re.finditer(
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\s+"
        r"(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)",
        body,
        re.I,
    ):
        schema, view = qualify(m.group(2))
        kind = "matview" if m.group(1) else "view"
        relkind = "'m'" if m.group(1) else "'v'"
        checks.append(
            Check(
                f"{kind} {schema}.{view}",
                "exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                f"where c.relkind={relkind} and n.nspname={lit(schema)} and c.relname={lit(view)})",
            )
        )

    # -- CREATE POLICY (also finds policies created inside DO $$ EXECUTE $$) ---
    for m in re.finditer(
        r"\bCREATE\s+POLICY\s+(\"[^\"]+\"|[\w]+)\s+ON\s+([\w.\"]+)", body, re.I
    ):
        pol = m.group(1).strip('"')
        schema, tbl = qualify(m.group(2))
        checks.append(
            Check(
                f"policy {pol} on {schema}.{tbl}",
                "exists(select 1 from pg_policies "
                f"where schemaname={lit(schema)} and tablename={lit(tbl)} "
                f"and policyname={lit(pol)})",
            )
        )

    # -- CREATE TRIGGER --------------------------------------------------------
    for m in re.finditer(
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+([\w\"]+)"
        r"[\s\S]{0,400}?\bON\s+([\w.\"]+)",
        body,
        re.I,
    ):
        trg = m.group(1).strip('"')
        schema, tbl = qualify(m.group(2))
        checks.append(
            Check(
                f"trigger {trg} on {schema}.{tbl}",
                "exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid "
                "join pg_namespace n on n.oid=c.relnamespace "
                f"where n.nspname={lit(schema)} and c.relname={lit(tbl)} "
                f"and t.tgname={lit(trg)} and not t.tgisinternal)",
            )
        )

    # -- storage buckets -------------------------------------------------------
    for m in re.finditer(
        r"\bINSERT\s+INTO\s+storage\.buckets\b[\s\S]*?\bVALUES\s*\(\s*'([^']+)'",
        body,
        re.I,
    ):
        checks.append(
            Check(
                f"storage bucket {m.group(1)}",
                f"exists(select 1 from storage.buckets where id={lit(m.group(1))})",
            )
        )

    grants, unparsed = extract_grants(body)
    has_dml = bool(
        re.search(r"^\s*(INSERT|UPDATE|DELETE)\b", body, re.I | re.M)
    )
    return checks, grants, unparsed, has_dml


GRANT_RE = re.compile(
    r"\b(GRANT|REVOKE)\s+(.+?)\s+ON\s+(FUNCTION|PROCEDURE|ROUTINE|TABLE|SEQUENCE|SCHEMA)?\b\s*"
    r"([\w.\"]+)\s*(\([^;()]*\))?\s*(?:FROM|TO)\s+([^;]+);",
    re.I | re.S,
)

# Shapes that name no single object: schema-wide grants and default privileges.
# They must be pulled out BEFORE GRANT_RE runs — "ON ALL FUNCTIONS" otherwise
# lets the kind alternation match the "FUNCTION" prefix of "FUNCTIONS" and the
# target group swallows the stray "S", producing a nonsense label.
BULK_RE = re.compile(
    r"\bALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*;"
    r"|\b(?:GRANT|REVOKE)\b[^;]*?\bON\s+ALL\s+\w+\s+IN\s+SCHEMA\b[^;]*;"
    r"|\b(?:GRANT|REVOKE)\b[^;]*?\bON\s+SCHEMA\b[^;]*;",
    re.I | re.S,
)


def extract_grants(body):
    """Parse literal GRANT/REVOKE statements into verifiable privilege checks.

    Anything privilege-shaped that cannot be resolved to a concrete object is
    returned as `unparsed` so the caller can refuse to pass it silently.
    """
    checks, unparsed = [], []

    # Privilege statements assembled at runtime carry no static signature.
    for m in re.finditer(
        r"\bEXECUTE\s+format\s*\(\s*'\s*(GRANT|REVOKE)\b[^']*'", body, re.I
    ):
        unparsed.append(" ".join(m.group(0).split())[:120])

    # Schema-wide and default-privilege grants name no single object. Report
    # them, then remove them so the per-object parser never sees them.
    for m in BULK_RE.finditer(body):
        unparsed.append(" ".join(m.group(0).split())[:140])
    body = BULK_RE.sub(" ", body)

    for m in GRANT_RE.finditer(body):
        verb = m.group(1).upper()
        privs = " ".join(m.group(2).split()).upper()
        kind = (m.group(3) or "TABLE").upper()
        target = m.group(4)
        args = (m.group(5) or "").strip()
        roles = [
            r.strip().strip('"')
            for r in m.group(6).split(",")
            if r.strip() and r.strip().upper() not in ("CASCADE", "RESTRICT")
        ]
        if kind == "SCHEMA" or target.upper() == "ALL":
            unparsed.append(f"{verb} ... ON {kind} {target}")
            continue
        schema, obj = qualify(target)
        priv = "EXECUTE" if kind in ("FUNCTION", "PROCEDURE", "ROUTINE") else (
            privs.split()[0] if privs and privs != "ALL" else "SELECT"
        )
        for role in roles:
            want = "true" if verb == "GRANT" else "false"
            is_public = role.upper() == "PUBLIC"
            if kind in ("FUNCTION", "PROCEDURE", "ROUTINE"):
                if not args:
                    unparsed.append(f"{verb} {priv} ON FUNCTION {target} (no signature)")
                    continue
                ident = lit(f"{schema}.{obj}{args}")
                if is_public:
                    # has_function_privilege() rejects the PUBLIC pseudo-role, so
                    # read the ACL directly. An empty grantee ("=X/owner") IS the
                    # PUBLIC grant, and a NULL acl means the Postgres default —
                    # which for functions is EXECUTE TO PUBLIC. Skipping PUBLIC
                    # would hide the exact trap these revokes exist to close.
                    #
                    # to_regprocedure() (NOT ::regprocedure) is load-bearing: the
                    # cast RAISES 42883 for an absent function, and since every
                    # check is batched into one `union all`, one missing object
                    # aborts the WHOLE query — the gate then reports an operational
                    # error instead of the gap it exists to find. to_regprocedure()
                    # returns NULL instead and the row drops out.
                    #
                    # The `is not null` conjunct is equally load-bearing, and for a
                    # different reason. A REVOKE check wants `false`, so an absent
                    # object would give coalesce(NULL,false)=false → the assertion
                    # passes VACUOUSLY and the gate reports OK having verified
                    # nothing. It is not enough to say "the CREATE existence check
                    # catches that" — existence checks are emitted only FROM CREATE
                    # statements, so a REVOKE/GRANT-ONLY migration (hardening an
                    # object created by an earlier migration) emits none at all.
                    # That is exactly the migration class most worth gating.
                    # Requiring the object to resolve makes an absent target read as
                    # MISSING for both GRANT and REVOKE.
                    expr = (
                        f"(to_regprocedure({ident}) is not null and "
                        "coalesce((select coalesce(array_to_string(p.proacl, ','), '=X/owner') "
                        f"~ '(^|,)=[a-zA-Z]*X' from pg_proc p where p.oid = to_regprocedure({ident})), false) = {want})"
                    )
                else:
                    # Same two reasons: has_function_privilege(role, text, ...)
                    # raises 42883 when the function is absent, and a REVOKE check
                    # would otherwise pass vacuously on a missing object.
                    expr = (
                        f"(to_regprocedure({ident}) is not null and "
                        f"coalesce((select has_function_privilege({lit(role)}, p.oid, 'EXECUTE') "
                        f"from pg_proc p where p.oid = to_regprocedure({ident})), false) = {want})"
                    )
            else:
                ident = lit(f"{schema}.{obj}")
                if is_public:
                    expr = (
                        f"(to_regclass({ident}) is not null and "
                        "coalesce((select array_to_string(c.relacl, ',') ~ '(^|,)=[a-zA-Z]' "
                        f"from pg_class c where c.oid = to_regclass({ident})), false) = {want})"
                    )
                else:
                    expr = (
                        f"(to_regclass({ident}) is not null and "
                        f"coalesce((select has_table_privilege({lit(role)}, c.oid, {lit(priv)}) "
                        f"from pg_class c where c.oid = to_regclass({ident})), false) = {want})"
                    )
            checks.append(
                Check(
                    f"grant {role} {'has' if want == 'true' else 'lacks'} {priv} on {schema}.{obj}",
                    expr,
                )
            )
    return checks, unparsed


# ---------------------------------------------------------------------- main
def main(argv):
    paths = [a for a in argv[1:] if not a.startswith("-")]
    if not paths:
        sys.stderr.write(__doc__.split("CONTRACT")[1].split("LIMITATION")[0])
        return EXIT_OPERR

    ref = os.environ.get("SUPABASE_PROJECT_REF", DEFAULT_REF)
    token = load_token()

    worst = EXIT_OK
    for path in paths:
        try:
            with open(path) as fh:
                sql = fh.read()
        except OSError as exc:
            print(f"!! cannot read {path}: {exc}")
            worst = max(worst, EXIT_OPERR)
            continue

        name = os.path.basename(path)
        checks, grants, unparsed, has_dml = extract(sql)
        print(f"\n=== {name} ===")

        if not checks and not grants:
            print("  NOT CHECKABLE BY OBJECT EXISTENCE — this migration declares no")
            print("  tables/columns/functions/policies/indexes/constraints/buckets.")
            if unparsed:
                print("  It DOES change privileges, but not in a form that resolves")
                print("  to one named object (dynamic EXECUTE format, or schema-wide):")
                for u in unparsed:
                    print(f"    - {u}")
                print("  Verify the grants manually, e.g.:")
                print("    select p.oid::regprocedure,")
                print("           has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec,")
                print("           has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec")
                print("      from pg_proc p join pg_namespace n on n.oid=p.pronamespace")
                print("     where n.nspname='public' and p.proname='<function>';")
            elif has_dml:
                print("  It is data-only (INSERT/UPDATE/DELETE). Verify the rows manually.")
            print("  VERDICT: NOT CHECKABLE (exit 3) — this gate refuses to report PASS.")
            worst = max(worst, EXIT_UNCHECKABLE)
            continue

        all_checks = checks + grants
        sql_union = " union all ".join(
            f"select {lit(c.label)} as obj, ({c.expr}) as ok" for c in all_checks
        )
        try:
            rows = query(sql_union + ";", ref, token)
        except Exception as exc:  # noqa: BLE001 - surface any transport failure
            print(f"  !! query failed: {exc}")
            worst = max(worst, EXIT_OPERR)
            continue

        state = {r.get("obj"): r.get("ok") for r in rows}
        notes = {c.label: c.note for c in all_checks}
        missing = 0
        for c in all_checks:
            ok = state.get(c.label)
            if ok:
                mark = "OK     "
            else:
                mark = "MISSING"
                missing += 1
            suffix = f"   ({notes[c.label]})" if notes.get(c.label) else ""
            print(f"  [{mark}] {c.label}{suffix}")

        if unparsed:
            print("  ! dynamic GRANT/REVOKE present — NOT verified by this gate:")
            for u in unparsed:
                print(f"    - {u}")
            worst = max(worst, EXIT_UNCHECKABLE)

        if missing:
            print(f"  VERDICT: GAP — {missing} declared object(s) absent from production.")
            worst = max(worst, EXIT_GAP)
        else:
            print(f"  VERDICT: all {len(all_checks)} declared object(s) present.")

    print("\n" + "=" * 68)
    if worst == EXIT_OK:
        print("GATE PASS — every declared object verified present in production.")
    elif worst == EXIT_GAP:
        print("GATE FAIL — MIGRATION GAP. Deployed code may expect absent schema.")
        print("Apply the migration's SQL (show-SQL-first), then re-run this gate.")
    elif worst == EXIT_UNCHECKABLE:
        print("GATE INCONCLUSIVE — a migration could not be verified by object existence.")
        print("Do NOT report the deploy healthy until the items above are checked by hand.")
    else:
        print("GATE ERROR — could not complete the check.")
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv))
