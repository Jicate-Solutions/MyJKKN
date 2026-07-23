-- ============================================================================
-- 20260713000300_seed_staff_ai_job_types.sql
-- ----------------------------------------------------------------------------
-- Seeds the existing staff-facing AI features as rows in the #1998 generic
-- registry (public.ai_job_types, created by 20260712183000_ai_jobs_registry_queue.sql).
-- Each row is SELF-DESCRIBING: it carries prompt_template + tool_set +
-- output_target + input_schema so the generic Max-lane runner can execute the
-- job from data alone once the feature is converted to enqueue.
--
-- These rows are DOCUMENTARY for 9 of the 10 features (their live routes still
-- call Anthropic directly and are unchanged in this PR). ONE feature —
-- work_pulse.translate — is converted to enqueue via the registry in the same
-- PR (app/api/work-pulse/translate/route.ts) as the proven reference that a
-- real feature runs on the Max lane through fn_ai_enqueue / fn_ai_job_status.
--
-- DEPENDS ON the 'Registry backend' migration (…000100) that adds two columns
-- to ai_job_types:
--     input_schema     jsonb NOT NULL DEFAULT '[]'::jsonb   (auto-drawn run form)
--     expected_seconds int  NULL                            ("expected ~Ns" timer)
-- This file's timestamp (…000300) sorts AFTER …000100, so the columns exist
-- when it runs. Applied at review time via the Management API (migrations are
-- NOT auto-applied by deploy).
--
-- ON CONFLICT (job_type) DO NOTHING → additive + idempotent. Nothing existing
-- moves; re-running is a no-op. lane defaults to 'max' (routing still deferred).
-- allow_rule uses the gate found in each feature's source: cdc.career_guidance
-- has an explicit user_has_permission('cdc.view') gate → 'permission:cdc.view';
-- the rest declare no single permission (RLS / self-limiting / internal), so
-- they use the SAFE-vocabulary fallback 'authenticated'. See the PR body for
-- the recommendation to tighten admission.* / curriculum.* to a permission key
-- BEFORE those features are converted to enqueue.
-- Ref: memory/project_ai_jobs_registry_lane.md
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target, interactive, lane, allow_rule, input_schema, expected_seconds)
VALUES
  -- 1. Admission agentic CRM query (lib/services/admission/agentic-query-service.ts)
  ('admission.agentic_query',
   'Admission — Agentic CRM Query',
   'Natural-language questions over the admission CRM (leads, counselors, activities): a parse step extracts structured intent, the data is fetched, and an analyst step summarizes the result. Runs as the requester (auth.uid()-scoped tools).',
   $pt$You are a query parser for a CRM admissions system. Parse the user's natural-language query and extract structured intent as valid JSON: { type: count|list|aggregate|compare|trend|filter, entities: [table names], filters: [{field, operator, value}], timeRange?, groupBy?, orderBy?, limit?, confidence }. Query against the admission CRM schema (admission_leads, admission_counselors, admission_lead_activities). Return ONLY valid JSON, no explanation.

User query: {{query}}

Second stage — as a CRM analyst, generate a brief 2-3 sentence summary of the query results: include key numbers and insights, in a professional but friendly tone.$pt$,
   'all', 'inbox', true, 'max', 'authenticated',
   '[{"key":"query","label":"Question","type":"textarea","required":true}]'::jsonb,
   30),

  -- 2. Admission AI response suggestions (lib/services/admission/ai-response-service.ts)
  ('admission.ai_response',
   'Admission — AI Response Suggestions',
   'Generates 3 tone-varied response drafts (email / WhatsApp / SMS) for a counsellor replying to an admission lead, grounded in the lead context and recent interactions.',
   $pt$You are a professional admissions counselor assistant for {{institution_name}}. Generate 3 suggested response messages for the following lead context.

Lead: {{lead_name}} | Program interest: {{interested_programs}} | Current stage: {{funnel_stage}} | Priority: {{priority}} | Source: {{source}}
Recent interactions: {{recent_interactions}}
Communication channel: {{channel}}
Intent: {{intent}}
Counselor: {{counselor_name}}
Additional context: {{custom_prompt}}

Generate 3 response suggestions with varying tones (formal, friendly, professional). Each must suit the {{channel}} channel, address the lead by first name, be relevant to their funnel stage, and include a clear call-to-action when appropriate. Return ONLY valid JSON: { "suggestions": [ { "id", "content", "subject" (email only), "tone": "formal|friendly|professional", "confidence": 0.0-1.0 } ] }.$pt$,
   'all', 'inbox', true, 'max', 'authenticated',
   '[{"key":"lead_id","label":"Lead","type":"text","required":true},{"key":"channel","label":"Channel","type":"select","options":["email","whatsapp","sms"],"required":true},{"key":"intent","label":"Intent","type":"select","options":["greeting","follow_up","inquiry_response","document_reminder","interview_schedule","offer_details","payment_reminder","general"],"required":true},{"key":"custom_prompt","label":"Additional context","type":"textarea","required":false}]'::jsonb,
   25),

  -- 3. Admission analytics insights (lib/services/admission/admission-ai-service.ts)
  ('admission.ai_service',
   'Admission — Analytics Insights',
   'Analyzes the admission dashboard analytics and returns an executive summary plus key findings, recommendations, predictions, trends, and a risk assessment.',
   $pt$You are a senior educational admissions strategist and data analyst with 15+ years of experience in higher-education analytics. Analyze the following admissions analytics data and provide deep, actionable insights that drive strategic decision-making.

{{analytics_summary}}

Return a comprehensive analysis as JSON with: summary (executive), keyFindings[{title, description, severity}], recommendations[{category, priority, insight, action, expectedImpact, implementationSteps[]}], predictions[{metric, prediction, confidence, timeline, reasoning}], trends[{trend, direction, impact, significance}], riskAssessment[{risk, severity, likelihood, mitigation}]. Return ONLY valid JSON.$pt$,
   'all', 'inbox', true, 'max', 'authenticated',
   '[]'::jsonb,
   45),

  -- 4. CDC AI Career Guidance (app/api/cdc/career-guidance/route.ts) — explicit cdc.view gate
  ('cdc.career_guidance',
   'CDC — AI Career Guidance',
   'A CDC counsellor picks one learner; assembles that learner''s career-relevant (non-PII) data and asks Claude for career paths, skill gaps, next steps, and a list of data the CDC should record. Gate: permission cdc.view.',
   $pt$You are a career-counselling assistant for the Career Development Centre (CDC) of an Indian higher-education group. A counsellor has selected one student and wants guidance to discuss with them.

Use ONLY the data provided. Ground every suggestion in that data. Where key data is missing, still give useful guidance at the program/year level, and list the missing data in "dataToImprove" so the CDC knows what to record for sharper future guidance. Be concrete and India-context aware (placements, higher studies, government exams, entrepreneurship as relevant).

Government-job readiness: many Tamil Nadu learners aim for government jobs rather than private employment. When the data shows a government-job aspiration OR enrolment in government-exam coaching, make the readiness path concrete in "nextSteps": name the relevant exam family (TNPSC Group 2/4, RRB NTPC, IBPS/SBI banking, SSC, or TN Police/TNUSRB) that fits the learner's degree and interests, and give exam-preparation actions (which shared subjects to start — general knowledge, aptitude, reasoning, current affairs, language eligibility — and the domain subjects specific to their target exam). Also surface relevant government-scholarship framing (e.g. National Scholarship Portal / state post-matric schemes) where it helps a government-aspiring learner fund preparation. Do NOT invent specific deadlines, cut-offs, or eligibility numbers — keep scholarship guidance directional and tell the counsellor to confirm current details with the CDC office.

Return ONLY valid JSON — no markdown, no code fences, no commentary — matching exactly:
{
  "summary": "2-3 sentence overview of where this student stands and the headline recommendation",
  "careerPaths": [ { "title": "short role/path name", "why": "one line grounded in their data" } ],
  "skillGaps": [ "specific skill or gap to close" ],
  "nextSteps": [ "concrete action the student/counsellor can take this term" ],
  "dataToImprove": [ "data the CDC should record to make this guidance sharper" ]
}
Give 3-5 careerPaths, 3-6 skillGaps, 3-6 nextSteps.

Learner career data:
{{learner_data}}$pt$,
   'all', 'inbox', true, 'max', 'permission:cdc.view',
   '[{"key":"learnerId","label":"Learner","type":"text","required":true}]'::jsonb,
   35),

  -- 5. Session-feedback improvement suggestion (app/api/academic/session-feedback/ai-suggest-improvement/route.ts)
  ('session_feedback.suggest_improvement',
   'Session Feedback — AI Improvement Suggestion',
   'For a course whose recent post-class feedback scored low on understanding, returns concrete teaching adjustments. Anonymity-preserving: only aggregate signals + anonymized comments are sent; numbers are never printed back.',
   $pt$You are a teaching-improvement assistant for an Indian higher-education institution. A class's students gave anonymous post-class feedback on how well they understood a session. You receive ONLY aggregate signals and anonymized comment text — never any student identity.
Use ONLY the data provided; ground every suggestion in it. Be concrete and India-context aware. NEVER quote a comment verbatim and NEVER refer to an individual student — speak only in aggregate themes so no student can be identified.
NEVER state counts, sample sizes, response numbers, averages, percentages, rating scales, or trigger thresholds in your output — describe group size ONLY in the words given (e.g. a few learners, a small group) and understanding ONLY in the qualitative band words given. Printed numbers teach students and staff how to game the loop.
Return ONLY valid JSON (no markdown, no code fences, no commentary) matching exactly:
{ "summary": "...", "likelyCauses": ["..."], "suggestedAdjustments": [{"title":"...","how":"..."}], "quickWin": "...", "whatToWatchNext": "..." }
Give 2-4 likelyCauses and 3-5 suggestedAdjustments. whatToWatchNext must describe, in words only, whether understanding holds or improves in the next session — never cite a number, score, average, or target.
CRITICAL: Never express understanding as a number, score, average, rating out of 5, or percentage, and never state a numeric target or threshold to reach. Describe understanding and its trend in words only (e.g. "understanding was strong", "a small cluster still struggled"). You may state how many students responded.

Course: {{course_code}}
Window: {{from}} to {{to}}
Group size (words only — never repeat numbers): {{group_size_word}}
Understanding level (qualitative): {{understanding_band}}

Anonymized student comments:
{{comments}}
{{track_record}}

Generate the teaching-improvement JSON now.$pt$,
   'none', 'inbox', true, 'max', 'authenticated',
   '[{"key":"course_code","label":"Course code","type":"text","required":true},{"key":"from","label":"From date","type":"text","required":false},{"key":"to","label":"To date","type":"text","required":false}]'::jsonb,
   30),

  -- 6. Work Pulse Tamil→English translate (app/api/work-pulse/translate/route.ts) — THE REFERENCE CONVERSION
  ('work_pulse.translate',
   'Work Pulse — Tamil to English Translate',
   'Translates a Tamil work-pulse text to English. This is the reference feature CONVERTED to enqueue via the registry in this PR: the route enqueues fn_ai_enqueue(''work_pulse.translate'', {text}) and long-polls fn_ai_job_status; the generic Max-lane drain executes this prompt and returns the translation.',
   $pt$Translate the following Tamil text to English. Preserve the meaning and context. Return ONLY the English translation, nothing else.

Tamil text: {{text}}$pt$,
   'none', 'inbox', true, 'max', 'authenticated',
   '[{"key":"text","label":"Tamil text","type":"textarea","required":true}]'::jsonb,
   20),

  -- 7. Attention Bar Layer-4 assistant (lib/attention-bar/anthropic-client.ts; catalogued in lib/ai-routines/misc-ai.ts)
  ('attention_bar.assistant',
   'Attention Bar — Layer-4 Assistant',
   'Given a user''s context and an allowlist of quick actions, picks EXACTLY ONE action via strict tool-use and returns { action_id, reason }. Internal library call behind the Attention Bar.',
   $pt$You are the Attention Bar's Layer-4 assistant. Given a user's current context and an allowlist of quick actions, pick EXACTLY ONE action for the user via strict tool-use. Return { action_id, reason } where action_id MUST be one of the provided allowlist actions.

User context: {{context}}
Allowed actions: {{actions}}$pt$,
   'none', 'inbox', true, 'max', 'authenticated',
   '[{"key":"context","label":"User context","type":"textarea","required":false}]'::jsonb,
   15),

  -- 8. Curriculum lesson-spine regeneration (per-course click; lib/ai-tasks/registry.ts; catalogued in lib/ai-routines/curriculum-ai.ts)
  ('curriculum.lesson_spine_regen',
   'Curriculum — Lesson-Spine Regeneration',
   'A faculty/reviewer clicks "Regenerate spine" for one course: produces an ordered set of teachable lessons from the BoS syllabus (units + CLOs, tagged Fink dimension + Bloom level + CLO), recorded as UNPUBLISHED DRAFTS. Same prompt as the bulk mint; exact text lives in the ai-tasks lane.',
   $pt$For the given course whose Board-of-Studies (BoS) syllabus is on file, produce an ordered set of teachable lessons grounded in the syllabus units and Course Learning Outcomes (CLOs). Tag each lesson with its Fink dimension, Bloom level (K1-K6), and the CLO it maps to. When the syllabus's assessment structure has capstone / Concept-Application data, also produce a short in-class Concept-Application brief per unit and one team-capstone brief for the course. Everything is recorded as an UNPUBLISHED DRAFT for faculty review; nothing reaches students until a faculty member approves it.

Course: {{entityId}}$pt$,
   'none', 'inbox', true, 'max', 'authenticated',
   '[{"key":"entityId","label":"Course","type":"text","required":true}]'::jsonb,
   60),

  -- 9. AI Pulse anomaly detection (lib/ai-routines/ai-pulse.ts) — rule-based today (callsClaude=false)
  ('ai_pulse.anomaly_detection',
   'AI Pulse — Anomaly Scan',
   'Scans the last 14 days of AI Pulse cycles for integrity red-flags (pass-without-attend, reach outliers, rubber-stamp poll answers, rotation gaming, excessive excused absences) and writes pending anomaly flags for Champions. NOTE: rule-based detectors today (does NOT call Claude) — seeded for registry visibility; prompt_template left NULL.',
   NULL,
   'none', 'inbox', true, 'max', 'authenticated',
   '[]'::jsonb,
   30),

  -- 10. Work Pulse weekly analysis (app/api/work-pulse/analyze/route.ts)
  ('work_pulse.analyze',
   'Work Pulse — Weekly Analysis',
   'Clusters the last 7 days of staff work-pulse entries + behavioral signals into automation / efficiency patterns with impact scores, updating the pattern board and flagging training opportunities. NOTE: the live route is super_admin / x-api-key gated (WORK_PULSE_API_KEY); the enqueue allow_rule below is the safe-vocab fallback ''authenticated'' and MUST be tightened (or the vocabulary extended) before this feature is converted to enqueue.',
   $pt$You are an organizational efficiency analyst for JKKN educational institutions.

Analyze the following data and identify automation/improvement patterns.

## This Week's Pulse Entries
{{entries}}

## Behavioral Activity Signals
{{activities}}

## Existing Patterns (for trend comparison)
{{existing_patterns}}

## Micro-Interview Responses
{{interviews}}

## Instructions
1. Cluster similar complaints into patterns.
2. For each pattern, calculate: people_affected (unique reporter count), hours_wasted_weekly (institution-wide estimate), feasibility_score (1-10), impact_score (people × hours × feasibility / build_effort_estimate).
3. Classify solution_type: new_module, standalone_agent, process_change, or training.
4. Flag week-over-week trends (growing / shrinking problems).
5. Identify entries that are actually platform bugs (not workflow issues).

Return ONLY a JSON array of pattern objects: [ { "name", "description", "category", "people_affected", "roles_affected": [], "hours_wasted_weekly", "feasibility_score", "impact_score", "solution_type", "metadata": { "trend", "confidence" }, "affected_user_ids": [] } ]. No other text.$pt$,
   'none', 'inbox', true, 'max', 'authenticated',
   '[]'::jsonb,
   45)
ON CONFLICT (job_type) DO NOTHING;
