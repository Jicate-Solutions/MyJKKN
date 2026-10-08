-- ============================================================================
-- HR Recruitment Jobs — website SEO columns
-- Created: 2026-10-06
--
-- Why
-- ---
-- Open jobs are published on jkkn.ac.in/careers through the public careers API
-- (lib/services/hr/public-careers/public-job.ts). The page HEADING and TEXT come
-- from title/description and must stay exactly what HR wrote. Search engines,
-- however, rank on the hidden <title> / meta description, and 173 of 366 live
-- jobs currently share their <title> with another job ("Professor at JKKN
-- Dental College and Hospital" ×18).
--
-- These columns hold SEO text that ONLY the website's <head> uses. They never
-- change what applicants see on the page. All are optional: when empty, the
-- website builds the SEO text from the job's own fields as it does today.
--
-- Additive only — no existing column or row is modified.
-- ============================================================================

alter table public.hr_recruitment_jobs
  add column if not exists seo_title       text,
  add column if not exists seo_description text,
  add column if not exists seo_keywords    text[] not null default '{}',
  add column if not exists seo_og_image    text,
  add column if not exists seo_noindex     boolean not null default false;

-- Limits match what search engines display (title ~60, description ~160) with
-- headroom; the HR form shows the recommended lengths.
alter table public.hr_recruitment_jobs
  drop constraint if exists hr_recruitment_jobs_seo_title_len_chk,
  drop constraint if exists hr_recruitment_jobs_seo_description_len_chk,
  drop constraint if exists hr_recruitment_jobs_seo_keywords_count_chk,
  drop constraint if exists hr_recruitment_jobs_seo_og_image_https_chk;

alter table public.hr_recruitment_jobs
  add constraint hr_recruitment_jobs_seo_title_len_chk
    check (seo_title is null or char_length(seo_title) <= 70),
  add constraint hr_recruitment_jobs_seo_description_len_chk
    check (seo_description is null or char_length(seo_description) <= 170),
  add constraint hr_recruitment_jobs_seo_keywords_count_chk
    check (cardinality(seo_keywords) <= 15),
  add constraint hr_recruitment_jobs_seo_og_image_https_chk
    check (seo_og_image is null or seo_og_image ~ '^https://');

comment on column public.hr_recruitment_jobs.seo_title is
  'Website <title> for /careers/<job>. Hidden from applicants (search results and browser tab only). NULL = auto from title.';
comment on column public.hr_recruitment_jobs.seo_description is
  'Website meta description (search-result snippet). Hidden from applicants. NULL = auto from job fields.';
comment on column public.hr_recruitment_jobs.seo_keywords is
  'Website meta keywords / target search phrases for this job. Hidden from applicants.';
comment on column public.hr_recruitment_jobs.seo_og_image is
  'https image used when the job link is shared (WhatsApp, LinkedIn). NULL = site default.';
comment on column public.hr_recruitment_jobs.seo_noindex is
  'true = website asks search engines not to index this job (test jobs). The job is still listed and can be applied to.';
