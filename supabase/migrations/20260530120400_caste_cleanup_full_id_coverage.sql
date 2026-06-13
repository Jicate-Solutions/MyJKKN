-- Phase 6 — Caste data cleanup for full FK/ID coverage.
-- Goal: every learner that has a caste text resolves to a caste_id (except OC,
-- which has no caste taxonomy). Steps:
--   A. Curated aliases for common spelling variants (fold into canonical rows).
--   B. Add SC-A castes (Arunthathiyar, Chakkiliyan, Madiga, Madari, Adi Andhra,
--      Pagadai, Thoti) ALSO under SC — they're operationally recorded as SC.
--   C. OC has no caste list — clear stray caste text/id on OC learners.
--   D. Backfill by name/alias (exact, case-insensitive) within community.
--   E. Backfill by NORMALIZED match (strip non-alphanumerics) within community.
--   F. Auto-create a caste row from the recorded text for anything still
--      unmatched (faithful to existing data; mergeable later via the admin UI).
--   G. Final exact backfill — resolves the auto-created rows.

-- ── A. curated aliases (idempotent append + de-dupe) ────────────────────────
update public.castes set aliases = array(select distinct x from unnest(aliases || array['kulalar']::text[]) x)
  where community_category_id = (select id from community_categories where code='MBC') and name='Kulala';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['kongu chettiyar','kongu chettiar','kongu chetty']::text[]) x)
  where community_category_id = (select id from community_categories where code='MBC') and name='Kongu Chettia';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['thottia naicker','thottia naickers']::text[]) x)
  where community_category_id = (select id from community_categories where code='MBC') and name='Thotti Naicker';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['vettuva goundar']::text[]) x)
  where community_category_id = (select id from community_categories where code='MBC') and name='Vettuva Gounder';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['vanniya kula sathriyan','vanniyar kula sathriyan']::text[]) x)
  where community_category_id = (select id from community_categories where code='MBC') and name='Vanniakula Kshatriya';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['devanga chettiyar','devangar chettiyar','devanga chetty']::text[]) x)
  where community_category_id = (select id from community_categories where code='BC') and name='Devangar, Sedar';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['kongu vellalar goundar','kongu vellala goundar']::text[]) x)
  where community_category_id = (select id from community_categories where code='BC') and name='Kongu Vellalars';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['yadava']::text[]) x)
  where community_category_id = (select id from community_categories where code='BC') and name='Yadhava';
update public.castes set aliases = array(select distinct x from unnest(aliases || array['paraiyar']::text[]) x)
  where community_category_id = (select id from community_categories where code='SC') and name='Paraiyan, Parayan, Sambavar';

-- ── B. SC-A castes also valid under SC community ─────────────────────────────
insert into public.castes (community_category_id, name, aliases, sort_order)
select sc.id, x.name, x.aliases, 200
from public.community_categories sc
cross join (values
  ('Arunthathiyar', array['arundhadhiyar','arundhathiyar','arunthadhiyar','arunthathiyar']::text[]),
  ('Chakkiliyan',   array['chakkili','sakkiliyan']::text[]),
  ('Madiga',        '{}'::text[]),
  ('Madari',        '{}'::text[]),
  ('Adi Andhra',    '{}'::text[]),
  ('Pagadai',       '{}'::text[]),
  ('Thoti',         '{}'::text[])
) as x(name, aliases)
where sc.code = 'SC'
on conflict (community_category_id, name) do nothing;

-- ── C. OC has no caste taxonomy — clear stray values ────────────────────────
update public.learners_profiles lp
set caste = null, caste_id = null
from public.community_categories cc
where lp.community_category_id = cc.id and cc.code = 'OC'
  and (lp.caste is not null or lp.caste_id is not null);

-- ── D. exact name/alias backfill within community ───────────────────────────
update public.learners_profiles lp
set caste_id = c.id
from public.castes c
where lp.caste_id is null
  and lp.caste is not null and btrim(lp.caste) <> ''
  and c.community_category_id = lp.community_category_id
  and (
    lower(btrim(lp.caste)) = lower(c.name)
    or lower(btrim(lp.caste)) = any (array(select lower(a) from unnest(c.aliases) a))
  );

-- ── E. normalized backfill within community (strip non-alphanumerics) ───────
update public.learners_profiles lp
set caste_id = c.id
from public.castes c
where lp.caste_id is null
  and lp.caste is not null and btrim(lp.caste) <> ''
  and c.community_category_id = lp.community_category_id
  and (
    upper(regexp_replace(lp.caste, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(c.name, '[^A-Za-z0-9]', '', 'g'))
    or upper(regexp_replace(lp.caste, '[^A-Za-z0-9]', '', 'g')) = any (
         array(select upper(regexp_replace(a, '[^A-Za-z0-9]', '', 'g')) from unnest(c.aliases) a))
  );

-- ── F. auto-create caste rows from recorded text for the remainder ──────────
insert into public.castes (community_category_id, name, sort_order)
select distinct lp.community_category_id, btrim(lp.caste), 900
from public.learners_profiles lp
where lp.caste_id is null
  and lp.caste is not null and btrim(lp.caste) <> ''
  and lp.community_category_id is not null
on conflict (community_category_id, name) do nothing;

-- ── G. final exact backfill ─────────────────────────────────────────────────
update public.learners_profiles lp
set caste_id = c.id
from public.castes c
where lp.caste_id is null
  and lp.caste is not null and btrim(lp.caste) <> ''
  and c.community_category_id = lp.community_category_id
  and lower(btrim(lp.caste)) = lower(c.name);
