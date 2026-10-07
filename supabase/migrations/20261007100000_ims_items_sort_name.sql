-- Items list: alphabetise chemicals the way a catalogue does.
--
-- Ordering by `name` put the numbered chemicals ("1.2 DICHLORO ETHANE",
-- "2-AMINO PHENOL", "3 PICOLINE LR" ...) ahead of every A-Z name, so page 1
-- of the lab store looked unsorted. sort_name drops the leading locant
-- (digits, dots, commas, dashes, brackets, spaces) up to the first letter, so
-- "2-AMINO PHENOL" files under A and "1.2 DICHLORO ETHANE" under D. The
-- displayed name is untouched. A name with no letters keeps itself as the key.

alter table public.ims_items
  add column if not exists sort_name text
  generated always as (
    coalesce(
      nullif(upper(btrim(regexp_replace(name, '^[\s0-9.,''()-]*(?=[A-Za-z])', ''))), ''),
      upper(name)
    )
  ) stored;

comment on column public.ims_items.sort_name is
  'Display order key: upper(name) without a leading chemical locant ("2-", "1.2 "). Generated; order lists by (sort_name, name).';

create index if not exists idx_ims_items_institution_sort_name
  on public.ims_items (institution_id, sort_name, name);
