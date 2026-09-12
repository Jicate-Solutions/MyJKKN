-- ============================================================
-- Seed the missing admission_lead_sources_master row for the
-- lead_source enum value 'learner_creator_content', so a
-- counsellor can finally record "I saw your Instagram reel".
-- ============================================================
-- Context (2026-09-09), measured on production kvizhngldtiuufknvehv:
--
--   The enum value shipped on 2026-05-30 with
--   20260530150000_instagram_lead_attribution.sql, but no master
--   row was ever seeded for it. Every counsellor-facing "Lead
--   source" dropdown is rendered SOLELY from this table --
--   hooks/admission/use-active-lead-sources.ts:52-58 selects from
--   admission_lead_sources_master filtered on is_active, and
--   app/(routes)/admission/leads/new/page.tsx:1177-1179 maps that
--   result straight into SelectItems, with no static fallback on
--   the option path. The field is required (page.tsx:467-468).
--
--   Consequence: the dropdown offers 15 options and Instagram is
--   not among them, so for 100+ days the honest answer has had
--   nowhere to go.
--       admission_lead_sources_master ............ 15 rows,
--           none with enum_value='learner_creator_content'
--       admission_leads .......................... 22,984 rows,
--           source='learner_creator_content' ..... 0
--       admission_lead_source_captures ........... 11,930 rows,
--           source='learner_creator_content' ..... 0
--   The nearest escape hatches a counsellor has are 'social_media'
--   (1 capture in 11,930) and 'other' (7).
--
--   The whole display layer is already waiting for this row:
--   source-badge.tsx:23 ("IG Creator"), lead-card.tsx:125
--   (fuchsia), use-active-lead-sources.ts:127 (fallback label),
--   types/admission.ts:25, and
--   app/(routes)/admission/settings/sources/_components/
--   source-form-dialog.tsx:59 (ENUM_OPTIONS). Only the row is
--   missing, which is why this is a seed and not a code change.
--
-- Column choices:
--   label 'Instagram'  -- the master row's purpose is a human-facing
--     label decoupled from the enum's internal name; the counsellor
--     needs the word the learner actually said. Precedent on this
--     same table: enum 'facebook_ads' is labelled "Meta Ads".
--   is_system TRUE     -- matches 14 of the 15 existing rows
--     (youtube_ads is the lone false) and brings the row under the
--     partial unique index uq_lead_sources_master_system_enum on
--     (COALESCE(institution_id, zero-uuid), enum_value)
--     WHERE is_system, so no second system row can shadow it.
--   display_order 46   -- seats it between WhatsApp (45) and
--     Walk-In (50).
--   institution_id NULL -- global, exactly like the other 15 rows;
--     readable under policy lead_sources_master_select.
--
-- Routing note: the live trigger on admission_leads is
--   fn_auto_assign_counselor_v3, whose 'institution_and_source'
--   tier joins admission_lead_sources_master ON
--   slm.enum_value = NEW.source AND slm.is_active = TRUE. Setting
--   key = enum_value here also satisfies the older v2 form
--   (slm.key = NEW.source::text) should it ever be reattached.
--   No counsellor is mapped to this source in
--   admission_counselor_sources yet, so the first real Instagram
--   lead falls through to the 'institution_only' round-robin tier
--   rather than a source specialist. That is a fallback, not a
--   break -- but mapping counsellors to the new source is a
--   REQUIRED follow-up, not an optional one.
--
-- WHAT THIS DOES NOT FIX: v_ig_admission_attribution will still
--   report 0 leads against all 1,021 posts and 71 accounts after
--   this row exists. Its view body is
--     FROM ig_posts p JOIN ig_accounts a ON a.id = p.account_id
--     LEFT JOIN admission_leads l ON l.lead_source_ig_post_id = p.id
--   -- it credits a post ONLY through
--   admission_leads.lead_source_ig_post_id, a column with 0
--   non-null values in 22,984 rows and ZERO writers anywhere in the
--   codebase. Do NOT "fix" that view by re-pointing its join at
--   source='learner_creator_content': there is no post id to
--   attribute to, so the join would have to invent one, and a
--   fabricated per-post number is worse than an honest zero.
-- ============================================================

-- Two guards, deliberately:
--   ON CONFLICT (key)  -- the unique index admission_lead_sources_master_key_key.
--   WHERE NOT EXISTS   -- the one that actually matters. An admin can create a
--     custom row through /admission/settings/sources with a free-text key and a
--     separately-chosen enum_value, and SourceMasterService.create writes
--     is_system=false -- which escapes uq_lead_sources_master_system_enum (it is
--     partial, WHERE is_system=true) AND escapes ON CONFLICT (key) if they chose
--     e.g. key='instagram'. Without this predicate the migration would then land
--     a SECOND row for the same enum value, the required dropdown would show two
--     Instagram options, and v3's institution_and_source tier would join two
--     master rows for one lead.
INSERT INTO public.admission_lead_sources_master
  (key, enum_value, label, description,
   display_order, is_active, is_system, institution_id)
SELECT
  'learner_creator_content',
  'learner_creator_content'::lead_source,
  'Instagram',
  'The learner told us they came from an Instagram post or reel. '
  'Post-level credit additionally needs '
  'admission_leads.lead_source_ig_post_id, which no capture screen '
  'writes yet -- see v_ig_admission_attribution.',
  46, true, true, NULL
WHERE NOT EXISTS (
  SELECT 1
    FROM public.admission_lead_sources_master
   WHERE enum_value = 'learner_creator_content'::lead_source
)
ON CONFLICT (key) DO NOTHING;
