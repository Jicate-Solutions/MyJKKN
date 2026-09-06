-- ─────────────────────────────────────────────────────────────────────────────
-- Denormalize `counselling_code` onto every bos_* table that carries an
-- institutions_id, so institution filtering can collapse a CAS Aided+SF pair to
-- one value: `WHERE counselling_code = 'CAS'` instead of expanding a UUID to its
-- sibling pair (`institutions_id IN (aided, sf)`).
--
-- ADDITIVE / non-breaking:
--   • institutions_id stays the FK source of truth; existing IN(...) queries work.
--   • counselling_code is a denormalized convenience column kept current by a
--     BEFORE INSERT/UPDATE trigger that reads public.institutions.
--   • RLS is unchanged (role_has_institution_access is already CAS-aware).
--
-- Backfill join: the MyJKKN public.institutions table has PER-SIBLING rows
-- (id = each MyJKKN institution UUID) each carrying counselling_code, so a CAS
-- pair (two rows, same code) both resolve to the same code. (The COE-side
-- institutions table — id = coe_id, myjkkn_institution_ids[] — is a different DB
-- and is NOT used here.)
--
-- Dynamic: discovers every public.bos_* BASE TABLE with an institutions_id
-- column from information_schema, so no table is missed and tables without the
-- column are skipped automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Shared trigger function: set counselling_code from the row's institutions_id.
create or replace function public.bos_set_counselling_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if NEW.institutions_id is null then
    NEW.counselling_code := null;
  else
    select i.counselling_code
      into NEW.counselling_code
      from public.institutions i
     where i.id = NEW.institutions_id;
  end if;
  return NEW;
end
$fn$;

comment on function public.bos_set_counselling_code() is
  'Keeps bos_*.counselling_code in sync with institutions.counselling_code (denormalized CAS-spanning key).';

-- 2) Per-table: add column, backfill, index, attach trigger.
do $do$
declare
  t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema
       and tb.table_name   = c.table_name
     where c.table_schema = 'public'
       and c.table_name ~ '^bos_'
       and c.column_name = 'institutions_id'
       and tb.table_type = 'BASE TABLE'
     group by c.table_name
     order by c.table_name
  loop
    -- 2a) Column
    execute format(
      'alter table public.%I add column if not exists counselling_code varchar(50);',
      t
    );

    -- 2b) Backfill from the MyJKKN institutions table (id = institutions_id).
    execute format(
      'update public.%I tt
          set counselling_code = i.counselling_code
         from public.institutions i
        where tt.institutions_id = i.id
          and tt.counselling_code is distinct from i.counselling_code;',
      t
    );

    -- 2c) Index for code-based filtering.
    execute format(
      'create index if not exists %I on public.%I (counselling_code);',
      'idx_' || t || '_counselling_code', t
    );

    -- 2d) Keep-in-sync trigger (fires on insert, and on update of institutions_id).
    execute format('drop trigger if exists %I on public.%I;',
      t || '_set_counselling_code', t);
    execute format(
      'create trigger %I
         before insert or update of institutions_id on public.%I
         for each row execute function public.bos_set_counselling_code();',
      t || '_set_counselling_code', t
    );

    raise notice '[bos counselling_code] processed table %', t;
  end loop;
end
$do$;

-- 3) Verification: warn (do not fail) on any row that has an institutions_id but
--    no resolved counselling_code — i.e. an institutions_id with no matching
--    institutions row (a real data issue to investigate, not silently ignore).
do $verify$
declare
  t text;
  cnt bigint;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema
       and tb.table_name   = c.table_name
     where c.table_schema = 'public'
       and c.table_name ~ '^bos_'
       and c.column_name = 'institutions_id'
       and tb.table_type = 'BASE TABLE'
     group by c.table_name
     order by c.table_name
  loop
    execute format(
      'select count(*) from public.%I where institutions_id is not null and counselling_code is null;',
      t
    ) into cnt;
    if cnt > 0 then
      raise warning '[bos counselling_code] % rows still NULL after backfill in % (institutions_id with no matching institutions row)', cnt, t;
    end if;
  end loop;
end
$verify$;
