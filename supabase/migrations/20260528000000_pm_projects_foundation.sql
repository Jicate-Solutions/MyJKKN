-- ============================================================================
-- Projects Module — Foundation Substrate (PR 1 of ~31-43)
-- ============================================================================
-- Spec: specs/pm-projects-module-2026-05-26.md (71 decisions locked)
-- Interview: /myjkkn-module (55q) + /assumption-thrash (16q)
--
-- This migration creates ~33 Projects-module tables (core, tasks, risks/issues,
-- resources/budget, stakeholder, approvals, templates, cross-institution,
-- activity, closure, integrations), drops the EMPTY okr_* tables (unified model),
-- seeds ~20 pm.* policy rows, creates 2 storage buckets, and seeds the CRUDable
-- masters (types/statuses/priorities/labels). RLS on every new table.
--
-- Design decisions driving columns (from spec):
--   AT.1  projects.financial_year text (FY of START date, Apr-Mar)
--   AT.2  4-level hierarchy: projects -> project_phases -> project_tasks -> subtasks
--   AT.3  project_types.field_config jsonb (configurable fields per type)
--   AT.4  projects.snapshot_approval_chain jsonb + is_refreezable bool
--   AT.5  soft-delete: status 'cancelled' + cancellation_reason (cascade in app layer)
--   AT.6  project_members delegation (delegation_to_user_id + start/end)
--   AT.7  approval_requests.is_emergency + emergency_followup_due
--   AT.10 projects.visibility enum + is_confidential
--   AT.12 types/statuses/priorities/labels CRUDable (is_system + is_active)
--   F1.14 projects.scope_model ('single_institution' default | 'cross_institution')
--   Unified model: project_types seed includes 'okr_objective';
--                  project_tasks.task_type includes 'key_result'
--
-- FK targets (verified live 2026-05-28):
--   staff.id uuid, institutions.id uuid, profiles.id uuid
--   helper fns present: public.is_super_admin(), public.is_admin(), fn_touch_updated_at()
--   platform_policies: classification in (operational,major);
--                      publication_state in (draft_only,published,draft_pending);
--                      scope_type in (global,institution,role,user);
--                      data_type in (number,string,boolean,array,object,enum)
--
-- SPEC OVERRIDE (live-verified): of the 18 okr_* tables, FOUR are NOT empty
--   (okr_auto_track_sources=6, okr_metric_cache=12, okr_metric_execution_log=27,
--    okr_metric_registry=12). Per the safety gate ("if ANY has rows, do not drop"),
--   this migration drops ONLY the 14 confirmed-empty okr_* tables. The 4 metric/
--   auto-track tables are left intact and flagged for a follow-up data review.
-- ============================================================================

BEGIN;

-- ============================================================================
-- updated_at trigger fn (idempotent — already exists in prod, re-declare safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

-- ============================================================================
-- SECTION A — CRUDable masters (Decision AT.12)
-- ============================================================================

-- A.1 project_types — CRUDable, with field_config (Decision AT.3 / AT.12)
CREATE TABLE IF NOT EXISTS public.project_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  field_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  closure_model text NOT NULL DEFAULT 'simple'
    CHECK (closure_model IN ('simple', 'full_pir')),
  icon text,
  color text,
  order_index integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.project_types IS
  'CRUDable master of project types (general, accreditation_prep, infrastructure, curriculum, operational, okr_objective). field_config jsonb defines configurable fields per type (Decision AT.3). closure_model selects simple vs full PIR (F15.1). is_system protects seeded defaults.';

-- A.2 project_statuses — CRUDable, ordered (Decision AT.12, F1.7)
CREATE TABLE IF NOT EXISTS public.project_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'active'
    CHECK (category IN ('backlog', 'active', 'done', 'cancelled', 'archived')),
  color text,
  order_index integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.project_statuses IS
  'CRUDable master of project lifecycle statuses (backlog/todo/in_progress/review/done/cancelled/archived). category buckets statuses for portfolio R/A/G and soft-delete (AT.5). order_index drives Kanban column order.';

-- A.3 project_priorities — CRUDable (Decision AT.12)
CREATE TABLE IF NOT EXISTS public.project_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  color text,
  weight integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.project_priorities IS
  'CRUDable master of priorities (low/medium/high/critical). weight enables numeric sort. Decision AT.12.';

-- A.4 project_labels — CRUDable label master (Decision F1.11, AT.12)
CREATE TABLE IF NOT EXISTS public.project_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  color text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.project_labels IS
  'CRUDable label/tag master. Tasks attach labels via project_task_labels junction (Decision F1.11).';

-- A.5 project_budget_categories — CRUDable budget category master (Decision F6.1)
CREATE TABLE IF NOT EXISTS public.project_budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
COMMENT ON TABLE public.project_budget_categories IS
  'CRUDable budget category master (e.g., Equipment, Travel, Consulting). Decision F6.1 (categories + burn rate).';

-- ============================================================================
-- SECTION B — Core project entities
-- ============================================================================

-- B.1 projects — root entity
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  title text NOT NULL,
  description text,
  project_type_id uuid REFERENCES public.project_types(id),
  status_id uuid REFERENCES public.project_statuses(id),
  priority_id uuid REFERENCES public.project_priorities(id),
  institution_id uuid REFERENCES public.institutions(id),
  owner_staff_id uuid REFERENCES public.staff(id),
  scope_model text NOT NULL DEFAULT 'single_institution'
    CHECK (scope_model IN ('single_institution', 'cross_institution')),       -- F1.14
  visibility text NOT NULL DEFAULT 'institution'
    CHECK (visibility IN ('public', 'institution', 'team', 'confidential')),   -- AT.10
  is_confidential boolean NOT NULL DEFAULT false,                             -- AT.10
  start_date date,
  due_date date,
  actual_start_date date,
  actual_end_date date,
  financial_year text,                                                        -- AT.1 (FY of start, Apr-Mar)
  percent_complete numeric(5,2) NOT NULL DEFAULT 0
    CHECK (percent_complete >= 0 AND percent_complete <= 100),
  rag_status text NOT NULL DEFAULT 'green'
    CHECK (rag_status IN ('red', 'amber', 'green')),
  is_okr boolean NOT NULL DEFAULT false,                                      -- unified model marker
  status_workflow jsonb NOT NULL DEFAULT '[]'::jsonb,                         -- F1.7 per-project statuses
  enforce_dependencies boolean NOT NULL DEFAULT false,                        -- F1.9
  allow_collaborators boolean NOT NULL DEFAULT true,                          -- F1.10
  snapshot_approval_chain jsonb,                                              -- AT.4 frozen at creation
  is_refreezable boolean NOT NULL DEFAULT true,                               -- AT.4
  cancellation_reason text,                                                   -- AT.5 soft-delete
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id),
  baseline_snapshot jsonb,                                                    -- F2.7 plan snapshot
  source_template_id uuid,                                                    -- from project_templates
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_institution ON public.projects(institution_id);
CREATE INDEX IF NOT EXISTS idx_projects_type ON public.projects(project_type_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_staff_id);
CREATE INDEX IF NOT EXISTS idx_projects_fy ON public.projects(financial_year);
COMMENT ON TABLE public.projects IS
  'Root project entity. Unified work-management platform: OKR objectives are projects with is_okr=true (Phase 5 unified model). scope_model single vs cross-institution (F1.14). visibility + is_confidential (AT.10). financial_year = FY of start date Apr-Mar (AT.1). snapshot_approval_chain frozen at creation, re-freezable (AT.4). Soft-delete via status cancelled + cancellation_reason (AT.5).';

