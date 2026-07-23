-- Phase 2 — Shadow-text trigger
--
-- Keeps the legacy TEXT columns learners_profiles.community / .caste in sync when
-- the form writes the new FKs (community_category_id / caste_id). Lets the ~30
-- existing readers/exports keep working during the FK migration. Only writes the
-- text when the matching FK is present, so it never nulls the NOT NULL community
-- column and never clobbers legacy text-only writes.

create or replace function public.sync_learner_community_caste_text()
returns trigger
language plpgsql
as $$
begin
  if new.community_category_id is not null then
    select cc.code into new.community
    from public.community_categories cc
    where cc.id = new.community_category_id;
  end if;

  if new.caste_id is not null then
    select c.name into new.caste
    from public.castes c
    where c.id = new.caste_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_learner_community_caste_text on public.learners_profiles;
create trigger trg_sync_learner_community_caste_text
  before insert or update of community_category_id, caste_id
  on public.learners_profiles
  for each row
  execute function public.sync_learner_community_caste_text();
