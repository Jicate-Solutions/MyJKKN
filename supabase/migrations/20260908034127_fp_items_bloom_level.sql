-- 20260908010000_fp_items_bloom_level.sql
--
-- Renumbered 2026-08-15 from 20260812100000. That version was free when this
-- file was written on 2026-08-06, but `jicate/main` has since merged
-- 20260812100000_seed_hr_onboarding_checklists_all_orgs.sql, so the two files
-- collided the moment main was merged in here. Safe to renumber: this migration
-- is unapplied — verified live 2026-08-15, `fp_items.advanced_dimension` absent
-- from information_schema.columns — so no already-applied version is being
-- renamed. 20260908010000 is absent from both the repo files and
-- supabase_migrations.schema_migrations (both checked 2026-08-15).
--
-- Foundation Programme item bank: record what each question asks for, in the
-- vocabulary of the JKKN Advanced Bloom's Taxonomy (`jkkn_advanced`).
--
-- Today `fp_items` carries exactly one signal about how hard a question is:
-- `difficulty smallint 1..5`, set by whoever authored the row. That number says
-- how hard the author felt the item was. It does not say what the item ASKS FOR
-- — recall a name, explain a case, work a value out, or separate two cases.
-- Without that, nobody can answer the question the bank exists to answer:
-- is this a bank that teaches thinking, or a bank that rewards memory?
--
-- This migration adds the column. It writes NO values.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SHAPE: TWO LABELS, because the framework has two halves.
--
-- The JKKN Advanced Bloom's Taxonomy (`jkkn_advanced`, rulings of record
-- 2026-08-06) is TEN elements in two different shapes:
--
--   K1..K6  Bloom's cognitive levels, retained unchanged — a LADDER
--   A1      Human Dimension          ┐
--   A2      Caring                   │ not a ladder: these run alongside every
--   A3      Learning How to Learn    │ K level, and A3 is not "higher" than A1
--   A4      Performed Skill          │ (Bloom's psychomotor, in 3 bands)
--   A5      Accountable AI Use       ┘ (active, used sparingly; a Board of
--                                      Studies opts a course in — 2026-08-06)
--
-- The spec is explicit that ONE TASK CARRIES BOTH: "Every task gets two labels.
-- The K says how hard the thinking is. The A says what else the task builds in
-- the student." So this is two columns, NOT one column holding either.
--
-- That distinction is load-bearing here. `obe_course_outcomes.taxonomy_level`
-- already crams both vocabularies into a single column — 4,360 K-codes and 690
-- Fink codes side by side, `taxonomy_dimension` NULL on all 6,381 rows — which
-- makes the two taxonomies mutually exclusive and the coverage rule
-- unmeasurable. Repeating that shape here would bake the same trap into a new
-- table.
--
-- The four framework rules this shape has to satisfy:
--   Rule 1  every task gets exactly one K        → bloom_level
--   Rule 2  a task MAY also get one A — one, never several
--                                                → advanced_dimension (scalar)
--   Rule 3  a task with NO A is fine             → advanced_dimension is NULLABLE
--   Rule 4  a COURSE with no A is not fine       → coverage rule; not enforceable
--                                                  on an item table, see below
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POLICY (not a schema prohibition): Foundation MCQs will carry no A.
--
-- Every row in `fp_items` today is `q_type = 'mcq_single'` — four options,
-- auto-scored, one answer. Set that against the spec's own reachability matrix
-- for a written format:
--
--   A1 ○ cannot reach      A2 ○ cannot reach      A4 ○ cannot reach
--   A5 ○ cannot reach      A3 ◐ reaches it PARTLY
--
-- and against the evidence rule, which says an element counts as assessed only
-- when the learner produces evidence that could not exist unless they performed
-- the act:
--
--   A1  observed conduct · a named-person interaction · a role actually taken
--   A2  a sustained choice · honest recording of an inconvenient result
--   A3  work on material never taught · a revised approach, with reasons
--   A4  the act performed and observed, with the band judged
--   A5  the prompt used, the error caught, what was changed and why
--
-- A1, A2, A4 and A5 are unreachable in this format outright. A3 is the honest
-- edge case: it IS partly reachable in writing — the spec's own worked example
-- ("you are given a 4x4 matrix you have not been taught… state precisely what
-- you would need to look up to finish") is a written question. But it is not
-- reachable by an AUTO-SCORED MCQ, because the assessable part is the learner
-- saying where their knowledge stopped, and four fixed options cannot carry it.
--
-- So the rule is: an academic reviewer leaves `advanced_dimension` NULL on every
-- `mcq_single` row. That is Rule 3 working as designed, not a gap. The column
-- exists so that the day Foundation grows an item type that CAN carry the
-- evidence — a facilitator's observed record, an unseen-passage free-text item
-- — the framework is already here and no migration is needed to admit it.
--
-- Deliberately NOT enforced by CHECK. A constraint forbidding A-codes outright
-- would foreclose the added half of the framework in the schema, which is the
-- pre-JABT single-taxonomy shape this table is supposed to avoid.
--
-- A4's three bands (a Guided · b Independent · c Adaptive) are NOT in this
-- column's vocabulary. A band records how a performed act went, so it belongs on
-- the artifact that records the act, not on a question in a bank.
--
-- SCOPE CAVEAT, unresolved: the 2026-08-06 rollout ruling makes `jkkn_advanced`
-- the default "for R-2026 regulations; existing regulations unchanged unless
-- their board opts in". The Foundation Programme is a Class 6-8 school
-- programme, not a UG regulation, so it is not yet clear that JABT governs this
-- bank at all. This migration adds vocabulary and writes no values, so it is
-- correct either way; the coverage rule (Rule 4) is deliberately NOT implemented
-- here pending that ruling.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Convention followed — deliberately the degree side's, not a new one:
--   `curriculum_lesson.primary_bloom_level` is `text` holding 'K1'..'K6'
--   (19,424 rows tagged live, read 2026-08-05), and `obe_regulation_config.blooms_active_levels`
--   is `text[]` of the same codes. `bos_taxonomy_levels` names them
--   K1 Remember … K6 Create. So: text, same six codes, same spelling.
--
--   NOT the `bloom_taxonomy_level` ENUM (labels remember/understand/…): its only
--   column in the database is `competency_catalog.bloom_taxonomy_level_deprecated`
--   — deprecated in its own name. Reusing it would spread a retired vocabulary.
--
--   Unlike `curriculum_lesson.primary_bloom_level`, which is deliberately left
--   unconstrained because a model writes it during spine generation and an odd
--   label must never reject an otherwise-valid write, this column is written by
--   a HUMAN REVIEWER accepting a proposal. A tight CHECK is therefore correct
--   here: a typo should fail loudly, not sit in the bank as a seventh level.
--
-- Reversible: ALTER TABLE public.fp_items DROP COLUMN advanced_dimension, DROP COLUMN bloom_level;
-- Tier: additive. Adds two nullable columns and two CHECKs. Alters no existing
--       column, drops nothing, backfills nothing, touches no policy or function.
--       Every existing read (`select('id, stem, options, …')`) is unaffected.

-- ── The K half (Rule 1: every task gets exactly one K) ───────────────────────
ALTER TABLE public.fp_items
  ADD COLUMN IF NOT EXISTS bloom_level text;

COMMENT ON COLUMN public.fp_items.bloom_level IS
  'JABT cognitive level (the K half) this item asks for: K1 Remembering, K2 Understanding, K3 Applying, K4 Analyzing, K5 Evaluating, K6 Creating. Bloom''s six, retained unchanged by jkkn_advanced; same vocabulary as curriculum_lesson.primary_bloom_level. NULL = not yet reviewed, NOT "no level" — JABT Rule 1 gives every task exactly one K. Values are set by an academic reviewer working through the proposals in docs/modules/foundation/2026-08-05-MODULE-foundation-item-bloom-proposals.generated.md; the script that generates them proposes only and never writes.';

ALTER TABLE public.fp_items
  DROP CONSTRAINT IF EXISTS chk_fp_items_bloom_level;
ALTER TABLE public.fp_items
  ADD CONSTRAINT chk_fp_items_bloom_level
  CHECK (bloom_level IS NULL OR bloom_level IN ('K1','K2','K3','K4','K5','K6'));

-- ── The A half (Rule 2: a task MAY also get one A — one, never several) ──────
ALTER TABLE public.fp_items
  ADD COLUMN IF NOT EXISTS advanced_dimension text;

COMMENT ON COLUMN public.fp_items.advanced_dimension IS
  'JABT advanced dimension (the A half) this item builds, if any: A1 Human Dimension, A2 Caring, A3 Learning How to Learn, A4 Performed Skill, A5 Accountable AI Use. Scalar because JABT Rule 2 allows at most ONE A per task, never several. NULL is the expected value and means the task measures thinking only — JABT Rule 3, "a task with no A is fine". POLICY: an academic reviewer leaves this NULL on every q_type=''mcq_single'' row, because the spec''s reachability matrix marks A1/A2/A4/A5 unreachable in a written format and A3 only partly so, and the evidence rule requires observed conduct, a named-person interaction, a sustained choice, a performed act or a correction history — none of which four fixed options can carry. The column exists rather than being forbidden by CHECK so that a future Foundation item type that CAN carry that evidence needs no migration. A4''s bands (a Guided / b Independent / c Adaptive) are not in this vocabulary: a band records how a performed act went, so it belongs on the artifact recording the act.';

ALTER TABLE public.fp_items
  DROP CONSTRAINT IF EXISTS chk_fp_items_advanced_dimension;
ALTER TABLE public.fp_items
  ADD CONSTRAINT chk_fp_items_advanced_dimension
  CHECK (advanced_dimension IS NULL OR advanced_dimension IN ('A1','A2','A3','A4','A5'));

-- Reporting index: "how much of this bank is K1?" is the whole point of the
-- column, and the untagged rows are the review queue. Partial, so it stays tiny.
CREATE INDEX IF NOT EXISTS idx_fp_items_bloom_level
  ON public.fp_items (bloom_level)
  WHERE bloom_level IS NOT NULL;

-- No RLS change. `fp_items` is already staff-only (fp_items_read / fp_items_write,
-- migration 20260706064000) and table-level grants cover columns added later, so
-- the new column inherits exactly the existing access. No new grant is issued.
