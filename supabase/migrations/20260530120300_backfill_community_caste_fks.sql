-- Phase 2 — Backfill community_category_id + caste_id from legacy TEXT.
-- Idempotent: only fills rows where the FK is still null. Text columns are left
-- intact for any rows that don't match (surfaced later via the data-quality tool).

-- 1) community_category_id — exact code match (case-insensitive)
update public.learners_profiles lp
set community_category_id = cc.id
from public.community_categories cc
where lp.community_category_id is null
  and lp.community is not null and btrim(lp.community) <> ''
  and upper(btrim(lp.community)) = upper(cc.code);

-- 2) community_category_id — legacy variants:
--    "BCM" -> BC-M ; "SC (A)" / "SC(A)" -> SC-A
update public.learners_profiles lp
set community_category_id = cc.id
from public.community_categories cc
where lp.community_category_id is null
  and cc.code = 'BC-M'
  and upper(regexp_replace(lp.community, '[^A-Za-z]', '', 'g')) = 'BCM';

update public.learners_profiles lp
set community_category_id = cc.id
from public.community_categories cc
where lp.community_category_id is null
  and cc.code = 'SC-A'
  and upper(regexp_replace(lp.community, '[^A-Za-z]', '', 'g')) = 'SCA';

-- 3) caste_id — match within the learner's community by canonical name or alias
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
