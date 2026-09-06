-- ============================================================================
-- Migration: 20260614100000_rcltp_policies_seed
-- EKSAQ RCLTP — platform_policies seed (the full rcltp.* control surface)
-- ============================================================================
-- Director directive: "every policy decision a row, Director's view with
-- English consequences + visual cascade, zero deploys to tweak." This seeds the
-- RCLTP reading-assessment + adaptive-learning controls as platform_policies
-- rows with full typed-widget metadata (ui_widget, ui_options, ui_consequence,
-- ui_cascade, ui_category) so the admin UI renders a Director-readable control
-- with plain-English consequences + a visual cascade, and no deploy is needed
-- to change a value.
--
-- EXTENDS the EXISTING substrate — DOES NOT REINVENT IT:
--   * Config table = EXISTING public.platform_policies (already live). This file
--     creates NO new rcltp_* config/settings table.
--   * Runtime readers ALREADY EXIST: fn_get_policy(key, scope_id),
--     fn_get_policy_int / _bool / _text / _json(key, default, scope_id). This
--     file writes NO new reader functions.
--   * Per-institution overrides happen later via the SAME scope mechanism
--     (scope_type='institution', scope_id=<institution> read by
--     fn_get_policy(key, scope_id)) — NOT seeded here. These are GLOBAL defaults.
--
-- Seeded as is_system=true GLOBAL rows (scope_type='global', scope_id=NULL).
-- Naming convention: rcltp.<area>.<key>.
--
-- Idempotency: scoped DELETE-then-INSERT on EXACTLY the 13 policy keys this
-- file owns (NOT a broad LIKE 'rcltp.%' wipe). A sibling migration
-- (20260701000001_rcltp_voice_consent_lang_notify_policies_seed) shares the
-- voice/consent/language/notification subset and uses a namespace-wide DELETE;
-- scoping THIS file's DELETE to its own key list keeps the two order- and
-- re-run-safe instead of clobbering each other. This file's 13 keys are a
-- superset of the sibling's 5, so the final state is identical regardless of
-- apply order.
--
-- EKSAQ-PENDING rows: rcltp.bands.mastery_threshold, rcltp.scoring.weights, and
-- rcltp.bands.nipun_wpm have NO EKSAQ-validated number yet. They are seeded
-- is_active=false with a clearly-placeholder value and a ui_consequence that
-- says the value AWAITS EKSAQ VALIDATION. No authoritative numbers are invented
-- for these — the module uses its built-in defaults until EKSAQ supplies the
-- validated figures and an admin turns the policy on. (PRD §11 open items: band
-- cutoffs/rubric, composite-score formula, NIPUN wpm baselines all from EKSAQ.)
--
-- PRD source: specs/eksaq-rcltp-prd.md
--   §1 pluggable language · §6 notification map · §7 reports (composite score) ·
--   §8 build sequence · §9 audio retention + engine + crons · §11 open items ·
--   F6 scheduling · F7 adaptive practice (5/3/1) · F8 single official attempt ·
--   F9 consent · F10 notifications.
-- ============================================================================

DELETE FROM platform_policies
WHERE scope_type = 'global'
  AND policy_key IN (
    'rcltp.schedule.cycles_per_year',
    'rcltp.schedule.reminder_lead_days',
    'rcltp.assessment.official_attempts',
    'rcltp.practice.allocation_by_band',
    'rcltp.scoring.low_confidence_threshold',
    'rcltp.bands.mastery_threshold',
    'rcltp.scoring.weights',
    'rcltp.bands.nipun_wpm',
    'rcltp.audio.retention_days',
    'rcltp.voice.engine',
    'rcltp.consent.voice_required',
    'rcltp.notifications.realtime',
    'rcltp.language.default'
  );

