# Work Pulse — Database Schemas (Live from Staging)

> Pulled from staging DB `hhprjbgknupaplivtoib` on 2026-03-30

## Tables

### wp_pulse_entries (14 columns)

Weekly Pulse responses — 2 questions per user per week.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| institution_id | uuid | NO | — | FK → institutions(id) |
| department_id | uuid | YES | — | FK → departments(id) |
| role | text | NO | — | User's role at submission time |
| week_of | date | NO | — | Monday of the week (UNIQUE with user_id) |
| talent_waste_category | text | NO | — | Q1 category dropdown |
| talent_waste_description | text | NO | — | Q1 free text (min 10 chars, CHECK constraint) |
| talent_waste_description_en | text | YES | — | English translation (if Tamil input) |
| repetition_category | text | NO | — | Q2 category dropdown |
| repetition_description | text | NO | — | Q2 free text (min 10 chars, CHECK constraint) |
| repetition_description_en | text | YES | — | English translation (if Tamil input) |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

**Constraint:** `UNIQUE(user_id, week_of)` — one entry per user per week (upsert on conflict).

### wp_patterns (20 columns)

AI-discovered automation opportunities.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| name | text | NO | — | Pattern name (e.g., "Multi-System Attendance Entry") |
| description | text | NO | — | What the repetitive work is |
| category | text | NO | — | Primary category from 11 options |
| source | wp_pattern_source | NO | 'pulse' | observer/pulse/both/user_request |
| people_affected | integer | NO | 0 | Unique reporter count |
| roles_affected | text[] | YES | '{}' | Array of role strings |
| departments_affected | uuid[] | YES | '{}' | Array of department UUIDs |
| hours_wasted_weekly | numeric(10,2) | YES | 0 | Estimated institution-wide |
| feasibility_score | integer | YES | — | 1-10 (CHECK constraint) |
| solution_type | wp_solution_type | YES | — | new_module/standalone_agent/process_change/training |
| impact_score | numeric(10,2) | YES | 0 | People × Hours × Feasibility / BuildEffort |
| tier | wp_pattern_tier | YES | 'C' | S(100+)/A(50-99)/B(20-49)/C(<20) |
| status | wp_pattern_status | YES | 'discovered' | discovered→classified→queued→building→deployed→measuring |
| jicate_product_candidate | boolean | YES | false | Sellable to other institutions? |
| first_detected_at | timestamptz | YES | now() | |
| last_analysis_at | timestamptz | YES | — | |
| analysis_metadata | jsonb | YES | '{}' | AI analysis details |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

### wp_micro_interviews (10 columns)

Targeted contextual questions sent to affected users.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| pattern_id | uuid | NO | — | FK → wp_patterns(id) ON DELETE CASCADE |
| user_id | uuid | NO | — | FK → profiles(id) ON DELETE CASCADE |
| question_text | text | NO | — | The specific contextual question |
| options | jsonb | NO | '[]' | Multiple choice options array |
| selected_option | text | YES | — | What user chose |
| free_text | text | YES | — | Optional "something else" text |
| sent_at | timestamptz | YES | now() | When notification was sent |
| responded_at | timestamptz | YES | — | NULL if pending |
| created_at | timestamptz | YES | now() | |

**Trigger:** `trg_wp_micro_interview_monthly_limit` (BEFORE INSERT) — prevents more than 1 interview per user per calendar month.

### wp_agent_impact (13 columns)

Post-deployment measurement of agents/solutions.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | PK |
| pattern_id | uuid | NO | — | FK → wp_patterns(id) ON DELETE CASCADE |
| agent_name | text | NO | — | Name of deployed agent/module/training |
| solution_type | wp_solution_type | NO | — | new_module/standalone_agent/process_change/training |
| deployed_at | timestamptz | NO | now() | |
| pre_hours_weekly | numeric(10,2) | YES | 0 | Hours wasted before deployment |
| post_hours_weekly | numeric(10,2) | YES | 0 | Hours wasted after (measured) |
| hours_saved_weekly | numeric(10,2) | YES | — | GENERATED ALWAYS AS (pre - post) STORED |
| people_using | integer | YES | 0 | Adoption count |
| is_jicate_product | boolean | YES | false | Packaged for external sale? |
| last_measured_at | timestamptz | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

