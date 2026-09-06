/**
 * Unit tests for scripts/ci/lib/sql-relation-parser.mjs — the parsing layer behind
 * the new-relation anon-lock gate.
 *
 * The gate's own suite (check-table-anon-revoke.test.ts) drives the real script as
 * a subprocess and asserts on exit codes. These tests go one level down and pin the
 * question that subprocess cannot ask directly: WHICH relations does this text
 * create, and when?
 *
 * The distinction is the whole point. "Is it inside quotes" and "does it execute"
 * are different questions, and they come apart in both directions:
 *
 *   quoted but EXECUTES  -> DO $$ BEGIN CREATE TABLE ... END $$;   must be CAUGHT
 *   quoted and INERT     -> 'CREATE TABLE ...' in a tag list        must be IGNORED
 *
 * Getting the first one wrong is how the 2026-07-31 anon leak of 179 learners'
 * identities happens. Getting the second wrong is how a security gate ends up
 * demanding a REVOKE for a table nobody created, which trains people to reach for
 * the escape hatch — and a hatch reached for by habit is a gate that has stopped
 * gating. Both directions are pinned below.
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeSql,
  splitStatements,
  statementNamesRelation,
  unwrapDynamicSql,
  unquoteIdent,
} from '../../scripts/ci/lib/sql-relation-parser.mjs';

/** Relation names this SQL creates when the migration runs. */
function immediate(sql: string): string[] {
  const a = analyzeSql(sql);
  return [...a.tables, ...a.views.map((v: { name: string }) => v.name)].sort();
}

/** Relation names created only later, when a function defined here is called. */
function deferredNames(sql: string): string[] {
  return analyzeSql(sql)
    .deferred.flatMap((d: { tables: string[]; views: { name: string }[] }) => [
      ...d.tables,
      ...d.views.map((v) => v.name),
    ])
    .sort();
}

describe('sql-relation-parser — phantom relations (text that creates nothing)', () => {
  it('does not invent a table from a CREATE TABLE inside a single-quoted string', () => {
    const sql = `
      INSERT INTO public.doc_snippets (body)
      VALUES ('CREATE TABLE public.phantom_from_string (id uuid);');
    `;
    expect(immediate(sql)).toEqual([]);
    expect(deferredNames(sql)).toEqual([]);
  });

  it('does not invent a table from a line comment or a block comment', () => {
    const sql = `
      -- CREATE TABLE public.phantom_line (id uuid);
      /* CREATE TABLE public.phantom_block (id uuid);
         /* nested, because PostgreSQL nests block comments
            CREATE TABLE public.phantom_nested (id uuid); */
      */
      REVOKE ALL ON TABLE public.some_existing FROM anon, PUBLIC;
    `;
    expect(immediate(sql)).toEqual([]);
  });

  it('does not invent a relation named after a RESERVED WORD (the `CREATE TABLE AS` tag)', () => {
    // The exact shape in 20260808220000_autolock_new_public_relations.sql, the
    // migration that installs the ddl_command_end event trigger. CREATE EVENT
    // TRIGGER syntax forces those command tags to be written as string literals,
    // and the old parser read the `AS` in 'CREATE TABLE AS' as a table name — so
    // the migration installing the DATABASE half of this defence had to burn BOTH
    // escape hatches on itself to get merged.
    const sql = `
      CREATE OR REPLACE FUNCTION public.fn_autolock() RETURNS event_trigger
      LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        FOR r IN SELECT objid FROM pg_event_trigger_ddl_commands()
          WHERE schema_name = 'public'
            AND command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO',
                                'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
        LOOP
          EXECUTE format('REVOKE ALL ON %s FROM anon, PUBLIC', r.object_identity);
        END LOOP;
      END $$;
    `;
    expect(immediate(sql)).toEqual([]);
    expect(deferredNames(sql)).toEqual([]);
  });

  it('keeps a QUOTED reserved word as a real relation name', () => {
    // `CREATE TABLE as (...)` is a syntax error, but `"as"` is a legal name, so the
    // reserved-word filter must key on the quoting and not on the word alone.
    expect(immediate('CREATE TABLE public."as" (id uuid);')).toEqual(['as']);
  });

  it('reports a CREATE TABLE in a FUNCTION body as DEFERRED, not as created here', () => {
    const sql = `
      CREATE OR REPLACE FUNCTION public.fn_make_scratch() RETURNS void
      LANGUAGE plpgsql AS $fn$
      BEGIN
        CREATE TABLE public.made_by_the_function (id uuid PRIMARY KEY);
      END;
      $fn$;
    `;
    expect(immediate(sql)).toEqual([]);
    expect(deferredNames(sql)).toEqual(['made_by_the_function']);
  });
});