INSERT INTO platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  ui_widget, ui_options, ui_consequence, ui_cascade, ui_category, is_system, is_active
)
VALUES
(
  'rcltp.schedule.cycles_per_year',
  'global', NULL::uuid,
  '6'::jsonb, 'number',
  'Number of assessment cycles run per academic year (PRD §8 / F6)',
  'number', NULL::jsonb,
  'Each child is assessed this many times across the school year. The system proposes the windows; teachers confirm and release them.',
  '[{"effect":"Fewer cycles = less progress data and slower detection of a child slipping back","severity":"medium"},{"effect":"More cycles = more reminders, more teacher review work, and more voice recordings to store","severity":"medium"}]'::jsonb,
  'Assessment Scheduling', true, true
),
(
  'rcltp.schedule.reminder_lead_days',
  'global', NULL::uuid,
  '3'::jsonb, 'number',
  'How many days before an assessment window opens that reminders are sent (PRD §6 / F6 rcltp-due-reminders cron)',
  'number', NULL::jsonb,
  'Students and teachers get an "assessment due" reminder this many days ahead of each cycle so nobody is caught off guard.',
  '[{"effect":"Too few days = people get little warning and windows are missed","severity":"medium"},{"effect":"Too many days = the reminder is forgotten by the time the window opens","severity":"low"}]'::jsonb,
  'Assessment Scheduling', true, true
),
(
  'rcltp.assessment.official_attempts',
  'global', NULL::uuid,
  '1'::jsonb, 'number',
  'Number of official scored attempts a child gets per assessment; re-takes only via teacher authorization (PRD F8)',
  'number', NULL::jsonb,
  'Each child gets this many official goes at an assessment. After that, only a teacher can authorize a re-take (the single re-take path), which keeps the score honest.',
  '[{"effect":"More than 1 attempt weakens score integrity — children can game the result and reported ability stops being trustworthy","severity":"high"},{"effect":"Set to 0 and no child can be assessed at all","severity":"high"}]'::jsonb,
  'Assessment Integrity', true, true
),
(
  'rcltp.practice.allocation_by_band',
  'global', NULL::uuid,
  '{"emergent":5,"transitional":3,"proficient":1,"super_proficient":1}'::jsonb, 'object',
  'Weekly adaptive-practice volume assigned per reading band — the 5/3/1 rule (PRD F7). data_type=''object'' (DB CHECK forbids ''json'').',
  'json', NULL::jsonb,
  'Sets how many practice activities each child gets per week based on their reading band — weaker readers (Emergent) get the most (5), stronger readers get the least (1). This is the heart of the adaptive pathway.',
  '[{"effect":"Raising the numbers gives more practice but can overwhelm weaker readers and their families","severity":"medium"},{"effect":"Lowering them eases the load but slows how fast struggling readers catch up","severity":"medium"},{"effect":"A band missing from this list gets no practice assigned at all","severity":"high"}]'::jsonb,
  'Adaptive Practice', true, true
),
(
  'rcltp.scoring.low_confidence_threshold',
  'global', NULL::uuid,
  '0.6'::jsonb, 'number',
  'Confidence floor (0–1) below which a voice recording is auto-held for teacher review instead of being scored automatically',
  'number', NULL::jsonb,
  'When the speech engine is less than this sure of its reading score, the recording is sent to the teacher''s review queue instead of going straight to the parent. Lower it and more scores publish automatically (faster, but shakier scores can slip through). Raise it and more recordings wait for a teacher to sign off (safer, but a bigger review queue).',
  '[{"effect":"Lower threshold = fewer recordings held = larger share of scores reach parents without a teacher checking them","severity":"high"},{"effect":"Higher threshold = more recordings land in the teacher review queue, increasing teacher workload","severity":"medium"},{"effect":"Set to 0 = nothing is ever auto-held; every score publishes on the engine alone","severity":"high"}]'::jsonb,
  'Scoring', true, true
),
(
  'rcltp.bands.mastery_threshold',
  'global', NULL::uuid,
  '0.7'::jsonb, 'number',
  'PLACEHOLDER (awaiting EKSAQ). Mastery fraction (0–1) a child must reach on the band''s competencies before being promoted to the next reading band (Emergent → Transitional → Proficient → Super Proficient)',
  'number', NULL::jsonb,
  'AWAITING EKSAQ VALIDATION — this value is a placeholder and is currently switched OFF; the module uses its built-in default until EKSAQ supplies the validated cutoff and an admin turns this on. Once active: a child only moves up a reading band after demonstrating at least this fraction of the band''s skills, so bands reflect real mastery rather than a single lucky attempt. Lower it and children advance sooner (more encouragement, less rigor); raise it and a band means more.',
  '[{"effect":"Value is EKSAQ-pending — do not rely on this number; the placeholder must not be treated as the official cutoff","severity":"high"},{"effect":"Lower threshold = faster band promotion, weaker guarantee that a band reflects mastery","severity":"high"},{"effect":"Higher threshold = stricter promotion, more children held in a lower band longer","severity":"medium"}]'::jsonb,
  'Bands', true, false
),
(
  'rcltp.scoring.weights',
  'global', NULL::uuid,
  '{"reading":0.5,"comprehension":0.5}'::jsonb, 'object',
  'PLACEHOLDER (awaiting EKSAQ). Weights used to combine the Reading (Part A) score and the Comprehension (Part B) score into the single Overall score on the report. Weights should sum to 1. data_type=''object'' (DB CHECK forbids ''json'').',
  'textarea', NULL::jsonb,
  'AWAITING EKSAQ VALIDATION — this 50/50 split is a placeholder and is currently switched OFF; the module uses its built-in formula until EKSAQ supplies the validated composite formula (the 67→85 worked example in the spec) and an admin turns this on. Once active: it decides how much a child''s reading-aloud score versus their comprehension score counts toward the Overall number a parent sees. Shift weight toward reading and fluent readers score higher overall; shift toward comprehension and understanding counts more.',
  '[{"effect":"Formula is EKSAQ-pending — do not rely on this 50/50 placeholder; it is not the official weighting","severity":"high"},{"effect":"Changing the split moves every child''s Overall score and can move them across band boundaries","severity":"high"},{"effect":"Weights that do not sum to 1 will distort the Overall score","severity":"medium"}]'::jsonb,
  'Scoring', true, false
),
(
  'rcltp.bands.nipun_wpm',
  'global', NULL::uuid,
  '{"1":null,"2":45,"3":null,"4":null,"5":null,"6":null,"7":null,"8":null,"9":null,"10":null}'::jsonb, 'object',
  'PLACEHOLDER (awaiting EKSAQ/NIPUN). Per-grade oral-reading-fluency baseline in words per minute (grade 1–10), used by band logic to judge whether a child reads at, above, or below the NIPUN-aligned target for their grade. Grade-2 example value mirrors the NIPUN Grade-2 ~45 wpm benchmark; all other grades await validated numbers. data_type=''object'' (DB CHECK forbids ''json'').',
  'textarea', NULL::jsonb,
  'AWAITING EKSAQ / NIPUN VALIDATION — these reading-speed targets are placeholders and are currently switched OFF; band logic uses its built-in baselines until EKSAQ supplies NIPUN-validated words-per-minute targets per grade and an admin turns this on. Once active: each grade gets a reading-speed target, and a child reading slower than their grade''s target is flagged for support while faster readers are recognised. Set the bar too low and struggling readers look fine; too high and confident readers get flagged unfairly.',
  '[{"effect":"Numbers are EKSAQ/NIPUN-pending — do not rely on these placeholders; only the Grade-2 ~45 wpm value tracks a published NIPUN benchmark","severity":"high"},{"effect":"Targets set too low under-identify children who need reading support","severity":"high"},{"effect":"Targets set too high over-flag capable readers and inflate the support queue","severity":"medium"}]'::jsonb,
  'Bands', true, false
),
(
  'rcltp.audio.retention_days',
  'global', NULL::uuid,
  '365'::jsonb, 'number',
  'Days a child voice recording is retained before automatic purge (PRD §9, 1-year retention via rcltp-audio-purge cron)',
  'number', NULL::jsonb,
  'Each child''s voice recording is kept for this many days, then deleted automatically. The clock starts when the recording is scored or synced (not when it is recorded). Default is 365 days (one year).',
  '[{"effect":"A shorter window deletes recordings sooner — better for privacy, but teachers lose the audio they review and parents can no longer replay it","severity":"high"},{"effect":"A longer window keeps recordings around longer — more storage cost and a larger pool of child voice data held under DPDP","severity":"medium"},{"effect":"The rcltp-audio-purge cron enforces this number; changing it changes what the next nightly purge deletes","severity":"medium"}]'::jsonb,
  'Voice & Audio', true, true
),
(
  'rcltp.voice.engine',
  'global', NULL::uuid,
  '"speechace"'::jsonb, 'enum',
  'Speech-scoring engine for Part A (Read & Record) oral reading fluency (PRD §9; Speechace recommended for child ORF + wpm, Azure en-IN alternative)',
  'dropdown',
  '[{"value":"speechace","label":"Speechace (recommended for child oral reading)"},{"value":"azure_en_in","label":"Azure Pronunciation Assessment (en-IN, Central India)"}]'::jsonb,
  'This is the engine that listens to a child reading aloud and scores pronunciation, speed, and fluency. Speechace is tuned for children''s oral reading; Azure en-IN runs in the Central India region for data residency.',
  '[{"effect":"Switching engines changes how scores are calculated, so a child''s before-vs-after comparison may shift even if their reading did not — re-baseline expectations after a switch","severity":"high"},{"effect":"Each engine sends audio to a different vendor: Speechace processes English audio in the US; Azure en-IN keeps it in Central India (DPDP) — this is a data-residency decision","severity":"high"},{"effect":"The selected engine must have a valid API key configured, or Part A scoring stops","severity":"high"}]'::jsonb,
  'Voice & Audio', true, true
),
(
  'rcltp.consent.voice_required',
  'global', NULL::uuid,
  'true'::jsonb, 'boolean',
  'Whether parent voice consent is required before a child''s voice is recorded in Part A (PRD F9: no consent → Part A skipped + Part B text-only)',
  'toggle', NULL::jsonb,
  'When ON, a child''s voice cannot be recorded until a parent has given voice consent. Without consent, the reading-aloud step (Part A) is skipped and the child does the comprehension step (Part B) as text only.',
  '[{"effect":"Turning this OFF would let voice recording happen without explicit parent consent — a serious privacy and DPDP risk for children''s data; keep ON unless legal sign-off says otherwise","severity":"high"},{"effect":"While ON, any child whose parent has not consented gets a text-only assessment and no oral-reading band — their report will be missing the reading-aloud scores","severity":"medium"},{"effect":"This works together with the parent consent screen (F9) — withdrawing consent there stops future voice recording for that child","severity":"medium"}]'::jsonb,
  'Consent & Privacy', true, true
),
(
  'rcltp.notifications.realtime',
  'global', NULL::uuid,
  'false'::jsonb, 'boolean',
  'Master toggle for real-time push delivery of RCLTP notifications (assessment-due, report-ready, review-needed, regression alerts — PRD F10 / §6)',
  'toggle', NULL::jsonb,
  'When ON, RCLTP alerts (assessment due, report ready, recording needs review, band regression) are pushed in real time as events happen. When OFF (the default), those alerts still appear in the in-app bell and go out on their normal channels, just without instant push.',
  '[{"effect":"Turning this ON sends alerts the moment events happen — faster for teachers and parents, but more interruptions and more notification volume","severity":"medium"},{"effect":"Leaving it OFF means people still get every alert in the bell and on WhatsApp/email per the notification map — they just are not pushed instantly","severity":"low"},{"effect":"Real-time push depends on the underlying notification channels (in-app / WhatsApp / email) being configured; this toggle does not add a channel, only the instant-delivery behavior","severity":"low"}]'::jsonb,
  'Notifications', true, true
),
(
  'rcltp.language.default',
  'global', NULL::uuid,
  '"en"'::jsonb, 'enum',
  'Default assessment language for a tenant (PRD §1: v1 is English end-to-end; language is per-tenant pluggable — local languages added later with content + speech engine, no rebuild)',
  'dropdown',
  '[{"value":"en","label":"English (v1 — base language)"},{"value":"ta","label":"Tamil (future — needs content + speech engine)"},{"value":"te","label":"Telugu (future — needs content + speech engine)"},{"value":"hi","label":"Hindi (future — needs content + speech engine)"}]'::jsonb,
  'The language a school''s assessments run in. Version 1 is English end-to-end. Other languages are added per school later, once their reading content and a matching speech engine are in place — there is no working content for them yet.',
  '[{"effect":"Selecting a language that has no seeded passages, questions, or vocabulary yet will leave a school with empty assessments — only switch a tenant once its content is loaded","severity":"high"},{"effect":"A local language also needs a matching speech engine for Part A; without one, reading-aloud cannot be scored in that language","severity":"high"},{"effect":"Tamil and Telugu are gated on a score-vs-human validation spike before they go live; Hindi is lower-risk (Azure hi-IN) — do not flip these on for production without that sign-off","severity":"medium"}]'::jsonb,
  'Language', true, true
);
