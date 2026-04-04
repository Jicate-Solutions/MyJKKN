# VAC Module — Database Schemas (Live from Staging)

**Source:** Supabase staging `hhprjbgknupaplivtoib`
**Pulled:** 2026-03-31

## vac_courses (93 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| code | character varying | NO |  |
| name | character varying | NO |  |
| description | text | YES |  |
| institution | character varying | NO |  |
| track | character varying | YES | 'general'::character varying |
| duration_hours | integer | NO | 30 |
| weeks | integer | NO | 3 |
| fee | numeric | NO | 500.00 |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| overall_finks_profile | jsonb | YES |  |
| ai_era_strategic_value | integer | YES |  |
| programme_id | uuid | YES |  |
| institution_id | uuid | YES |  |
| faculty_eligible | boolean | YES | false |
| course_category | text | YES | 'add_on'::text |
| nsqf_level | integer | YES |  |
| nheqf_level | integer | YES |  |
| ncrf_credits | numeric | YES |  |
| ncrf_credit_hours | integer | YES |  |

## vac_lessons (2746 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| course_id | uuid | NO |  |
| week | integer | NO |  |
| hour | integer | NO |  |
| title | character varying | NO |  |
| duration_minutes | integer | NO | 60 |
| prerequisites | text | YES |  |
| toolboxes | text | YES |  |
| learning_outcomes | jsonb | YES | '[]'::jsonb |
| faculty_script | jsonb | YES | '[]'::jsonb |
| student_content | jsonb | YES | '[]'::jsonb |
| exercises | jsonb | YES | '[]'::jsonb |
| gemini_prompts | jsonb | YES | '[]'::jsonb |
| error_troubleshooting | jsonb | YES | '[]'::jsonb |
| interview_questions | jsonb | YES | '[]'::jsonb |
| resources | jsonb | YES | '[]'::jsonb |
| self_check | jsonb | YES | '[]'::jsonb |
| is_published | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| ltl_phase | text | YES | 'learn'::text |

## vac_enrollments (7 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| course_id | uuid | NO |  |
| enrolled_at | timestamp with time zone | YES | now() |
| status | character varying | YES | 'active'::character varying |
| payment_status | character varying | YES | 'pending'::character varying |
| payment_amount | numeric | YES |  |
| payment_date | timestamp with time zone | YES |  |
| payment_reference | character varying | YES |  |
| completed_at | timestamp with time zone | YES |  |
| expires_at | timestamp with time zone | YES |  |
| notes | text | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## vac_learner_progress (69 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| course_id | uuid | NO |  |
| lesson_id | uuid | NO |  |
| status | character varying | NO | 'not_started'::character varying |
| completed_at | timestamp with time zone | YES |  |
| score | numeric | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## vac_course_programmes (86 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| course_id | uuid | NO |  |
| programme_id | uuid | NO |  |
| is_primary | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

## case_tracks (6 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| track_code | text | NO |  |
| track_name | text | NO |  |
| track_type | text | NO |  |
| sequence_order | integer | NO |  |
| prerequisite_track_id | uuid | YES |  |
| duration_hours | integer | NO | 30 |
| description | text | YES |  |
| completion_attendance_threshold | numeric | YES | 0.75 |
| completion_grader_threshold | numeric | YES | 0.80 |
| completion_project_required | boolean | YES | true |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## case_track_courses (91 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| track_id | uuid | NO |  |
| course_id | uuid | NO |  |
| programme_id | uuid | YES |  |
| institution_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| is_primary | boolean | YES | true |

## case_track_enrollments (6 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| track_id | uuid | NO |  |
| course_id | uuid | YES |  |
| batch_id | uuid | YES |  |
| enrolled_at | timestamp with time zone | YES | now() |
| status | text | YES | 'enrolled'::text |
| attendance_percentage | numeric | YES | 0 |
| grader_score_average | numeric | YES | 0 |
| project_submitted | boolean | YES | false |
| project_score | numeric | YES |  |
| completion_gate_attendance | boolean | YES | false |
| completion_gate_grader | boolean | YES | false |
| completion_gate_project | boolean | YES | false |
| completed_at | timestamp with time zone | YES |  |
| retry_count | integer | YES | 0 |
| previous_enrollment_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| placement_score | numeric | YES |  |
| placement_start_week | integer | YES | 1 |
| placement_taken_at | timestamp with time zone | YES |  |