describe('sql-relation-parser — quoted BUT executable (the dangerous direction)', () => {
  it('CATCHES a CTAS inside a DO block: it runs at migration time', () => {
    // A DO body is dollar-quoted and executes immediately. Any fix that killed the
    // phantoms by ignoring dollar-quoting wholesale would go blind to exactly this
    // — a CTAS copy of learner rows, born with the anon default grant and without
    // RLS. That is the 2026-07-31 shape.
    const sql = `
      DO $$
      BEGIN
        CREATE TABLE public._bak_learners_20260802 AS SELECT * FROM public.learners_profiles;
      END $$;
    `;
    expect(immediate(sql)).toEqual(['_bak_learners_20260802']);
    expect(deferredNames(sql)).toEqual([]);
  });

  it('CATCHES DDL that a DO block runs via EXECUTE of a NESTED dollar-quoted string', () => {
    // Not hypothetical: 20260530150000_instagram_lead_attribution.sql ships exactly
    // this. A first cut of this parser treated only the outer $$ as executable and
    // blanked the inner $view$ as if it were a function body, turning a caught view
    // into a missed one. The repo-wide old-vs-new diff is what surfaced it.
    const sql = `
      DO $$
      BEGIN
        IF to_regclass('public.ig_posts') IS NOT NULL THEN
          EXECUTE $view$
            CREATE VIEW public.v_ig_admission_attribution AS SELECT 1 AS id;
          $view$;
        END IF;
      END $$;
    `;
    expect(immediate(sql)).toEqual(['v_ig_admission_attribution']);
  });

  it("CATCHES DDL that a DO block runs via EXECUTE of a single-quoted string", () => {
    const sql = `
      DO $$
      BEGIN
        EXECUTE 'CREATE TABLE public._bak_dynamic_20260802 AS SELECT 1 AS id';
      END $$;
    `;
    expect(immediate(sql)).toEqual(['_bak_dynamic_20260802']);
  });

  it('credits a REVOKE written INSIDE a DO block, so a correct DO block is satisfiable', () => {
    // Without this the gate would be a wall rather than a gate for backup relations
    // created in a DO block: they have no escape hatch, so if an in-block revoke
    // could not be seen there would be no way to pass at all.
    const sql = `
      DO $$
      BEGIN
        CREATE TABLE public._bak_walled_20260802 AS SELECT 1 AS id;
        REVOKE ALL ON TABLE public._bak_walled_20260802 FROM anon, PUBLIC;
      END $$;
    `;
    const { statements } = analyzeSql(sql);
    expect(statements.some((s: string) => /^revoke\b/i.test(s))).toBe(true);
  });
});

describe('sql-relation-parser — identifier quoting', () => {
  it('reads a quoted identifier containing spaces as ONE whole name', () => {
    // The old name pattern was `"?[A-Za-z0-9_]+"?`, which stopped at the space and
    // reported a relation called `Bak`. A REVOKE naming a DIFFERENT "Bak Something"
    // then satisfied the check, because both merely contain `Bak`.
    expect(immediate('CREATE TABLE public."Bak Copy 20260802" (id uuid);'))
      .toEqual(['Bak Copy 20260802']);
  });

  it('does not let a revoke on one quoted relation satisfy a different one', () => {
    const stmt = 'REVOKE ALL ON TABLE public."Bak Copy Alpha" FROM anon, PUBLIC';
    expect(statementNamesRelation(stmt, 'Bak Copy Alpha')).toBe(true);
    expect(statementNamesRelation(stmt, 'Bak Copy Beta')).toBe(false);
  });

  it('never matches a relation name as a mere substring of a longer name', () => {
    const stmt = 'REVOKE ALL ON TABLE public.learner_scores_archive FROM anon, PUBLIC';
    expect(statementNamesRelation(stmt, 'learner_scores_archive')).toBe(true);
    expect(statementNamesRelation(stmt, 'learner_scores')).toBe(false);
  });

  it('treats a regex metacharacter in a quoted name as a literal, not a pattern', () => {
    // `.` in an unescaped regex matched any character, so `"a.b"` matched `axb`.
    const stmt = 'REVOKE ALL ON TABLE public."a.b" FROM anon, PUBLIC';
    expect(statementNamesRelation(stmt, 'a.b')).toBe(true);
    expect(statementNamesRelation('REVOKE ALL ON TABLE public.axb FROM anon', 'a.b')).toBe(false);
  });

  it('unquotes doubled quotes inside an identifier', () => {
    expect(unquoteIdent('"Bak ""X"""')).toBe('Bak "X"');
    expect(unquoteIdent('plain_name')).toBe('plain_name');
  });
});

