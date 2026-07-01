-- ============================================================================
-- Fresher Induction — Session Catalog (curated "best sessions" reference library)
-- File: 20260630220000_induction_session_catalog.sql | Date: 2026-06-30
-- Spec: specs/induction-session-catalog-seed-2026-06-30.md (Director-approved seed)
--
-- A cross-college, theme-tagged catalog of induction session topics, seeded from 6
-- historical JKKN programmes (2024-25). Coordinators browse it when planning a new
-- induction instead of starting from a blank sheet. Ranked by:
--   1. value_score  — avg fresher rating where a LIVE run of the topic was captured
--      (joins the no-smartphone feedback + session-effectiveness data), NULL until rated
--   2. adoption     — how many distinct colleges have run it (the day-1 "proven by
--      repeated use" signal, available immediately from history)
--
-- Tables:
--   induction_topic_catalog            — canonical topics + theme + historical colleges
--   induction_topic_catalog_live_link  — links a catalog topic to a live event_session
--                                        so its fresher ratings attach as value_score
-- RPC: fn_induction_topic_catalog(theme, search) — the ranked read. Anon-locked,
--      induction.view-gated. Catalog is SHARED reference (no institution scope).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.induction_topic_catalog (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_title text NOT NULL UNIQUE,
  theme           text NOT NULL CHECK (theme IN (
    'Orientation & Code of Conduct','Career, Placement & Professional',
    'Anti-Ragging & Safety','AI & Digital Tools','Design Thinking & Innovation',
    'Entrepreneurship & Incubation','Soft Skills & Communication',
    'Digital Brand & Social Media','Cross-College Exposure',
    'Wellness, Yoga & Health','Universal Human Values & Social',
    'Cultural & Talent','Academic, Library & Project','Team Building & Games')),
  outcome         text,
  colleges        text[]  NOT NULL DEFAULT '{}',  -- historical colleges that ran it
  years           text,                            -- e.g. '2025' or '2024-25'
  needs_review    boolean NOT NULL DEFAULT false,  -- TRUE for AI/Tamil titles awaiting native check
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.induction_topic_catalog_live_link (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id       uuid NOT NULL REFERENCES public.induction_topic_catalog(id) ON DELETE CASCADE,
  event_id       uuid NOT NULL REFERENCES public.events(id)         ON DELETE CASCADE,
  session_id     uuid NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_catalog_live_link UNIQUE (topic_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_live_link_topic ON public.induction_topic_catalog_live_link(topic_id);
CREATE INDEX IF NOT EXISTS idx_catalog_live_link_session ON public.induction_topic_catalog_live_link(session_id);

ALTER TABLE public.induction_topic_catalog           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.induction_topic_catalog_live_link ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: RLS already denies anon (no anon-satisfiable policy), but strip
-- Supabase's default anon table grants too so the lock-out doesn't rely on RLS alone.
REVOKE ALL ON public.induction_topic_catalog           FROM anon;
REVOKE ALL ON public.induction_topic_catalog_live_link FROM anon;

-- Reads go through the DEFINER RPC; direct table reads limited to induction.view holders.
-- No write policy → only migrations / service role seed it.
DROP POLICY IF EXISTS catalog_select ON public.induction_topic_catalog;
CREATE POLICY catalog_select ON public.induction_topic_catalog FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('induction.view'));
DROP POLICY IF EXISTS catalog_link_select ON public.induction_topic_catalog_live_link;
CREATE POLICY catalog_link_select ON public.induction_topic_catalog_live_link FOR SELECT USING (
  is_super_admin() OR is_admin() OR user_has_permission('induction.view'));

-- ----------------------------------------------------------------------------
-- Seed: 94 canonical topics (Director-approved 2026-06-30). ON CONFLICT idempotent.
-- ----------------------------------------------------------------------------
INSERT INTO public.induction_topic_catalog (canonical_title, theme, colleges, years) VALUES
-- Orientation & Code of Conduct
('Inaugural Function / Vibrant Arangam','Orientation & Code of Conduct',ARRAY['NUR-S','PHARM','ENGG','A&S'],'2025'),
('Parents & Students Interaction + Academic Registration','Orientation & Code of Conduct',ARRAY['NUR-S','PHARM','ENGG','AHS'],'2024-25'),
('Familiarization with JKKN System, Code of Conduct & Campus Culture','Orientation & Code of Conduct',ARRAY['NUR-S','PHARM','ENGG','AHS'],'2024-25'),
('Principal Address: College Vision & Mission','Orientation & Code of Conduct',ARRAY['PHARM','ENGG'],'2025'),
('HOD Address / From the Desk of Visionaries','Orientation & Code of Conduct',ARRAY['PHARM','ENGG'],'2025'),
('Teachers Address in the Introduction Arena','Orientation & Code of Conduct',ARRAY['NUR-S'],'2025'),
('Orientation on Curriculum & Syllabus (Semester System)','Orientation & Code of Conduct',ARRAY['NUR-S','PHARM','AHS'],'2024-25'),
('B.Pharm / Pharm.D Pathway: Curriculum, Clinical Training & Career','Orientation & Code of Conduct',ARRAY['PHARM'],'2025'),
('Examination Decoded: Guidelines, Protocols & Success Strategies','Orientation & Code of Conduct',ARRAY['PHARM'],'2025'),
('Original Document Verification & Submission (Vaccination proof)','Orientation & Code of Conduct',ARRAY['NUR-S','PHARM'],'2025'),
('MyJKKN Orientation Programme','Orientation & Code of Conduct',ARRAY['NUR-S'],'2025'),
-- Career, Placement & Professional
('Placement & Training Cell / Skill Dev & Placement','Career, Placement & Professional',ARRAY['NUR-S','AHS','CET24'],'2024-25'),
('Career Awareness After Engineering','Career, Placement & Professional',ARRAY['CET24'],'2024'),
('Engineering Needs of the Society (Industry Expert)','Career, Placement & Professional',ARRAY['CET24'],'2024'),
('Nursing Professional Code of Conduct','Career, Placement & Professional',ARRAY['NUR-S'],'2025'),
('Pharmacist Registration','Career, Placement & Professional',ARRAY['PHARM'],'2025'),
('Professional Ethics','Career, Placement & Professional',ARRAY['AHS'],'2024'),
-- Anti-Ragging & Safety
('Anti-Ragging Seminar','Anti-Ragging & Safety',ARRAY['NUR-S','ENGG','AHS'],'2024-25'),
('Prevention of Sexual Harassment (PoSH) & Drug Awareness','Anti-Ragging & Safety',ARRAY['ENGG'],'2025'),
('Fire Safety Awareness Program','Anti-Ragging & Safety',ARRAY['ENGG'],'2025'),
('Be the First Responder: Save a Life','Anti-Ragging & Safety',ARRAY['ENGG'],'2025'),
('Oral Health & Emergency Acts: A Dental Doctor''s Insight','Anti-Ragging & Safety',ARRAY['ENGG'],'2025'),
-- AI & Digital Tools
('AI Unplugged: Tools that Talk Tech','AI & Digital Tools',ARRAY['NUR-S'],'2025'),
('Empowering Pharmacy Education: AI Tools & Flipped Classroom','AI & Digital Tools',ARRAY['PHARM'],'2025'),
('AI Introduction & Impact on Global Development','AI & Digital Tools',ARRAY['CET24'],'2024'),
('Emerging AI Tools (ChatGPT, Copilot, Gemini, Claude)','AI & Digital Tools',ARRAY['CET24'],'2024'),
('AI Ice-Breaking Prompts','AI & Digital Tools',ARRAY['CET24'],'2024'),
('How to Learn Engineering using AI Tools','AI & Digital Tools',ARRAY['CET24'],'2024'),
('Future of Engineering in the AI Era','AI & Digital Tools',ARRAY['CET24'],'2024'),
('Gemini 2.0 Pro / Veo3 Session','AI & Digital Tools',ARRAY['ENGG'],'2025'),
('Think Like a Pro, Work Like an AI','AI & Digital Tools',ARRAY['ENGG'],'2025'),
('AI & You: Rewriting the Rules of Innovation','AI & Digital Tools',ARRAY['ENGG'],'2025'),
('AI Tools Introduction & Hands-on Training','AI & Digital Tools',ARRAY['AHS'],'2024'),
('Digital Tools Training (Google Workspace, Canva, WordPress, SEO/SMM)','AI & Digital Tools',ARRAY['CET24'],'2024'),
-- Design Thinking & Innovation
('Design Thinking (Empathy to Presentation)','Design Thinking & Innovation',ARRAY['CET24','AHS'],'2024'),
('Innovate to Elevate: Design Thinking Meets Entrepreneurship','Design Thinking & Innovation',ARRAY['ENGG'],'2025'),
('Design Thinking & Innovation — CANVA','Design Thinking & Innovation',ARRAY['AHS'],'2024'),
('Fostering Innovation & Entrepreneurship: IIC Orientation','Design Thinking & Innovation',ARRAY['PHARM','CET24'],'2024-25'),
-- Entrepreneurship & Incubation
('Nattraja Incubation Centre Visit & Jicate Solutions','Entrepreneurship & Incubation',ARRAY['NUR-S','ENGG'],'2025'),
('Startup Studio','Entrepreneurship & Incubation',ARRAY['ENGG'],'2025'),
('3D Printing, Startups & Incubation','Entrepreneurship & Incubation',ARRAY['ENGG'],'2025'),
('From Sun to Society: The Solar Leadership Journey','Entrepreneurship & Incubation',ARRAY['ENGG'],'2025'),
('Drone Technology with Policy','Entrepreneurship & Incubation',ARRAY['ENGG'],'2025'),
-- Soft Skills & Communication
('Communication / Communicative Skills','Soft Skills & Communication',ARRAY['NUR-S','AHS'],'2024-25'),
('Personality Development Program','Soft Skills & Communication',ARRAY['ENGG','AHS'],'2024-25'),
('Start Strong, Be the Next Chapter — The JKKN Experience','Soft Skills & Communication',ARRAY['NUR-S'],'2025'),
('From Zero to Infinity: Beginning the Engineer''s Equation','Soft Skills & Communication',ARRAY['ENGG'],'2025'),
('College Dress Code & Grooming Session','Soft Skills & Communication',ARRAY['AHS'],'2024'),
-- Digital Brand & Social Media
('Digital Brand Ambassador System','Digital Brand & Social Media',ARRAY['NUR-S','PHARM','ENGG'],'2025'),
('LinkedIn Account Opening & Google Review','Digital Brand & Social Media',ARRAY['NUR-S','ENGG'],'2025'),
('Google Workspace & Benefits of Student Email ID','Digital Brand & Social Media',ARRAY['AHS','CET24'],'2024'),
('Social Media Awareness','Digital Brand & Social Media',ARRAY['AHS'],'2024'),
('LinkedIn Networking, Personal Branding & Leadership','Digital Brand & Social Media',ARRAY['CET24'],'2024'),
-- Cross-College Exposure
('Pharmacy & Dental College Visit','Cross-College Exposure',ARRAY['NUR-S','ENGG'],'2025'),
('Nursing College Visit & Lab Facilities','Cross-College Exposure',ARRAY['ENGG','PHARM'],'2025'),
('Engineering & Arts/Science & AHS Labs Visit','Cross-College Exposure',ARRAY['NUR-S','PHARM'],'2025'),
('Indoor Stadium & Gym Visit','Cross-College Exposure',ARRAY['NUR-S','ENGG'],'2025'),
('JKKN Campus Tour & Orientation','Cross-College Exposure',ARRAY['NUR-S','AHS'],'2024-25'),
('Tech Trek: A Walk Through Innovation','Cross-College Exposure',ARRAY['ENGG'],'2025'),
('Smile & Shine: Dental Campus Visit & Screening','Cross-College Exposure',ARRAY['PHARM'],'2025'),
('Crossing Disciplines: Fashion Tech & Visual Communication Exposure','Cross-College Exposure',ARRAY['PHARM'],'2025'),
('Local Area Visit — Hydro Power Station, Mettur','Cross-College Exposure',ARRAY['CET24'],'2024'),
-- Wellness, Yoga & Health
('Yoga Session','Wellness, Yoga & Health',ARRAY['ENGG','AHS','CET24'],'2024-25'),
('Health & Hygiene (& Nutrition)','Wellness, Yoga & Health',ARRAY['AHS','NUR-J'],'2024'),
('Silent Battles, Strong Souls (Mental Health)','Wellness, Yoga & Health',ARRAY['ENGG'],'2025'),
('Towards Nature','Wellness, Yoga & Health',ARRAY['AHS'],'2024'),
('Sports / Sports Activities','Wellness, Yoga & Health',ARRAY['NUR-S','AHS'],'2024'),
-- Universal Human Values & Social
('Universal Human Values','Universal Human Values & Social',ARRAY['CET24'],'2024'),
('Sustainable Development Goals','Universal Human Values & Social',ARRAY['CET24'],'2024'),
('Social Awareness & Beggar-Free India','Universal Human Values & Social',ARRAY['ENGG'],'2025'),
('NSS / IIC / EDC Cells with Plantation Drive','Universal Human Values & Social',ARRAY['ENGG','PHARM'],'2025'),
('Alumni Insight: Motivational Talk','Universal Human Values & Social',ARRAY['NUR-S'],'2025'),
('Motivational Speech','Universal Human Values & Social',ARRAY['NUR-S','ENGG'],'2025'),
('Campus Harmony Signing','Universal Human Values & Social',ARRAY['NUR-S'],'2025'),
-- Cultural & Talent
('Culturals (Solo/Group Song, Dance, Drama)','Cultural & Talent',ARRAY['NUR-S','ENGG'],'2025'),
('NPW 2025 — Pharmacy Week (Face Painting, Flameless Cooking, Mime, Red Carpet)','Cultural & Talent',ARRAY['PHARM'],'2025'),
('Talent Hunt (Solo Singing/Dance, Stand-up, Anchoring, Business-idea)','Cultural & Talent',ARRAY['A&S'],'2025'),
('Word Game (Word Hunt, Speak in Pure Tamil)','Cultural & Talent',ARRAY['A&S'],'2025'),
('Fun Games (Guess Songs by BGM, Dumb Charades)','Cultural & Talent',ARRAY['A&S'],'2025'),
('Talent Built (Roleplay, Brand Busters)','Cultural & Talent',ARRAY['A&S'],'2025'),
('Connection Game (Numbers, Films & Songs, Riddles)','Cultural & Talent',ARRAY['A&S'],'2025'),
('Cooking Without Fire','Cultural & Talent',ARRAY['A&S'],'2025'),
('Movie Time','Cultural & Talent',ARRAY['A&S'],'2025'),
('Treasure Hunt','Cultural & Talent',ARRAY['ENGG'],'2025'),
('Gaming Activities','Cultural & Talent',ARRAY['ENGG'],'2025'),
('Fine Arts — Drawing, Poetry, Singing','Cultural & Talent',ARRAY['AHS'],'2024'),
('Final Cultural Event & Prize Distribution','Cultural & Talent',ARRAY['ENGG'],'2025'),
-- Academic, Library & Project
('Library e-Resources','Academic, Library & Project',ARRAY['AHS'],'2024'),
('Student Project Display','Academic, Library & Project',ARRAY['ENGG'],'2025'),
('Interactive Model Session','Academic, Library & Project',ARRAY['ENGG'],'2025'),
('Students Playbook','Academic, Library & Project',ARRAY['AHS'],'2024'),
('Event Planning Discussion (YUVA Chair & Co-chair)','Academic, Library & Project',ARRAY['NUR-S','ENGG'],'2025'),
-- Team Building & Games
('Team Building Activities (Scavenger Hunt, Minefield, Mafia)','Team Building & Games',ARRAY['CET24'],'2024'),
('Mind Games — Team Building','Team Building & Games',ARRAY['AHS'],'2024')
ON CONFLICT (canonical_title) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Live-score links: attach the LIVE Fresher Induction 2026 sessions to catalog
-- topics (conservative title match) so their fresher ratings show as value_score.
-- Non-matching live sessions simply contribute no score yet; more accrue as future
-- inductions run and are linked.
-- ----------------------------------------------------------------------------
INSERT INTO public.induction_topic_catalog_live_link (topic_id, event_id, session_id, institution_id)
SELECT c.id, s.event_id, s.id, ip.institution_id
FROM public.event_sessions s
JOIN public.induction_programs ip ON ip.event_id = s.event_id
JOIN public.induction_topic_catalog c ON (
     (s.title ILIKE 'Inaugural%'        AND c.canonical_title = 'Inaugural Function / Vibrant Arangam')
  OR (s.title ILIKE 'Placement%'        AND c.canonical_title = 'Placement & Training Cell / Skill Dev & Placement')
  OR (s.title ILIKE 'Yoga%'             AND c.canonical_title = 'Yoga Session')
  OR (s.title ILIKE 'Startup studio%'   AND c.canonical_title = 'Startup Studio')
  OR (s.title ILIKE '3D Printing%'      AND c.canonical_title = '3D Printing, Startups & Incubation')
  OR (s.title ILIKE 'Design Thinking%'  AND c.canonical_title = 'Design Thinking (Empathy to Presentation)')
)
ON CONFLICT (topic_id, session_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Ranking read RPC. SHARED reference (no institution scope) — any induction.view
-- holder sees the full cross-college catalog. Anon-locked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_topic_catalog(
  p_theme TEXT DEFAULT NULL, p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  topic_id        uuid,
  canonical_title text,
  theme           text,
  colleges        text[],
  years           text,
  adoption        integer,
  value_score     numeric,
  score_responses integer,
  runs_rated      integer,
  needs_review    boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_topic_catalog: not authenticated'; END IF;
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('induction.view')) THEN
    RAISE EXCEPTION 'fn_induction_topic_catalog: not authorized';
  END IF;

  RETURN QUERY
  SELECT c.id, c.canonical_title, c.theme, c.colleges, c.years,
         coalesce(array_length(c.colleges, 1), 0)::integer AS adoption,
         agg.value_score,
         coalesce(agg.score_responses, 0)::integer,
         coalesce(agg.runs_rated, 0)::integer,
         c.needs_review
  FROM public.induction_topic_catalog c
  LEFT JOIN LATERAL (
    SELECT round(avg(f.rating), 2)               AS value_score,
           count(f.*)::int                       AS score_responses,
           count(DISTINCT ll.session_id)::int    AS runs_rated
    FROM public.induction_topic_catalog_live_link ll
    JOIN public.event_session_feedback f ON f.session_id = ll.session_id
    WHERE ll.topic_id = c.id
  ) agg ON true
  WHERE (p_theme  IS NULL OR c.theme = p_theme)
    AND (p_search IS NULL OR c.canonical_title ILIKE '%' || p_search || '%')
  -- Confidence floor: a score only drives the ranking once it has >= 5 ratings, so a
  -- thin-sample topper (e.g. one 5.0 vote) can't outrank a well-rated one (4.14 / 202).
  -- Below the floor a topic ranks by adoption (treated as not-yet-confidently-rated),
  -- though its provisional score is still returned for display.
  ORDER BY (CASE WHEN coalesce(agg.score_responses, 0) >= 5 THEN agg.value_score END) DESC NULLS LAST,
           coalesce(array_length(c.colleges, 1), 0) DESC,
           c.canonical_title;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_topic_catalog(TEXT, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_topic_catalog(TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