## Custom Enum Types

| Enum | Values |
|------|--------|
| `wp_pattern_source` | observer, pulse, both, user_request |
| `wp_solution_type` | new_module, standalone_agent, process_change, training |
| `wp_pattern_tier` | S, A, B, C |
| `wp_pattern_status` | discovered, classified, queued, building, deployed, measuring |

## RLS Policies (13 total)

### wp_pulse_entries (4 policies)
| Policy | Command | Rule |
|--------|---------|------|
| wp_pulse_entries_insert_own | INSERT | user_id = auth.uid() |
| wp_pulse_entries_select_own | SELECT | user_id = auth.uid() |
| wp_pulse_entries_service_read | SELECT | auth.role() = 'service_role' |
| wp_pulse_entries_service_update | UPDATE | auth.role() = 'service_role' |

### wp_patterns (3 policies)
| Policy | Command | Rule |
|--------|---------|------|
| wp_patterns_read_all | SELECT | auth.uid() IS NOT NULL |
| wp_patterns_admin_write | ALL | super_admin or administrator |
| wp_patterns_service_write | ALL | service_role |

### wp_micro_interviews (3 policies)
| Policy | Command | Rule |
|--------|---------|------|
| wp_micro_select_own | SELECT | user_id = auth.uid() |
| wp_micro_update_own | UPDATE | user_id = auth.uid() |
| wp_micro_service_write | ALL | service_role |

### wp_agent_impact (3 policies)
| Policy | Command | Rule |
|--------|---------|------|
| wp_impact_read_all | SELECT | auth.uid() IS NOT NULL |
| wp_impact_admin_write | ALL | super_admin or administrator |
| wp_impact_service_write | ALL | service_role |

## Indexes (15 total, including PKs)

| Index | Table | Columns |
|-------|-------|---------|
| wp_pulse_entries_pkey | wp_pulse_entries | id |
| wp_pulse_entries_user_id_week_of_key | wp_pulse_entries | user_id, week_of (UNIQUE) |
| idx_wp_pulse_user_week | wp_pulse_entries | user_id, week_of DESC |
| idx_wp_pulse_institution_week | wp_pulse_entries | institution_id, week_of DESC |
| idx_wp_pulse_talent_category | wp_pulse_entries | talent_waste_category |
| idx_wp_pulse_repetition_category | wp_pulse_entries | repetition_category |
| wp_patterns_pkey | wp_patterns | id |
| idx_wp_patterns_tier_score | wp_patterns | tier, impact_score DESC |
| idx_wp_patterns_status | wp_patterns | status |
| idx_wp_patterns_solution | wp_patterns | solution_type |
| wp_micro_interviews_pkey | wp_micro_interviews | id |
| idx_wp_micro_user | wp_micro_interviews | user_id, responded_at |
| idx_wp_micro_pattern | wp_micro_interviews | pattern_id |
| wp_agent_impact_pkey | wp_agent_impact | id |
| idx_wp_impact_pattern | wp_agent_impact | pattern_id |

## Foreign Keys

| From | To | On Delete |
|------|----|-----------|
| wp_pulse_entries.user_id | profiles.id | CASCADE |
| wp_pulse_entries.institution_id | institutions.id | — |
| wp_pulse_entries.department_id | departments.id | — |
| wp_micro_interviews.pattern_id | wp_patterns.id | CASCADE |
| wp_micro_interviews.user_id | profiles.id | CASCADE |
| wp_agent_impact.pattern_id | wp_patterns.id | CASCADE |
