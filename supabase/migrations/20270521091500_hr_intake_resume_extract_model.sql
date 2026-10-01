-- 20270521091500_hr_intake_resume_extract_model.sql
-- ----------------------------------------------------------------------------
-- HR intake helper (2026-10-01): register the resume reader's model row.
--
-- lib/hr/intake/resume-extract.ts reads one applicant's resume (PDF, JPG/PNG or
-- DOCX text) with the paid Claude API and returns qualification, subject, years
-- of experience, current role and a one-sentence summary for HR's card. Its own
-- feature key keeps its model choice and its spend separately visible and
-- changeable on /admin/ai-models, the same way procurement.quotation_extract_api
-- is registered (20260916130000). Haiku 4.5 = cheapest current model that reads
-- PDFs and images. Data row only; no schema change. Idempotent.
-- ----------------------------------------------------------------------------

insert into public.ai_model_config (feature_key, display_name, description, category, provider, model_id, is_active, change_reason)
values ('hr.intake.resume_extract', 'HR Intake Resume Reading',
 'Reads each applicant resume in an HR intake batch (PDF, image or Word .docx) and returns qualification, subject, years of experience, current role and a one-sentence summary. Contact and personal details are never returned. Paid per resume.',
 'hr', 'anthropic', 'claude-haiku-4-5', true,
 'HR intake helper resume reader; cheapest current model that reads PDFs and images (2026-10-01)')
on conflict (feature_key) do nothing;
