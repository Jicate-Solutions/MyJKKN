-- 20260812100000_fp_items_bloom_level.sql
--
-- Foundation Programme item bank: record the COGNITIVE LEVEL each question asks for.
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
-- SCOPE: K1–K6 ONLY. No A1/A2/A3.
--
-- The JKKN Advanced Bloom's Taxonomy (JABT) keeps Bloom's six levels unchanged
-- and adds three Fink dimensions alongside them — A1 Human Dimension, A2 Caring,
-- A3 Learning How to Learn. It also attaches an EVIDENCE RULE to each element
-- (spec §5), and that rule rules the A-codes out of this table:
--
--   A1 counts only on "observed conduct · a named-person interaction · a role
--      taken"          — NOT "a reflection essay asserting growth"
--   A2 counts only on "a sustained choice · honest recording of an inconvenient
--      result"         — NOT "a paragraph claiming to care"
--   A3 counts only on "work on material never taught · a revised approach with
--      reasons"        — NOT "a description of study habits"
--
-- and the spec's own assessment matrix (§4) marks A1 and A2 as unreachable on a
-- written paper at all. Every row in `fp_items` is `q_type = 'mcq_single'`: a
-- four-option, auto-scored, single-answer question. That format can produce none
-- of the evidence above. Putting an A-code on one would assert evidence the
-- format cannot generate — precisely the decoration the evidence rule exists to
-- prevent. The A1–A3 verb lists are additionally still "drafted … requires
-- academic review before seeding" (spec §3.2), so nothing should be built on
-- them yet either.
--
-- If the Foundation bank later grows item types that CAN carry that evidence
-- (an observed practical, a Senior Learner's record of a sustained choice, an
-- unseen-passage item for A3), the A-codes belong on THAT artifact, not here.
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
-- Reversible: ALTER TABLE public.fp_items DROP COLUMN bloom_level;
-- Tier: additive. Adds one nullable column and one CHECK. Alters no existing
--       column, drops nothing, backfills nothing, touches no policy or function.
--       Every existing read (`select('id, stem, options, …')`) is unaffected.

ALTER TABLE public.fp_items
  ADD COLUMN IF NOT EXISTS bloom_level text;

COMMENT ON COLUMN public.fp_items.bloom_level IS
  'Bloom cognitive level this item asks for: K1 Remembering, K2 Understanding, K3 Applying, K4 Analyzing, K5 Evaluating, K6 Creating. Same vocabulary as curriculum_lesson.primary_bloom_level. NULL = not yet reviewed. K-codes ONLY: JABT''s A1/A2/A3 need observed conduct, a named-person interaction or a sustained choice as evidence (spec §5) and an auto-scored MCQ cannot produce any of that, so an A-code must never be written here. Values are set by an academic reviewer working through the proposals in docs/modules/foundation/2026-08-05-MODULE-foundation-item-bloom-proposals.generated.md; the script that generates them proposes only and never writes.';

ALTER TABLE public.fp_items
  DROP CONSTRAINT IF EXISTS chk_fp_items_bloom_level;
ALTER TABLE public.fp_items
  ADD CONSTRAINT chk_fp_items_bloom_level
  CHECK (bloom_level IS NULL OR bloom_level IN ('K1','K2','K3','K4','K5','K6'));

-- Reporting index: "how much of this bank is K1?" is the whole point of the
-- column, and the untagged rows are the review queue. Partial, so it stays tiny.
CREATE INDEX IF NOT EXISTS idx_fp_items_bloom_level
  ON public.fp_items (bloom_level)
  WHERE bloom_level IS NOT NULL;

-- No RLS change. `fp_items` is already staff-only (fp_items_read / fp_items_write,
-- migration 20260706064000) and table-level grants cover columns added later, so
-- the new column inherits exactly the existing access. No new grant is issued.
