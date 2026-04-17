-- ============================================================================
-- PR-A2 commit 2: Compliance Unification — metrics catalog expansion
-- ============================================================================
-- Extends PR-A2 commit 1's starter 25-row seed with NAAC + NIRF + NBA depth.
-- Target after this migration: ~75 rows across 10 bodies (was 25).
--
-- Out of scope (deferred to per-body dashboard PRs):
--   - Full 215-row catalog with domain-expert rubric values
--   - DCI/PCI/INC/NCTE/AICTE/UGC expansion — let each body's own PR seed them
--     alongside the dashboard work for that body, so rubric accuracy is in the
--     same review as the UI.
--
-- Also NOT in this migration (original PR-A2 c2 spec items that became no-ops):
--   - Data migration: ip_filings.naac_*  + sh_publications.naac_criterion →
--     junction rows. Production has 0 existing rows in both; migration would
--     be a no-op. Deferred to the sprint that actually starts tagging.
--   - Fan-out trigger for sh_publications / ip_filings: these are per-source
--     retrofit work that naturally belongs to PR-A3 (Admission) + PR-A9 (NIRF)
--     which modify those tables. Identical pattern to PR-A5's anti-ragging trigger.
--
-- Idempotent: all INSERTs use ON CONFLICT DO NOTHING. Re-running is safe.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- NAAC expansion (6 → 20 rows) — covers all 10 attributes with 2+ metrics each
-- ----------------------------------------------------------------------------
-- UNIQUE constraint in this catalog is on (metric_type, metric_code). Using
-- ON CONFLICT requires the constraint to exist; if it doesn't, fall back to
-- WHERE NOT EXISTS. Current schema has no UNIQUE on (metric_type, metric_code),
-- so we use WHERE NOT EXISTS guards.
-- ----------------------------------------------------------------------------
INSERT INTO sh_accreditation_metrics (metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
SELECT * FROM (VALUES
  -- Attribute 1: Curriculum
  ('NAAC', '1.1.2', 'Program Outcomes + Course Outcomes mapping', 'Attribute 1: Curriculum', 10, 'Count courses with PO/CO published / total courses', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '1.2.1', 'Programs offering flexibility (electives, minors)', 'Attribute 1: Curriculum', 10, '/academic/programs WHERE has_elective_track=true', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '1.3.1', 'Integration of cross-cutting issues (gender, ethics, sustainability)', 'Attribute 1: Curriculum', 10, 'Course syllabus tagging', 'Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 2: Faculty Resources
  ('NAAC', '2.2.1', 'Faculty positions filled as per sanctioned strength', 'Attribute 2: Faculty Resources', 10, 'staff count / sanctioned_strength per institution', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '2.2.3', 'Faculty at professor / associate professor / assistant levels', 'Attribute 2: Faculty Resources', 10, 'GROUP BY cadre', 'Overlaps NIRF TLR_QF. Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '2.3.1', 'Faculty retention % over last 3 years', 'Attribute 2: Faculty Resources', 10, '(current_faculty ∩ 3yr_ago_faculty) / 3yr_ago_faculty', 'Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 3: Infrastructure
  ('NAAC', '3.1.1', 'Classrooms + labs + library geo-tagged with photos + purchase bills', 'Attribute 3: Infrastructure', 15, 'Phase 5 fac_registry + fac_photos coverage %', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '3.2.1', 'Digital classroom coverage', 'Attribute 3: Infrastructure', 10, '/academic/classrooms WHERE has_projector=true AND has_wifi=true', 'Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 4: Financial
  ('NAAC', '4.4.1', 'Budget utilization % over last 3 years', 'Attribute 4: Financial', 10, 'expended_amount / allocated_amount per FY', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '4.4.2', 'Audit report — clean opinion for last 3 FY', 'Attribute 4: Financial', 10, 'process_audits WHERE abcd_rating=A AND audit_period_end > now()-3y', 'Overlaps Process Excellence module. Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 5: Learning & Teaching (Auto + Aff mega-block)
  ('NAAC', '5.1.1', 'Pedagogy tagging coverage', 'Attribute 5: Learning & Teaching', 20, '/academic/courses WHERE pedagogy_tag IS NOT NULL / total', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '5.2.1', 'Learning Path enrollment (SWAYAM, MOOCs)', 'Attribute 5: Learning & Teaching', 15, 'learning_paths + learning_path_steps completion', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '5.3.1', 'Industry-internship completion', 'Attribute 5: Learning & Teaching', 15, 'learner_industry_engagements WHERE completed=true / graduating_cohort', 'Overlaps Phase 5 Industry Integration. Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '5.4.1', 'Assessment diversity (not just end-sem)', 'Attribute 5: Learning & Teaching', 10, 'assessment types per course', 'Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 6: Extended Curricular
  ('NAAC', '6.1.1', 'Student council / learners-council activity', 'Attribute 6: Extended Curricular', 15, 'lc_events + lc_meetings + lc_polls counts', 'Overlaps Learners Council module. Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '6.2.1', 'Sports participation + achievements', 'Attribute 6: Extended Curricular', 15, 'health_sports_profiles + health_sports_achievements (cricket excluded per JKKN policy)', 'Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 7: Governance
  ('NAAC', '7.1.1', 'Institutional Development Plan + monitoring', 'Attribute 7: Governance', 15, 'OKR tier_1 objectives + check-ins fortnightly', 'Overlaps OKR module. Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '7.3.1', 'IQAC meeting frequency + AQAR submission timeliness', 'Attribute 7: Governance', 10, 'accreditation_committees WHERE body_code=NAAC + accreditation_submissions', 'Seeded 2026-04-17 PR-A2c2'),
  -- Attribute 8: Student Outcomes
  ('NAAC', '8.1.1', 'Pass % in final year exams', 'Attribute 8: Student Outcomes', 20, 'alumni_outcomes WHERE graduated=true / graduating_cohort', 'Seeded 2026-04-17 PR-A2c2'),
  ('NAAC', '8.2.1', 'Placement + higher studies progression', 'Attribute 8: Student Outcomes', 25, 'alumni_outcomes WHERE placed=true OR pursuing_higher_ed=true', 'Overlaps NIRF GO_PL. Seeded 2026-04-17 PR-A2c2')
) AS new_rows(metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM sh_accreditation_metrics m
  WHERE m.metric_type = new_rows.metric_type AND m.metric_code = new_rows.metric_code
);

-- ----------------------------------------------------------------------------
-- NIRF expansion (5 → 15 rows) — 5 params × 3 sub-indicators avg
-- ----------------------------------------------------------------------------
INSERT INTO sh_accreditation_metrics (metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
SELECT * FROM (VALUES
  -- TLR (Teaching, Learning & Resources) — 100 pts total
  ('NIRF', 'TLR_FS', 'Teaching: Financial Resources (per student)', 'TLR', 30, 'institution_expenditure / active_learners per year', 'Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'TLR_FE', 'Teaching: Faculty-Student Ratio', 'TLR', 15, 'staff count / active_learners * 100', 'Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'TLR_FP', 'Teaching: Faculty Permanent (FT)', 'TLR', 15, 'staff WHERE employment_type=permanent / total staff', 'Seeded 2026-04-17 PR-A2c2'),
  -- RPC (Research + Professional Practice) — 100 pts
  ('NIRF', 'RPC_QP', 'Research: Quality of Publications (impact factor)', 'RPC', 20, 'sh_publications SUM(journal_impact_factor)', 'Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'RPC_IP', 'Research: IP Filings + Patents granted', 'RPC', 15, 'ip_filings WHERE status IN (filed, granted)', 'Overlaps NAAC 9 + Faculty Innovation. Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'RPC_FR', 'Research: Footprint of Projects + Funding', 'RPC', 25, 'sh_grants SUM(funded_amount)', 'Seeded 2026-04-17 PR-A2c2'),
  -- GO (Graduation Outcomes) — 100 pts (40 already in PR-A2 c1 as GO_PL)
  ('NIRF', 'GO_MS', 'Graduation: Median Salary', 'GO', 25, 'alumni_outcomes PERCENTILE_CONT(0.5) of salary_band midpoint', 'Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'GO_PS', 'Graduation: % pursuing higher studies', 'GO', 15, 'alumni_outcomes WHERE pursuing_higher_ed=true / graduating_cohort', 'Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'GO_GUE', 'Graduation: Graduating without further exams', 'GO', 20, 'alumni_outcomes WHERE graduated_on_time=true', 'Seeded 2026-04-17 PR-A2c2'),
  -- OI (Outreach & Inclusivity) — 100 pts (15 already OI_GD)
  ('NIRF', 'OI_RD', 'Outreach: Region Diversity', 'OI', 30, 'learners_profiles GROUP BY home_state', 'Seeded 2026-04-17 PR-A2c2'),
  ('NIRF', 'OI_ESCS', 'Outreach: Economic+Social challenged students', 'OI', 20, 'learners_profiles WHERE financial_aid=true', 'Seeded 2026-04-17 PR-A2c2'),
  -- PR (Perception) — 100 pts (survey-based)
  ('NIRF', 'PR_PEER', 'Perception: Peer perception (academic)', 'PR', 100, 'External survey (annual)', 'Seeded 2026-04-17 PR-A2c2')
) AS new_rows(metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM sh_accreditation_metrics m
  WHERE m.metric_type = new_rows.metric_type AND m.metric_code = new_rows.metric_code
);

-- ----------------------------------------------------------------------------
-- NBA expansion (3 → 10 rows) — full 10 criteria
-- ----------------------------------------------------------------------------
INSERT INTO sh_accreditation_metrics (metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
SELECT * FROM (VALUES
  ('NBA', 'T1_VS', 'Vision, Mission + Program Educational Objectives', 'Tier 1', 60, 'Institutional documentation', 'Seeded 2026-04-17 PR-A2c2'),
  ('NBA', 'T1_CU', 'Curriculum + delivery', 'Tier 1', 100, 'Syllabus + PO/CO mapping', 'Overlaps NAAC 1 + 5. Seeded 2026-04-17 PR-A2c2'),
  ('NBA', 'T1_SP', 'Students Performance', 'Tier 1', 150, 'pass % + placement + CGPA distribution', 'Overlaps NAAC 8. Seeded 2026-04-17 PR-A2c2'),
  ('NBA', 'T2_STF', 'Faculty Information + Contributions', 'Tier 2', 200, 'staff quals + publications + PhD %', 'Overlaps NAAC 2 + 9, NIRF TLR+RPC. Seeded 2026-04-17 PR-A2c2'),
  ('NBA', 'T2_FAC', 'Facilities + Technical Support', 'Tier 2', 80, 'infrastructure + lab + library audit', 'Overlaps NAAC 3. Seeded 2026-04-17 PR-A2c2'),
  ('NBA', 'T2_CI', 'Continuous Improvement', 'Tier 2', 75, 'quality_evidence_mappings count per cycle', 'Seeded 2026-04-17 PR-A2c2'),
  ('NBA', 'T2_FS', 'First Year Academics', 'Tier 2', 50, 'pass % in first year + retention', 'Engineering-specific. Seeded 2026-04-17 PR-A2c2')
) AS new_rows(metric_type, metric_code, metric_name, category, max_score, calculation_method, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM sh_accreditation_metrics m
  WHERE m.metric_type = new_rows.metric_type AND m.metric_code = new_rows.metric_code
);

COMMIT;

-- ============================================================================
-- Verification (run manually after apply)
-- ============================================================================
-- SELECT metric_type, COUNT(*) AS n
-- FROM sh_accreditation_metrics
-- WHERE notes LIKE '%Seeded 2026-04-17%'  -- includes PR-A2 c1 + c2
-- GROUP BY metric_type ORDER BY metric_type;
--
-- Expected after c2:
--   NAAC: 20 rows (was 6, +14 new)
--   NIRF: 15 rows (was 5, +10)
--   NBA:  10 rows (was 3, +7)
--   QS:    2 rows (unchanged)
--   DCI:   2 rows (unchanged)
--   PCI:   2 rows (unchanged)
--   INC:   2 rows (unchanged)
--   NCTE:  1 row  (unchanged)
--   AICTE: 1 row  (unchanged)
--   UGC:   1 row  (unchanged)
--   TOTAL: 56 rows
-- ============================================================================