## case_batches (0 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| track_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| batch_code | text | NO |  |
| delivery_format | text | YES | 'moderate'::text |
| start_date | date | NO |  |
| end_date | date | NO |  |
| schedule_json | jsonb | YES |  |
| max_capacity | integer | YES | 60 |
| current_enrollment | integer | YES | 0 |
| facilitator_id | uuid | YES |  |
| status | text | YES | 'draft'::text |
| is_auto_suggested | boolean | YES | false |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## case_learner_progress (0 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| programme_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| admission_semester | integer | NO | 1 |
| current_semester | integer | NO | 1 |
| tracks_completed | integer | YES | 0 |
| total_hours_completed | numeric | YES | 0 |
| graduation_ready | boolean | YES | false |
| estimated_exam_date | date | YES |  |
| risk_level | text | YES | 'on_track'::text |
| last_alert_sent_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| agency_index | numeric | YES | 0.0 |
| agency_dimensions | jsonb | YES |  |

## case_alerts (0 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| alert_type | text | NO |  |
| message | text | NO |  |
| sent_via | ARRAY | YES | ARRAY['push'::text] |
| sent_at | timestamp with time zone | YES | now() |
| read_at | timestamp with time zone | YES |  |
| coordinator_id | uuid | YES |  |

## case_graduation_requirements (94 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| programme_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| total_tracks_required | integer | YES | 6 |
| total_hours_required | integer | YES | 180 |
| programme_duration_semesters | integer | NO |  |
| enforcement_days_before_exam | integer | YES | 25 |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

## Views

### vac_enrollments_with_details
```sql
 SELECT e.id,
    e.user_id,
    e.course_id,
    e.enrolled_at,
    e.status,
    e.payment_status,
    e.payment_amount,
    e.payment_date,
    e.payment_reference,
    e.completed_at,
    e.expires_at,
    e.created_at,
    e.updated_at,
    c.code AS course_code,
    c.name AS course_name,
    c.institution AS course_institution,
    c.track AS course_track,
    c.duration_hours AS course_duration,
    c.fee AS course_fee,
    p.full_name AS user_name,
    p.email AS user_email
   FROM vac_
```

### case_risk_calculator
```sql
 SELECT clp.user_id,
    clp.programme_id,
    clp.institution_id,
    clp.current_semester,
    clp.tracks_completed,
    clp.graduation_ready,
    clp.estimated_exam_date,
    cgr.programme_duration_semesters,
    cgr.programme_duration_semesters - clp.current_semester AS semesters_remaining,
    6 - clp.tracks_completed AS tracks_remaining,
    ceil((6 - clp.tracks_completed)::numeric / GREATEST(cgr.programme_duration_semesters - clp.current_semester, 1)::numeric) AS tracks_per_semester_neede
```

### case_graduation_readiness
```sql
 SELECT i.name AS institution_name,
    p.program_name,
    clp.current_semester,
    count(*) AS total_learners,
    count(*) FILTER (WHERE clp.tracks_completed >= 6) AS graduation_ready_count,
    count(*) FILTER (WHERE clp.tracks_completed >= 6)::numeric / GREATEST(count(*), 1::bigint)::numeric * 100::numeric AS readiness_percentage,
    count(*) FILTER (WHERE rc.calculated_risk_level = 'at_risk'::text) AS at_risk_count,
    count(*) FILTER (WHERE rc.calculated_risk_level = 'critical'::text) 
```

## Functions

| Function | Returns |
|----------|--------|
| process_case_alerts() | void |
| check_case_track_prerequisite() | trigger |
| update_case_learner_progress() | trigger |
| get_vac_course_enrollment_stats() | record |
| is_enrolled_in_vac_course() | boolean |

## Cron Jobs

| Job | Schedule | Command |
|-----|----------|--------|
| case-daily-alerts | 30 1 * * * (7 AM IST) | SELECT process_case_alerts(); |