-- B.2 project_phases — level 2 (Decision AT.2)
CREATE TABLE IF NOT EXISTS public.project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  start_date date,
  due_date date,
  percent_complete numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_phases_project ON public.project_phases(project_id);
COMMENT ON TABLE public.project_phases IS
  'Level 2 of 4-level hierarchy (AT.2): phases group tasks within a project. order_index sequences phases on the Gantt.';

-- B.3 project_milestones — zero-duration checkpoints (Decision F2.3, AT.2)
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.project_phases(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  planned_date date,
  actual_date date,
  is_complete boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON public.project_milestones(project_id);
COMMENT ON TABLE public.project_milestones IS
  'Formal milestone type — diamond on Gantt (F2.3). planned_date vs actual_date supports baseline comparison (F2.7).';

-- ============================================================================
-- SECTION C — Tasks (level 3) + subtasks (level 4) + task relations
-- ============================================================================

-- C.1 project_tasks — level 3 (Decision AT.2, F1.11)
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.project_phases(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'task'
    CHECK (task_type IN ('task', 'key_result', 'checkpoint', 'bug', 'spike')),  -- unified: key_result
  status_key text NOT NULL DEFAULT 'todo',                                      -- F1.7 per-project workflow
  priority_id uuid REFERENCES public.project_priorities(id),
  owner_staff_id uuid REFERENCES public.staff(id),                             -- F1.10
  start_date date,
  due_date date,
  completed_at timestamptz,
  estimated_hours numeric(8,2),                                                -- F1.11 est vs actual
  actual_hours numeric(8,2),
  story_points numeric(5,1),                                                   -- F13.1 sprint overlay
  sprint_id uuid,                                                              -- F13.1 (sprints table later)
  order_index integer NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  is_overdue boolean NOT NULL DEFAULT false,                                   -- F1.8 visual cue
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_phase ON public.project_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_owner ON public.project_tasks(owner_staff_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks(status_key);
COMMENT ON TABLE public.project_tasks IS
  'Level 3 of 4-level hierarchy (AT.2). task_type=key_result for unified OKR model. status_key references the per-project status_workflow (F1.7). estimated_hours vs actual_hours for time tracking (F1.11). story_points for sprint overlay (F13.1).';

-- C.2 project_task_subtasks — level 4 (Decision AT.2)
CREATE TABLE IF NOT EXISTS public.project_task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_complete boolean NOT NULL DEFAULT false,
  assignee_staff_id uuid REFERENCES public.staff(id),
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_task_subtasks_task ON public.project_task_subtasks(task_id);
COMMENT ON TABLE public.project_task_subtasks IS
  'Level 4 of 4-level hierarchy (AT.2): subtask checklist items under a task.';

-- C.3 project_task_assignees — multi-assignee junction (Decision F1.6, F1.10)
CREATE TABLE IF NOT EXISTS public.project_task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'collaborator'
    CHECK (role IN ('owner', 'collaborator')),                                 -- F1.10
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_task_assignees UNIQUE (task_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_project_task_assignees_task ON public.project_task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_assignees_staff ON public.project_task_assignees(staff_id);
COMMENT ON TABLE public.project_task_assignees IS
  'Multi-assignee junction (F1.6 mix of creator/self/manager assignment). role=owner|collaborator (F1.10).';

-- C.4 project_task_dependencies (Decision F1.9, F2.8)
CREATE TABLE IF NOT EXISTS public.project_task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'blocks'
    CHECK (dependency_type IN ('blocks', 'relates_to')),                       -- F1.9
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT uq_project_task_dependencies UNIQUE (task_id, depends_on_task_id),
  CONSTRAINT chk_no_self_dependency CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_project_task_deps_task ON public.project_task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_deps_depends ON public.project_task_dependencies(depends_on_task_id);
COMMENT ON TABLE public.project_task_dependencies IS
  'Task dependency edges (F1.9 configurable blocking; F2.8 auto-cascade). dependency_type blocks|relates_to. Critical-path engine (F2.5) walks blocks edges.';

-- C.5 project_task_comments — threaded (Decision F1.11)
CREATE TABLE IF NOT EXISTS public.project_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.project_task_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_task_comments_task ON public.project_task_comments(task_id);
COMMENT ON TABLE public.project_task_comments IS
  'Threaded task comments (F1.11). parent_comment_id supports replies.';

-- C.6 project_task_attachments — with version history (Decision F1.11, F7.1, AT.9)
CREATE TABLE IF NOT EXISTS public.project_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  version integer NOT NULL DEFAULT 1,                                          -- F7.1 version history
  supersedes_id uuid REFERENCES public.project_task_attachments(id),
  is_final_report boolean NOT NULL DEFAULT false,                              -- AT.9 closure stage gate
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_attachment_parent CHECK (task_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_project_task_attachments_task ON public.project_task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_attachments_project ON public.project_task_attachments(project_id);
COMMENT ON TABLE public.project_task_attachments IS
  'Attachments on tasks or projects, with version history (F7.1). is_final_report flags closure stage-gate uploads (AT.9). Files in pm-project-attachments bucket.';

-- C.7 project_task_labels — junction to label master (Decision F1.11)
CREATE TABLE IF NOT EXISTS public.project_task_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.project_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_project_task_labels UNIQUE (task_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_project_task_labels_task ON public.project_task_labels(task_id);
CREATE INDEX IF NOT EXISTS idx_project_task_labels_label ON public.project_task_labels(label_id);
COMMENT ON TABLE public.project_task_labels IS
  'Junction: tasks <-> labels master (F1.11 labels/tags).';

-- ============================================================================
-- SECTION D — Risks / Issues (RAID log) — Decision F3.*
-- ============================================================================

-- D.1 project_risks — might happen (Decision F3.1, F3.2, F3.5)
CREATE TABLE IF NOT EXISTS public.project_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,         -- F3.6 optional task link
  milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  risk_category text,                                                          -- F3.1 (staff/regulatory/budget/...)
  severity_simple text CHECK (severity_simple IN ('low', 'medium', 'high')),   -- F3.2 simple H/M/L
  likelihood integer CHECK (likelihood BETWEEN 1 AND 5),                       -- F3.2 matrix
  impact integer CHECK (impact BETWEEN 1 AND 5),
  rag_status text NOT NULL DEFAULT 'green'
    CHECK (rag_status IN ('red', 'amber', 'green')),
  status_key text NOT NULL DEFAULT 'open',                                     -- F3.3 configurable lifecycle
  owner_staff_id uuid REFERENCES public.staff(id),
  is_escalated boolean NOT NULL DEFAULT false,                                 -- F3.4
  escalated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_risks_project ON public.project_risks(project_id);
COMMENT ON TABLE public.project_risks IS
  'RAID register — risks (might happen), separate from issues (F3.5). Simple H/M/L or likelihood x impact matrix (F3.2). Configurable lifecycle (F3.3). Auto-escalation when severe (F3.4).';

-- D.2 project_issues — already happened (Decision F3.5)
CREATE TABLE IF NOT EXISTS public.project_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  raised_from_risk_id uuid REFERENCES public.project_risks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status_key text NOT NULL DEFAULT 'open',
  owner_staff_id uuid REFERENCES public.staff(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_issues_project ON public.project_issues(project_id);
COMMENT ON TABLE public.project_issues IS
  'RAID register — issues (already materialized problems), separate from risks (F3.5). raised_from_risk_id links a realized risk to its issue.';

-- D.3 project_risk_mitigation_steps — auto-creates linked tasks (Decision F3.7)
CREATE TABLE IF NOT EXISTS public.project_risk_mitigation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.project_risks(id) ON DELETE CASCADE,
  description text NOT NULL,
  owner_staff_id uuid REFERENCES public.staff(id),
  deadline date,
  is_complete boolean NOT NULL DEFAULT false,
  linked_task_id uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,  -- F3.7 auto-create task
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_risk_mitigation_steps_risk ON public.project_risk_mitigation_steps(risk_id);
COMMENT ON TABLE public.project_risk_mitigation_steps IS
  'Structured mitigation: owner + action + deadline per step, optionally auto-creates a linked project task (F3.7).';

-- D.4 project_risk_escalations — audit trail (Decision F3.4)
CREATE TABLE IF NOT EXISTS public.project_risk_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.project_risks(id) ON DELETE CASCADE,
  escalated_to_staff_id uuid REFERENCES public.staff(id),
  escalated_by uuid REFERENCES public.profiles(id),
  escalation_level text,                                                       -- lead/principal/director
  reason text,
  is_auto boolean NOT NULL DEFAULT false,                                      -- F3.4 manual vs auto
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_risk_escalations_risk ON public.project_risk_escalations(risk_id);
COMMENT ON TABLE public.project_risk_escalations IS
  'Escalation audit trail (who/when/why). is_auto distinguishes auto-escalation (F3.4) from manual.';

-- ============================================================================
-- SECTION E — Resources / Budget — Decisions F5.*, F6.*, AT.6
-- ============================================================================

-- E.1 project_members — with delegation (Decision F5.1, AT.6)
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',                                         -- lead/member/viewer
  allocation_percentage numeric(5,2)
    CHECK (allocation_percentage IS NULL OR (allocation_percentage > 0 AND allocation_percentage <= 100)),
  delegation_to_user_id uuid REFERENCES public.profiles(id),                   -- AT.6
  delegation_start date,                                                       -- AT.6
  delegation_end date,                                                         -- AT.6
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT uq_project_members UNIQUE (project_id, staff_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_staff ON public.project_members(staff_id);
COMMENT ON TABLE public.project_members IS
  'Project team roster. allocation_percentage feeds capacity planning (F5.1) alongside HR workload (F5.2). delegation_to_user_id + dates = formal temporary role delegation (AT.6).';

-- E.2 project_budget — planned vs actual (Decision F6.1)
CREATE TABLE IF NOT EXISTS public.project_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.project_budget_categories(id),
  planned_amount_inr numeric(14,2) NOT NULL DEFAULT 0,
  actual_amount_inr numeric(14,2) NOT NULL DEFAULT 0,
  forecast_amount_inr numeric(14,2),                                           -- F6.1 forecast
  currency text NOT NULL DEFAULT 'INR',
  period_month date,                                                           -- F6.1 monthly burn rate
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_budget_project ON public.project_budget(project_id);
CREATE INDEX IF NOT EXISTS idx_project_budget_category ON public.project_budget(category_id);
COMMENT ON TABLE public.project_budget IS
  'Budget lines: planned vs actual vs forecast per category per month (F6.1 categories + monthly burn rate + forecast).';

-- E.3 project_budget_changes — audit trail with approval (Decision F6.2, F14.1)
CREATE TABLE IF NOT EXISTS public.project_budget_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_id uuid REFERENCES public.project_budget(id) ON DELETE SET NULL,
  old_amount_inr numeric(14,2),
  new_amount_inr numeric(14,2),
  reason text,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'not_required')),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  requested_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_budget_changes_project ON public.project_budget_changes(project_id);
COMMENT ON TABLE public.project_budget_changes IS
  'Budget change audit trail with approval status (F6.2 configurable threshold; F14.1 change management).';

-- ============================================================================
-- SECTION F — Stakeholder / Comms — Decisions F8.*, AT.11
-- ============================================================================

-- F.1 project_stakeholders — with notification prefs (Decision F8.1)
CREATE TABLE IF NOT EXISTS public.project_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  external_name text,
  external_email text,
  role text,
  notify_in_app boolean NOT NULL DEFAULT true,                                 -- F8.1
  notify_email boolean NOT NULL DEFAULT true,                                  -- F8.1
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_stakeholder_identity CHECK (staff_id IS NOT NULL OR external_email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_project_stakeholders_project ON public.project_stakeholders(project_id);
COMMENT ON TABLE public.project_stakeholders IS
  'Project stakeholders (internal staff or external contacts) with notification preferences (F8.1 in-app + email, no WhatsApp V1).';

-- F.2 project_status_reports — weekly auto-generated (Decision AT.11)
CREATE TABLE IF NOT EXISTS public.project_status_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_period_start date,
  report_period_end date,
  summary text,
  rag_status text CHECK (rag_status IN ('red', 'amber', 'green')),
  generated_type text NOT NULL DEFAULT 'auto'
    CHECK (generated_type IN ('auto', 'manual')),                              -- AT.11 auto + on-demand
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,                                                           -- pm-status-reports bucket
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_status_reports_project ON public.project_status_reports(project_id);
COMMENT ON TABLE public.project_status_reports IS
  'Auto-generated weekly + on-demand status reports (AT.11). PDFs stored in pm-status-reports bucket.';

-- ============================================================================
-- SECTION G — Approvals — Decisions F9.*, AT.7
-- ============================================================================

-- G.1 project_approval_workflows — templates per project type (Decision F9.1)
CREATE TABLE IF NOT EXISTS public.project_approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_type_id uuid REFERENCES public.project_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_action text NOT NULL,                                                -- creation/budget/scope/...
  approval_chain jsonb NOT NULL DEFAULT '[]'::jsonb,                           -- ordered approver roles
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_type ON public.project_approval_workflows(project_type_id);
COMMENT ON TABLE public.project_approval_workflows IS
  'Approval workflow templates: per project type, defines which actions need approval and the approver chain (F9.1 configurable per type).';

-- G.2 project_approval_requests — in-flight (Decision AT.4, AT.7, AT.8)
CREATE TABLE IF NOT EXISTS public.project_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.project_approval_workflows(id) ON DELETE SET NULL,
  trigger_action text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  snapshot_chain jsonb,                                                        -- AT.4 frozen chain
  current_step integer NOT NULL DEFAULT 0,
  is_emergency boolean NOT NULL DEFAULT false,                                 -- AT.7
  emergency_followup_due timestamptz,                                          -- AT.7 48h post-facto
  escalation_status text NOT NULL DEFAULT 'none'
    CHECK (escalation_status IN ('none', 'reminded', 'escalated')),            -- AT.8
  reminded_at timestamptz,
  escalated_at timestamptz,
  requested_by uuid REFERENCES public.profiles(id),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  decision_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_project ON public.project_approval_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.project_approval_requests(status);
COMMENT ON TABLE public.project_approval_requests IS
  'In-flight approvals with frozen snapshot chain (AT.4). is_emergency bypasses normal flow, requires post-facto approval within emergency_followup_due (AT.7). escalation_status reminded->escalated per AT.8 (24h/48h policy thresholds).';

-- ============================================================================
-- SECTION H — Templates — Decision F10.1
-- ============================================================================

-- H.1 project_templates — full blueprint (Decision F10.1)
CREATE TABLE IF NOT EXISTS public.project_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_type_id uuid REFERENCES public.project_types(id),
  blueprint jsonb NOT NULL DEFAULT '{}'::jsonb,                                -- structure+risks+budget+workflow
  source_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_templates_type ON public.project_templates(project_type_id);
COMMENT ON TABLE public.project_templates IS
  'Full project blueprint templates (F10.1): "Save as template" captures structure + risks + budget + stakeholders + workflow as a jsonb blueprint.';

-- projects.source_template_id FK (deferred — templates created after projects)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_source_template'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT fk_projects_source_template
      FOREIGN KEY (source_template_id) REFERENCES public.project_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- SECTION I — Cross-institution — Decision F11.1, F1.14
-- ============================================================================

-- I.1 project_institutions — junction (Decision F11.1)
CREATE TABLE IF NOT EXISTS public.project_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participating'
    CHECK (role IN ('lead', 'participating', 'equal')),                        -- F11.1 collaboration models
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT uq_project_institutions UNIQUE (project_id, institution_id)
);
CREATE INDEX IF NOT EXISTS idx_project_institutions_project ON public.project_institutions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_institutions_inst ON public.project_institutions(institution_id);
COMMENT ON TABLE public.project_institutions IS
  'Cross-institution project junction (F11.1): lead/participating/equal collaboration models. Populated when projects.scope_model=cross_institution.';

-- ============================================================================
-- SECTION J — Activity / Audit — Decision AT.16
-- ============================================================================

-- J.1 project_activity_feed — Slack-like stream (Decision AT.16)
CREATE TABLE IF NOT EXISTS public.project_activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL,                                                   -- task/risk/budget/...
  entity_id uuid,
  event_type text NOT NULL,                                                    -- created/updated/commented/...
  actor_id uuid REFERENCES public.profiles(id),
  summary text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_activity_feed_project ON public.project_activity_feed(project_id, created_at DESC);
COMMENT ON TABLE public.project_activity_feed IS
  'Full activity stream per project + global view (AT.16 Slack-like feed). Realtime channel for live dashboard (AT.15).';

-- J.2 project_audit_log — admin-only deep audit (Decision AT.16)
CREATE TABLE IF NOT EXISTS public.project_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,                                                        -- INSERT/UPDATE/DELETE
  old_values jsonb,
  new_values jsonb,
  actor_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_audit_log_project ON public.project_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_project_audit_log_record ON public.project_audit_log(table_name, record_id);
COMMENT ON TABLE public.project_audit_log IS
  'Admin-only deep audit log (AT.16): full old/new value capture for compliance.';

-- ============================================================================
-- SECTION K — Closure / Lessons — Decision F15.*
-- ============================================================================

-- K.1 project_closure_reports — PIR (Decision F15.1)
CREATE TABLE IF NOT EXISTS public.project_closure_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  closure_type text NOT NULL DEFAULT 'simple'
    CHECK (closure_type IN ('simple', 'full_pir')),                            -- F15.1
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome_summary text,
  impact_summary text,
  is_finalized boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  CONSTRAINT uq_project_closure_reports_project UNIQUE (project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_closure_reports_project ON public.project_closure_reports(project_id);
COMMENT ON TABLE public.project_closure_reports IS
  'Project closure / Post-Implementation Review (F15.1): simple mark-done or full PIR (checklist + lessons + impact).';

-- K.2 project_lessons_learned — cross-project searchable (Decision F15.2)
CREATE TABLE IF NOT EXISTS public.project_lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  closure_report_id uuid REFERENCES public.project_closure_reports(id) ON DELETE SET NULL,
  project_type_id uuid REFERENCES public.project_types(id),
  category text,                                                               -- what-went-well/what-to-improve
  lesson text NOT NULL,
  tags text[],                                                                 -- F15.2 AI-indexable
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_lessons_learned_type ON public.project_lessons_learned(project_type_id);
COMMENT ON TABLE public.project_lessons_learned IS
  'Cross-project searchable lessons (F15.2). project_type_id + tags enable AI-suggested lessons when creating similar new projects.';

-- ============================================================================
-- SECTION L — Integrations — Decisions F12.1, F14.1
-- ============================================================================

-- L.1 project_meeting_links — Fireflies meeting -> suggested tasks (Decision F12.1)
CREATE TABLE IF NOT EXISTS public.project_meeting_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  meeting_source text NOT NULL DEFAULT 'fireflies',
  external_meeting_id text,
  meeting_title text,
  meeting_date timestamptz,
  transcript_url text,
  suggested_tasks jsonb NOT NULL DEFAULT '[]'::jsonb,                          -- F12.1 AI suggestions
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_meeting_links_project ON public.project_meeting_links(project_id);
COMMENT ON TABLE public.project_meeting_links IS
  'Fireflies meeting -> suggested project tasks (F12.1). AI populates suggested_tasks; user confirms which become real tasks.';

-- L.2 project_change_requests — formal change management (Decision F14.1)
CREATE TABLE IF NOT EXISTS public.project_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  change_type text NOT NULL
    CHECK (change_type IN ('scope', 'timeline', 'budget', 'other')),           -- F14.1
  title text NOT NULL,
  description text,
  impact_summary text,
  is_major boolean NOT NULL DEFAULT false,                                     -- F14.1 policy threshold
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'implemented')),
  requested_by uuid REFERENCES public.profiles(id),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_project_change_requests_project ON public.project_change_requests(project_id);
COMMENT ON TABLE public.project_change_requests IS
  'Formal change requests (F14.1): scope/timeline/budget. is_major derived from configurable policy thresholds (pm.*).';

-- ============================================================================
-- SECTION M — RLS on all new tables
-- ============================================================================
-- Pattern: CRUDable masters + low-sensitivity tables = read open / write admin.
-- Project-scoped operational tables = read by any authenticated staff
-- (project-level visibility enforced in app + AT.10 confidential override),
-- write by authenticated staff. project_audit_log = admin read only.
-- This is the foundation substrate; finer per-project visibility (AT.10) is
-- layered by the service tier in later PRs.

DO $$
DECLARE
  master_tbl text;
  scoped_tbl text;
BEGIN
  -- Masters + low-sensitivity: read open, write admin
  FOR master_tbl IN
    SELECT unnest(ARRAY[
      'project_types', 'project_statuses', 'project_priorities',
      'project_labels', 'project_budget_categories',
      'project_approval_workflows', 'project_templates'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', master_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', master_tbl || '_select', master_tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true);',
      master_tbl || '_select', master_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', master_tbl || '_write', master_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      'USING (public.is_super_admin() OR public.is_admin()) '
      'WITH CHECK (public.is_super_admin() OR public.is_admin());',
      master_tbl || '_write', master_tbl);
  END LOOP;

  -- Project-scoped operational tables: read open to authenticated, write by authenticated
  FOR scoped_tbl IN
    SELECT unnest(ARRAY[
      'projects', 'project_phases', 'project_milestones',
      'project_tasks', 'project_task_subtasks', 'project_task_assignees',
      'project_task_dependencies', 'project_task_comments',
      'project_task_attachments', 'project_task_labels',
      'project_risks', 'project_issues', 'project_risk_mitigation_steps',
      'project_risk_escalations', 'project_members', 'project_budget',
      'project_budget_changes', 'project_stakeholders',
      'project_status_reports', 'project_approval_requests',
      'project_institutions', 'project_activity_feed',
      'project_closure_reports', 'project_lessons_learned',
      'project_meeting_links', 'project_change_requests'
    ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', scoped_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', scoped_tbl || '_select', scoped_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT '
      'USING (auth.uid() IS NOT NULL);',
      scoped_tbl || '_select', scoped_tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', scoped_tbl || '_write', scoped_tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      'USING (auth.uid() IS NOT NULL) '
      'WITH CHECK (auth.uid() IS NOT NULL);',
      scoped_tbl || '_write', scoped_tbl);
  END LOOP;

  -- Audit log: admin read only, no writes via RLS (written by service role / triggers)
  EXECUTE 'ALTER TABLE public.project_audit_log ENABLE ROW LEVEL SECURITY;';
  EXECUTE 'DROP POLICY IF EXISTS project_audit_log_select ON public.project_audit_log;';
  EXECUTE 'CREATE POLICY project_audit_log_select ON public.project_audit_log '
       || 'FOR SELECT USING (public.is_super_admin() OR public.is_admin());';
END $$;

-- ============================================================================
-- SECTION N — updated_at triggers
-- ============================================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'project_types', 'project_statuses', 'project_priorities',
      'project_labels', 'project_budget_categories',
      'projects', 'project_phases', 'project_milestones',
      'project_tasks', 'project_task_subtasks', 'project_task_comments',
      'project_risks', 'project_issues', 'project_risk_mitigation_steps',
      'project_members', 'project_budget', 'project_stakeholders',
      'project_status_reports', 'project_approval_workflows',
      'project_approval_requests', 'project_templates',
      'project_closure_reports', 'project_lessons_learned',
      'project_meeting_links', 'project_change_requests'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I; '
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- SECTION O — Seeds: CRUDable masters
-- ============================================================================

-- project_types (Decision AT.12 + unified okr_objective)
INSERT INTO public.project_types (key, name, description, closure_model, order_index, is_system)
VALUES
  ('general',            'General Project',     'Standard project',                                'simple',   10, true),
  ('accreditation_prep', 'Accreditation Prep',  'NAAC / regulatory accreditation preparation',     'full_pir', 20, true),
  ('infrastructure',     'Infrastructure',      'Building / facility / IT infrastructure project',  'full_pir', 30, true),
  ('curriculum',         'Curriculum',          'Curriculum design / revision project',             'simple',   40, true),
  ('operational',        'Operational',         'Operational improvement initiative',               'simple',   50, true),
  ('okr_objective',      'OKR Objective',       'Objective (unified model: key results = tasks)',   'simple',   60, true)
ON CONFLICT (key) DO NOTHING;

-- project_statuses (Decision AT.12, AT.5)
INSERT INTO public.project_statuses (key, name, category, order_index, is_system)
VALUES
  ('backlog',     'Backlog',      'backlog',   10, true),
  ('todo',        'To Do',        'active',    20, true),
  ('in_progress', 'In Progress',  'active',    30, true),
  ('review',      'Review',       'active',    40, true),
  ('done',        'Done',         'done',      50, true),
  ('cancelled',   'Cancelled',    'cancelled', 60, true),
  ('archived',    'Archived',     'archived',  70, true)
ON CONFLICT (key) DO NOTHING;

-- project_priorities (Decision AT.12)
INSERT INTO public.project_priorities (key, name, weight, order_index, is_system)
VALUES
  ('low',      'Low',      10, 10, true),
  ('medium',   'Medium',   20, 20, true),
  ('high',     'High',     30, 30, true),
  ('critical', 'Critical', 40, 40, true)
ON CONFLICT (key) DO NOTHING;

-- project_labels (generic starters)
INSERT INTO public.project_labels (key, name, is_system)
VALUES
  ('urgent',       'Urgent',        true),
  ('blocked',      'Blocked',       true),
  ('needs_review', 'Needs Review',  true),
  ('quick_win',    'Quick Win',     true)
ON CONFLICT (key) DO NOTHING;

-- project_budget_categories (generic starters)
INSERT INTO public.project_budget_categories (key, name, order_index, is_system)
VALUES
  ('equipment',  'Equipment',  10, true),
  ('travel',     'Travel',     20, true),
  ('consulting', 'Consulting', 30, true),
  ('materials',  'Materials',  40, true),
  ('other',      'Other',      50, true)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- SECTION P — Policy seeds (~20 pm.* rows) into platform_policies
-- ============================================================================
-- platform_policies shape (verified live): policy_key, scope_type, value jsonb,
--   description, data_type, classification, publication_state, is_system,
--   is_active, ui_widget, ui_category. NOT NULL: policy_key, scope_type, value,
--   data_type, classification, publication_state.
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, description, data_type, classification,
   publication_state, is_system, is_active, ui_widget, ui_category)
VALUES
  ('pm.approval_threshold_amount_inr', 'global', '50000'::jsonb,
   'Budget amount (INR) above which project/budget changes require formal approval',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.escalation_reminder_hours', 'global', '24'::jsonb,
   'Hours of no response before an approval/risk sends a reminder (AT.8)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.escalation_auto_hours', 'global', '48'::jsonb,
   'Hours of no response before an approval/risk auto-escalates up the chain (AT.8)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.budget_burn_rate_warning_pct', 'global', '80'::jsonb,
   'Percent of monthly budget target that triggers a burn-rate warning (F6.1)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.task_overdue_escalation_days', 'global', '3'::jsonb,
   'Days a task stays overdue before escalating to manager/Principal (F1.8)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.emergency_approval_followup_hours', 'global', '48'::jsonb,
   'Hours within which an emergency-bypassed approval must get post-facto approval (AT.7)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.change_request_major_budget_pct', 'global', '10'::jsonb,
   'Budget variance percent above which a change request is classified major (F14.1)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.change_request_major_timeline_days', 'global', '14'::jsonb,
   'Timeline slip in days above which a change request is classified major (F14.1)',
   'number', 'major', 'published', false, true, 'number', 'projects'),
  ('pm.status_report_auto_weekly', 'global', 'true'::jsonb,
   'Whether weekly status reports are auto-generated (AT.11)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.status_report_day_of_week', 'global', '"monday"'::jsonb,
   'Day of week auto status reports are generated',
   'string', 'operational', 'published', false, true, 'dropdown', 'projects'),
  ('pm.dashboard_realtime_enabled', 'global', 'true'::jsonb,
   'Whether the portfolio dashboard uses Supabase Realtime live updates (AT.15)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.default_project_visibility', 'global', '"institution"'::jsonb,
   'Default visibility for new projects (AT.10): public/institution/team/confidential',
   'string', 'major', 'published', false, true, 'dropdown', 'projects'),
  ('pm.allow_any_staff_create_project', 'global', 'true'::jsonb,
   'Whether any staff can create projects bottom-up (F1.3)',
   'boolean', 'major', 'published', false, true, 'toggle', 'projects'),
  ('pm.enforce_dependencies_default', 'global', 'false'::jsonb,
   'Default for whether task dependencies block progress (F1.9)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.allow_collaborators_default', 'global', 'true'::jsonb,
   'Default for whether tasks allow collaborators beyond the owner (F1.10)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.risk_auto_escalate_severity', 'global', '"high"'::jsonb,
   'Risk severity at/above which auto-escalation kicks in (F3.4)',
   'string', 'major', 'published', false, true, 'dropdown', 'projects'),
  ('pm.fireflies_integration_enabled', 'global', 'false'::jsonb,
   'Whether Fireflies meeting->task suggestion is enabled (F12.1)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.lessons_ai_suggestions_enabled', 'global', 'true'::jsonb,
   'Whether AI surfaces relevant past lessons when creating similar projects (F15.2)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.sprint_overlay_default', 'global', 'false'::jsonb,
   'Default for whether projects show the sprint/velocity overlay (F13.1)',
   'boolean', 'operational', 'published', false, true, 'toggle', 'projects'),
  ('pm.capacity_overload_threshold_pct', 'global', '100'::jsonb,
   'Percent allocation above which a person is flagged overloaded (F5.1)',
   'number', 'major', 'published', false, true, 'number', 'projects')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;

-- ============================================================================
-- SECTION Q — Storage buckets (private)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('pm-project-attachments', 'pm-project-attachments', false),
  ('pm-status-reports',      'pm-status-reports',      false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION R — Drop EMPTY okr_* tables (unified model)
-- ============================================================================
-- SPEC OVERRIDE: live row-count check (2026-05-28) found 4 NON-EMPTY okr_*
-- tables that this migration LEAVES INTACT (per the safety gate):
--   okr_auto_track_sources (6), okr_metric_cache (12),
--   okr_metric_execution_log (27), okr_metric_registry (12).
-- The 14 confirmed-empty tables below are dropped with CASCADE.
DROP TABLE IF EXISTS public.okr_attachments       CASCADE;
DROP TABLE IF EXISTS public.okr_check_ins         CASCADE;
DROP TABLE IF EXISTS public.okr_comments          CASCADE;
DROP TABLE IF EXISTS public.okr_compliance        CASCADE;
DROP TABLE IF EXISTS public.okr_dependencies      CASCADE;
DROP TABLE IF EXISTS public.okr_external_api_credentials CASCADE;
DROP TABLE IF EXISTS public.okr_key_results       CASCADE;
DROP TABLE IF EXISTS public.okr_kr_updates        CASCADE;
DROP TABLE IF EXISTS public.okr_milestones        CASCADE;
DROP TABLE IF EXISTS public.okr_objectives        CASCADE;
DROP TABLE IF EXISTS public.okr_reactions         CASCADE;
DROP TABLE IF EXISTS public.okr_risks             CASCADE;
DROP TABLE IF EXISTS public.okr_tasks             CASCADE;
DROP TABLE IF EXISTS public.okr_user_status       CASCADE;

-- ============================================================================
-- SECTION S — Verification
-- ============================================================================
DO $$
DECLARE
  v_project_tables int;
  v_okr_remaining int;
  v_policy_rows int;
  v_type_seeds int;
  v_status_seeds int;
  v_buckets int;
BEGIN
  SELECT count(*) INTO v_project_tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'project%';
  SELECT count(*) INTO v_okr_remaining
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'okr_%';
  SELECT count(*) INTO v_policy_rows
    FROM public.platform_policies WHERE policy_key LIKE 'pm.%';
  SELECT count(*) INTO v_type_seeds FROM public.project_types;
  SELECT count(*) INTO v_status_seeds FROM public.project_statuses;
  SELECT count(*) INTO v_buckets
    FROM storage.buckets WHERE id IN ('pm-project-attachments', 'pm-status-reports');

  RAISE NOTICE 'Projects foundation verified: % project* tables, % okr_* remaining (4 non-empty kept), % pm.* policies, % types, % statuses, % buckets',
    v_project_tables, v_okr_remaining, v_policy_rows, v_type_seeds, v_status_seeds, v_buckets;

  IF v_project_tables < 30 THEN
    RAISE EXCEPTION 'Expected >=30 project* tables, got %', v_project_tables;
  END IF;
  IF v_policy_rows < 20 THEN
    RAISE EXCEPTION 'Expected >=20 pm.* policies, got %', v_policy_rows;
  END IF;
  IF v_type_seeds < 6 THEN
    RAISE EXCEPTION 'Expected >=6 project_types, got %', v_type_seeds;
  END IF;
  IF v_buckets < 2 THEN
    RAISE EXCEPTION 'Expected 2 storage buckets, got %', v_buckets;
  END IF;
END $$;

COMMIT;