describe('sql-relation-parser — scanner robustness', () => {
  it('does not desynchronise on a backslash-escaped quote in an E-string', () => {
    // \' does NOT end an E-string. A scanner that thinks it does reads the rest of
    // the file in the wrong state, and everything after it is classified wrongly.
    const sql = `
      INSERT INTO public.audit_log (msg) VALUES (E'don\\'t panic');
      CREATE TABLE public.after_the_estring (id uuid PRIMARY KEY);
    `;
    expect(immediate(sql)).toEqual(['after_the_estring']);
  });

  it('handles a doubled quote inside an ordinary string literal', () => {
    const sql = `
      COMMENT ON TABLE public.t IS 'it''s fine, no CREATE TABLE public.ghost here';
      CREATE TABLE public.after_the_string (id uuid PRIMARY KEY);
    `;
    expect(immediate(sql)).toEqual(['after_the_string']);
  });

  it('does not split statements on a semicolon inside a dollar-quoted body', () => {
    const stmts = splitStatements(
      'CREATE FUNCTION f() RETURNS void AS $$ BEGIN a; b; END $$; SELECT 1;'
    );
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('$$');
  });

  it('still recognises the ordinary shapes: CTAS, IF NOT EXISTS, UNLOGGED, matviews', () => {
    expect(immediate('CREATE TABLE public.plain_ctas AS SELECT 1 AS id;')).toEqual(['plain_ctas']);
    expect(immediate('CREATE TABLE IF NOT EXISTS public.maybe_new (id uuid);')).toEqual(['maybe_new']);
    expect(immediate('CREATE UNLOGGED TABLE public.fast_scratch (id uuid);')).toEqual(['fast_scratch']);
    expect(analyzeSql('CREATE MATERIALIZED VIEW public.mv_x AS SELECT 1 AS id;').views)
      .toEqual([{ name: 'mv_x', kind: 'materialized view' }]);
  });

  it('still skips TEMP relations and non-public schemas', () => {
    const sql = `
      CREATE TEMP TABLE scratch (id uuid);
      CREATE TABLE storage.other_schema (id uuid);
      CREATE TEMP VIEW scratch_v AS SELECT 1 AS id;
    `;
    expect(immediate(sql)).toEqual([]);
  });
});

describe('sql-relation-parser — dynamic SQL unwrapping (deferred bodies only)', () => {
  it('makes an EXECUTEd REVOKE inside a function body visible to an anchored matcher', () => {
    // 20260616000000 builds v_privilege_memberships_effective inside a function and
    // revokes anon on it the same way. Both halves are wrapped in string literals,
    // so without unwrapping the gate would report a correct migration as unlocked.
    const sql = `
      CREATE OR REPLACE FUNCTION public._rebuild_view() RETURNS void
      LANGUAGE plpgsql AS $$
      BEGIN
        EXECUTE $e$ CREATE OR REPLACE VIEW v_priv_effective AS SELECT 1 AS id; $e$;
        EXECUTE 'REVOKE ALL ON v_priv_effective FROM anon, PUBLIC';
      END $$;
    `;
    const { deferred } = analyzeSql(sql);
    expect(deferred).toHaveLength(1);
    expect(deferred[0].views.map((v: { name: string }) => v.name)).toEqual(['v_priv_effective']);
    expect(deferred[0].statements.some((s: string) => /^revoke\b/i.test(s.trim()))).toBe(true);
  });

  it('unwraps EXECUTE / format( / dollar tags without changing offsets', () => {
    const src = "EXECUTE format('REVOKE ALL ON x FROM anon', 1)";
    const out = unwrapDynamicSql(src);
    expect(out.length).toBe(src.length);
    expect(out.trim()).toMatch(/^REVOKE ALL ON x FROM anon/);
  });

  it('does NOT unwrap the migration top level, so a quoted REVOKE cannot satisfy the gate', () => {
    // The sibling secdef guard accepts a commented-out revoke; this one must not
    // acquire the string-literal equivalent of that defect.
    const { statements } = analyzeSql(`
      CREATE TABLE public.t_quoted_revoke (id uuid);
      INSERT INTO public.notes (body) VALUES ('REVOKE ALL ON TABLE public.t_quoted_revoke FROM anon, PUBLIC');
    `);
    expect(statements.some((s: string) => /^revoke\b/i.test(s))).toBe(false);
  });
});
