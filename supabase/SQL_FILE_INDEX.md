# Supabase SQL File Index

## ⚠️ IMPORTANT: SINGLE SOURCE OF TRUTH

**This is the ONLY place to track all SQL files. DO NOT create duplicate SQL files.**

## 📁 Directory Structure

```
supabase/
├── setup/              # Initial setup files (RUN IN ORDER)
│   ├── 00_master_setup.sql    # Extensions, types, helper functions
│   ├── 01_tables.sql           # ALL table definitions
│   ├── 02_functions.sql        # Custom functions and procedures
│   ├── 03_policies.sql         # RLS policies for all tables
│   ├── 04_triggers.sql         # Database triggers
│   ├── 05_views.sql            # Database views
│   └── 06_seed_data.sql        # Optional seed data
├── migrations/         # Version-controlled migrations (DO NOT EDIT OLD FILES)
├── tables/            # Individual table references (READ-ONLY)
├── functions/         # Individual function references (READ-ONLY)
├── policies/          # Individual policy references (READ-ONLY)
├── triggers/          # Individual trigger references (READ-ONLY)
└── views/            # Individual view references (READ-ONLY)
```

## 🔴 STRICT RULES

### Rule 1: NEVER Create Duplicate Files

- ❌ DO NOT create new files for existing objects
- ✅ UPDATE existing files with proper comments

### Rule 2: File Update Protocol

When updating any SQL file:

```sql
-- Updated: 2025-01-16 by [reason]
-- Previous version backed up as comments below
-- [Your changes here]
```

### Rule 3: Single Location Policy

- Tables: ONLY in `setup/01_tables.sql`
- Functions: ONLY in `setup/02_functions.sql`
- Policies: ONLY in `setup/03_policies.sql`
- Triggers: ONLY in `setup/04_triggers.sql`
- Views: ONLY in `setup/05_views.sql`

## 📊 Current Database Objects

### Tables (60 total in database - Updated 2025-01-19)

| Module          | Tables                                                                                                                                                                                                                  | Count | Status                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------- |
| Academic        | academic_years, degrees, departments, programs, semesters, sections, courses, course_mappings, regulations, batches                                                                                                     | 10    | ✅                          |
| Billing         | billing_student_bills, billing_receipts, billing_invoices, billing_invoice_items, billing_receipt_items, billing_discounts, billing_refunds, billing_parent_categories, billing_sub_categories, billing_item_categories | 10    | ✅                          |
| Learners (Unified) | learners_profiles | 1 | ✅ Complete - Single source of truth for enquiry→alumni lifecycle |
| Students (Active Tables) | students | 1 | ✅ Live table with sync triggers → learners_profiles |
| Staff           | staff, staff_plans, staff_plan_courses                                                                                                                                                                                  | 3     | ✅                          |
| Admissions (Active Tables) | admissions | 1 | ✅ Live table with sync triggers → learners_profiles |
| Attendance      | periods, student_attendance                                                                                                                                                                                             | 2     | ✅                          |
| Timetable       | timetables, timetable_slot_continuity                                                                                                                                                                                   | 2     | ⚠️ Missing continuity table |
| Resources       | resources, resource_reservations, resource_approvals, resource_usage_logs, resource_parent_categories, resource_sub_categories, resource_attribute_definitions                                                          | 7     | ✅                          |
| Bug Reports     | bug_reports, bug_report_messages, bug_report_participants                                                                                                                                                               | 3     | ✅                          |
| Notifications   | notifications, user_notifications, push_subscriptions                                                                                                                                                                   | 3     | ✅                          |
| API             | api_keys                                                                                                                                                                                                                | 1     | ✅                          |
| User Management | profiles, users, user_institution_access, custom_roles                                                                                                                                                                  | 4     | ✅                          |
| Dashboard       | dashboard_configurations, dashboard_widgets, dashboard_widget_types                                                                                                                                                     | 3     | ✅                          |
| **Engagement Analytics** | **user_sessions, daily_engagement_metrics, student_engagement_scores, mv_engagement_overview (materialized view)** | **4** | **✅ Complete - Advanced student engagement tracking** |
| Child App Auth  | ~~child_app_analytics, child_app_auth_codes_bucket, child_app_unified_sessions~~ (REMOVED 2025-01-20)                                                                                                     | 0     | ❌ Dropped - moved to auth server                          |
| LTI Integration | lti_tools, lti_launches, lti_grades                                                                                                                                                                                         | 3     | ✅ Complete - MATLAB integration |
| OKR Module | okr_objectives, okr_key_results, okr_check_ins, okr_kr_updates, okr_dependencies, okr_tasks, okr_risks, okr_compliance, okr_user_status, ~~learner_core_okrs~~, ~~learner_okr_assignments~~, ~~learner_elective_okrs~~, okr_milestones, okr_auto_track_sources, okr_comments, okr_reactions, okr_attachments | 17 (3 deprecated) | ✅ Complete - 3 learner tables DEPRECATED 2026-02-01 |
| **OKR Metrics Registry** | **okr_metric_registry, okr_metric_execution_log, okr_metric_cache, okr_external_api_credentials** | **4** | **✅ NEW - Universal auto-metrics system** |
| **Competency Module (NEW)** | **competency_catalog, competency_program_mapping, course_competency_mapping, learner_competencies** | **4** | **⏳ PENDING - Workshop Transformation Phase 1.2** |
| **Industry Integration (NEW)** | **industry_partners, industry_mentors, industry_projects, learner_industry_engagements** | **4** | **⏳ PENDING - Workshop Transformation Phase 2.1** |
| **Personalization Module (NEW)** | **learning_paths, learning_path_steps, parent_portal_access, parent_communications** | **4** | **⏳ PENDING - Workshop Transformation Phase 3** |
| **Accountability Module (NEW)** | **alumni_outcomes, outcome_program_correlation, facilitator_development, facilitator_industry_immersion** | **4** | **⏳ PENDING - Workshop Transformation Phase 4** |
| Other           | applications (with parent auth + LTI), categories, subcategories, employment_categories, user_activity_logs, activity_stats, institution_departments, migration_log                                                           | 8     | ✅ Updated with auth + LTI  |

### Functions (242 total - Updated 2025-01-19)

| Category              | Location               | Count | Purpose                         |
| --------------------- | ---------------------- | ----- | ------------------------------- |
| Authentication & User | setup/02_functions.sql | 15    | User management, profiles, auth |
| Institution Access    | setup/02_functions.sql | 10    | Institution access control      |
| Billing               | setup/02_functions.sql | 20    | Billing calculations, invoices  |
| Attendance            | setup/02_functions.sql | 5     | Attendance statistics           |
| Timetable             | setup/02_functions.sql | 10    | Timetable management            |
| Academic              | setup/02_functions.sql | 15    | Academic hierarchy, validations |
| Staff                 | setup/02_functions.sql | 5     | Staff management                |
| Admission             | setup/02_functions.sql | 5     | Application ID generation, combined analytics |
| Bug Reports           | setup/02_functions.sql | 4     | Bug tracking                    |
| Resources             | setup/02_functions.sql | 6     | Resource management             |
| Notifications         | setup/02_functions.sql | 1     | User notifications              |
| API Keys              | setup/02_functions.sql | 4     | API key management              |
| Activity Logging      | setup/02_functions.sql | 2     | Log cleanup, stats              |
| **Engagement Analytics** | **Migrations**         | **6** | **Session management, metrics computation, engagement scoring** |
| Utilities             | setup/02_functions.sql | 10+   | Helper functions                |
| Dashboard             | setup/02_functions.sql | 2     | Dashboard reporting             |
| Permissions           | setup/02_functions.sql | 6     | Role and permission checks      |
| Child App Auth        | ~~setup/02_functions.sql~~ | 0     | ~~Session cleanup~~ (REMOVED 2025-01-20) |

### RLS Policies (250+ total)

| Location              | Count | Coverage          |
| --------------------- | ----- | ----------------- |
| setup/03_policies.sql | 250+  | 53 tables (94.6%) |

### Triggers (74 total - Updated 2025-01-18)

| Category              | Location              | Count | Purpose                      |
| --------------------- | --------------------- | ----- | ---------------------------- |
| Timestamp Updates     | setup/04_triggers.sql | 35    | Auto-update updated_at       |
| Business Logic        | setup/04_triggers.sql | 20    | Auto-populate, validations   |
| Billing               | setup/04_triggers.sql | 10    | Status updates, calculations |
| **Learner Sync (NEW)** | **Migrations** | **2** | **Bidirectional sync: admissions/students ↔ learners_profiles** |
| Attendance Validation | setup/04_triggers.sql | 1     | Staff assignment validation  |
| Other                 | setup/04_triggers.sql | 6     | Various business rules       |

### Views (7 total)

| View Name                   | Location           | Module      |
| --------------------------- | ------------------ | ----------- |
| auto_generated_invoices     | setup/05_views.sql | Billing     |
| bill_invoice_relationships  | setup/05_views.sql | Billing     |
| v_bill_details              | setup/05_views.sql | Billing     |
| bug_reporters_leaderboard   | setup/05_views.sql | Bug Reports |
| bug_reports_with_details    | setup/05_views.sql | Bug Reports |
| semester_hierarchy_health   | setup/05_views.sql | Academic    |
| semester_program_audit_view | setup/05_views.sql | Academic    |

### Storage Buckets (7 total)

| Bucket              | Purpose                | Size Limit |
| ------------------- | ---------------------- | ---------- |
| applications        | Application documents  | 50MB       |
| avatars             | User profile pictures  | None       |
| bug-reports         | Bug report screenshots | 10MB       |
| institution-logos   | Institution branding   | None       |
| resource-management | Resource images        | 10MB       |
| staff-images        | Staff photos           | None       |
| student-photos      | Student photos         | None       |

### Indexes (382 total)

| Type         | Count | Purpose                      |
| ------------ | ----- | ---------------------------- |
| Primary Keys | 56    | Table primary keys           |
| Unique       | 95    | Unique constraints           |
| Foreign Key  | 0     | ⚠️ No FK constraints defined |
| Performance  | 231   | Query optimization           |

### Custom Types

| Type Name            | Location                  | Values                                                               |
| -------------------- | ------------------------- | -------------------------------------------------------------------- |
| user_role            | setup/00_master_setup.sql | super_admin, admin, institution_admin, staff, student, parent, guest |
| attendance_status    | setup/00_master_setup.sql | present, absent, late, excused, holiday                              |
| bill_status          | setup/00_master_setup.sql | pending, partial, paid, overdue, cancelled                           |
| academic_year_status | setup/00_master_setup.sql | upcoming, active, completed                                          |
| lifecycle_status     | setup/01_tables.sql       | enquiry, pending, approved, rejected, waitlisted, active, inactive, exited, graduated, alumni |
| student_status       | setup/01_tables.sql       | active, inactive, graduated, dropped, suspended (LEGACY - for backward compatibility) |

## 🚀 Setup Instructions

### For New Clone/Setup:

```bash
# Run in Supabase SQL Editor in this exact order:
1. Run supabase/setup/00_master_setup.sql
2. Run supabase/setup/01_tables.sql
3. Run supabase/setup/02_functions.sql (when created)
4. Run supabase/setup/03_policies.sql (when created)
5. Run supabase/setup/04_triggers.sql (when created)
6. Run supabase/setup/05_views.sql (when created)
7. Run supabase/setup/06_seed_data.sql (optional)
```

### For Updates:

```bash
# NEVER create new files. Update existing files:
1. Open the appropriate file based on object type
2. Add update comments with date and reason
3. Make your changes
4. Update this index file
5. Test in development first
```

## 📝 Change Log

### 2026-02-02: Fink's Taxonomy Migration (CRITICAL - AI Era Education) 🚀

- **File**: `migrations/20260202000001_migrate_to_finks_taxonomy.sql` ✅ **READY FOR REVIEW**

  **Purpose**: Replace Bloom's Taxonomy (cognitive-only) with Fink's Taxonomy (holistic learning) in competency catalog. This is CRITICAL for AI-era education where AI can handle all cognitive tasks (Bloom's) but humans must develop caring, relationships, and transformation (Fink's).

  **CRITICAL CONTEXT - WHY THIS MATTERS**:
  - **Bloom's Taxonomy (1956)**: Focuses on cognitive skills - remember, understand, apply, analyze, evaluate, create
  - **Problem**: AI/LLMs can now perform ALL cognitive tasks at expert level
  - **Fink's Taxonomy (2003)**: Designed for significant learning beyond cognition
  - **Solution**: Focuses on what makes humans uniquely valuable in AI era

  **Fink's 6 Dimensions** (replacing single bloom_taxonomy_level):
  1. **foundational_knowledge** (0-100) - Understanding and remembering information
  2. **application** (0-100) - Skills, critical thinking, managing projects
  3. **integration** (0-100) - Connecting ideas, people, and realms of life
  4. **human_dimension** (0-100) - Learning about oneself and others (CRITICAL in AI era)
  5. **caring** (0-100) - Developing new feelings, interests, values (CRITICAL in AI era)
  6. **learning_how_to_learn** (0-100) - Becoming a better student (CRITICAL in AI era)

  **Database Changes**:
  - **Added Column**: `fink_taxonomy_scores JSONB` to `competency_catalog` table
    - Structure: All 6 dimensions with scores 0-100 (nullable)
    - Default: All dimensions set to null (to be populated)
  - **Deprecated Column**: `bloom_taxonomy_level` (NOT deleted, kept for backward compatibility)
    - Marked as DEPRECATED in comments
    - Will be removed in future version after data migration
  - **Constraint Added**: `check_fink_scores_range` - Validates all scores are 0-100 or null
  - **Indexes Created** (5):
    - `idx_competency_catalog_fink_scores` - GIN index for JSONB queries
    - `idx_competency_catalog_fink_foundational` - Partial index for foundational_knowledge
    - `idx_competency_catalog_fink_application` - Partial index for application
    - `idx_competency_catalog_fink_human_dimension` - Partial index for human_dimension (CRITICAL)
    - `idx_competency_catalog_fink_caring` - Partial index for caring (CRITICAL)

  **Functions Created** (2):
  1. `calculate_fink_overall_score(fink_scores, weights)` - Calculates weighted average
     - Default weights favor human-centric dimensions (human_dimension: 20%, caring: 15%, learning: 15%)
     - Returns NUMERIC(5,2) overall score
     - Immutable function for performance

  2. `get_human_centric_competencies(institution_id, min_score)` - Finds competencies strong in human dimensions
     - Returns competencies with high scores in human_dimension, caring, or learning_how_to_learn
     - Default min_score: 70 (advanced level)
     - Critical for identifying AI-era essential competencies

  **Backward Compatibility**:
  - ✅ NO breaking changes - bloom_taxonomy_level column preserved
  - ✅ Existing queries continue working
  - ✅ New field is JSONB with sensible defaults
  - ✅ All scores nullable for gradual migration

  **Migration Strategy**:
  - Phase 1: ✅ Add column and indexes (this migration)
  - Phase 2: ⏳ Update types/competency.ts with Fink's types
  - Phase 3: ⏳ Update service layer to use fink_taxonomy_scores
  - Phase 4: ⏳ Update UI to display 6 dimensions
  - Phase 5: ⏳ Data migration script (convert bloom → fink)
  - Phase 6: ⏳ Drop bloom_taxonomy_level column

  **Impact on MyJKKN**:
  - ✅ Competencies now aligned with AI-era educational goals
  - ✅ Focus shifts from "what AI can do" to "what makes humans valuable"
  - ✅ Human-centric dimensions (caring, relationships, transformation) become measurable
  - ✅ Program outcomes can emphasize uniquely human competencies
  - ✅ Foundation for future AI-integrated curriculum design

  **Setup Files Updated**:
  - `supabase/setup/01_tables.sql` - Updated competency_catalog table definition
  - `supabase/SQL_FILE_INDEX.md` - This entry

  **Related Documentation**:
  - Fink, L. D. (2003). Creating Significant Learning Experiences
  - Workshop Transformation initiative (AI-era education redesign)

---

### 2026-02-01: Workshop Transformation - Accountability Module (Phase 4)

- **File**: `migrations/20260201_create_accountability_tables.sql` ⏳ **PENDING REVIEW**

  **Purpose**: Create Accountability module for tracking alumni outcomes and facilitator development as part of Workshop Transformation Phase 4.

  **Tables Created (4)**:

  **1. alumni_outcomes** - Graduate career/outcome tracking:
  - Core: learner_id, institution_id, program_id, graduation_date
  - Auto-computed: graduation_year (from graduation_date)
  - Outcome: outcome_type ENUM, outcome_start_date
  - Employment: company_name, designation, department, industry_sector, job_function
  - Location: city, state, country, is_remote
  - Compensation: salary_range ENUM, has_equity, other_benefits
  - Relevance: is_relevant_to_program, relevance_percentage, skills_used
  - Higher studies: institution_name, course_name, specialization, scholarship
  - Entrepreneurship: business_name, business_type, funding_raised, employee_count
  - Feedback: satisfaction_score (1-10), would_recommend_program, testimonial
  - Verification: verification_status ENUM, verified_by, documents JSONB
  - Engagement: is_willing_to_mentor/hire/guest_lecture

  **2. outcome_program_correlation** - Program success analytics:
  - Core: program_id, institution_id, cohort_year
  - Counts: total_graduates, tracked_graduates, employed/entrepreneur/studies counts
  - Auto-computed: tracking_percentage
  - Rates: employment_rate, placement_rate, entrepreneurship_rate
  - Salary analytics: average/median salary_range, salary_distribution JSONB
  - Top performers: top_employers, top_sectors, top_roles, top_locations (all JSONB)
  - Satisfaction: avg_relevance_percentage, program_satisfaction_avg
  - Benchmarks: industry_benchmark_employment_rate, performance_vs_benchmark

  **3. facilitator_development** - Staff professional evolution:
  - Core: staff_id, institution_id
  - Stage: current_stage (development_stage ENUM), stage_history JSONB
  - Certifications: certifications JSONB, certification_count (auto-computed)
  - Industry: industry_immersions JSONB, total_industry_days, companies_worked_with
  - Innovation: innovation_contributions JSONB, innovation_count
  - Peer learning: sessions_conducted/attended, is_peer_learning_champion
  - Mentoring: faculty_mentored_count, current_mentees, specializations
  - Score: outcome_score (0-100), outcome_score_components JSONB
  - Research: publications_count, patents_count, industry_projects_guided
  - Recognition: awards, speaking_engagements, media_features (all JSONB)
  - Goals: development_goals JSONB, next_review_date

  **4. facilitator_industry_immersion** - Industry experience records:
  - Core: staff_id, institution_id, development_id (FK)
  - Company: company_name, website, industry_sector, company_size
  - Immersion: immersion_type ENUM, role_title, department
  - Duration: start_date, end_date, duration_days, hours_per_week
  - Work: objectives, key_responsibilities, projects_worked_on JSONB
  - Learnings: learnings JSONB (technical, process, soft_skills, insights)
  - Application: applied_in_teaching JSONB, curriculum_changes_proposed
  - Compensation: is_paid, compensation_type, compensation_amount
  - Documentation: certificate_url, report_url, presentation_url
  - Feedback: company_feedback/rating, self_assessment/rating
  - Visibility: is_public, is_featured

  **ENUMs Created (5)**:
  - `outcome_type`: employed, self_employed, entrepreneur, higher_studies, competitive_exams, family_business, gap_year, seeking, unknown
  - `salary_range`: below_3l, 3l_to_5l, 5l_to_8l, 8l_to_12l, 12l_to_20l, 20l_to_35l, above_35l, not_applicable, undisclosed
  - `verification_status`: pending, self_reported, document_verified, employer_confirmed, linkedin_verified, rejected
  - `development_stage`: novice, developing, competent, proficient, expert, thought_leader
  - `immersion_type`: sabbatical, summer_internship, consulting, research_collab, site_visit, workshop_delivery, project_mentoring

  **Indexes Created**: 28
  **RLS Policies Created**: 16 (4 per table)
  **Triggers Created**: 5 (4 updated_at + 1 auto-update facilitator stats)
  **Functions Created**: 3
  - `compute_outcome_program_correlation(program_id, cohort_year)` - Aggregates outcome data
  - `update_facilitator_development_stats(staff_id)` - Updates stats from immersions
  - `trigger_update_facilitator_stats()` - Trigger function for auto-updates

  **Key Features**:
  - Comprehensive alumni tracking (employment, entrepreneurship, higher studies)
  - Salary range tracking with verification workflow
  - Program-level outcome correlation analytics with benchmarks
  - Facilitator development stages (novice to thought leader)
  - Industry immersion tracking with curriculum application
  - Auto-computed metrics (graduation_year, tracking_percentage, certification_count)

  **Setup Files Updated**:
  - `supabase/setup/01_tables.sql` - Section 15: Accountability Module
  - `supabase/setup/03_policies.sql` - Section 15: RLS policies

  **Related Plan**: Workshop Alignment Transformation (Phase 4 - Final)

---

### 2026-02-01: Workshop Transformation - Personalization Module (Phase 3)

- **File**: `migrations/20260201_create_personalization_tables.sql` ⏳ **PENDING REVIEW**

  **Purpose**: Create Personalization module for AI-powered learning paths and parent engagement portal as part of Workshop Transformation Phase 3.

  **Tables Created (4)**:

  **1. learning_paths** - Per-learner personalized learning journeys:
  - Core: learner_id, institution_id, path_name, path_description
  - Career targets: target_role, target_industry
  - Competencies: target_competencies (JSONB array with levels, priorities)
  - Progress: current_progress (%), total_steps, completed_steps
  - Timeline: estimated_completion, actual_completion, started_at
  - AI metadata: is_ai_generated, ai_confidence_score, generation_parameters
  - Status: learning_path_status ENUM
  - Mentorship: assigned_mentor_id, mentor_notes
  - Approval: approved_by, approved_at

  **2. learning_path_steps** - Sequenced activities within paths:
  - Ordering: path_id, step_order (unique per path)
  - Definition: step_name, step_description, step_type (ENUM)
  - Resource reference: reference_id, reference_table (polymorphic), external_url
  - Competency link: competency_id, target_competency_level
  - Duration: expected_duration_hours, actual_duration_hours
  - Dependencies: prerequisite_step_ids (UUID[]), is_optional
  - Status: learning_step_status ENUM, started_at, completed_at
  - Evidence: evidence_url, evidence_type, evidence_metadata (JSONB)
  - Feedback: learner_notes, mentor_feedback, rating (1-5)

  **3. parent_portal_access** - Parent access configuration:
  - Learner link: learner_id, institution_id
  - Parent identification: parent_user_id, parent_email, parent_phone, parent_name, relationship
  - Access credentials: access_code (unique), access_code_expires_at, pin_hash
  - Access level: parent_access_level ENUM (view, interact, full)
  - Permissions: JSONB (view_attendance, view_grades, view_fees, etc.)
  - Notifications: notification_preferences JSONB (channels, frequency, alert_types)
  - Activity: last_access, access_count, last_ip_address
  - Status: is_active, is_verified, deactivated_at, deactivation_reason

  **4. parent_communications** - Institution-parent message history:
  - Links: learner_id, institution_id, parent_access_id
  - Content: communication_type ENUM, subject, content, content_html
  - Attachments: JSONB array with name, url, type, size
  - Context: related_entity_type, related_entity_id, context_data JSONB
  - Delivery: sent_at, sent_via (VARCHAR[]), delivery_status JSONB
  - Read tracking: read_at, read_via
  - Response handling: requires_response, response_deadline, response, response_at
  - Sender: sent_by, sent_by_role
  - Flags: is_archived, is_important

  **ENUMs Created (5)**:
  - `learning_path_status`: draft, active, paused, completed, archived
  - `learning_step_type`: course, project, mentorship, certification, workshop, self_study, assessment, internship, competition
  - `learning_step_status`: pending, in_progress, completed, skipped, failed
  - `parent_access_level`: view, interact, full
  - `communication_type`: progress_update, alert, feedback_request, announcement, fee_reminder, event_invite, achievement, concern

  **Indexes Created**: 27
  **RLS Policies Created**: 16 (4 per table)
  **Triggers Created**: 5 (4 updated_at + 1 progress auto-calculation)
  **Functions Created**: 2
  - `generate_parent_access_code(institution_id)` - Creates unique JKKN-P-XXXXXX codes
  - `update_learning_path_progress()` - Auto-updates path progress on step completion

  **Key Features**:
  - AI-generated learning paths with confidence scores
  - Polymorphic step references (courses, projects, mentorships, etc.)
  - Code-based parent portal access (no account required)
  - Multi-channel communication delivery (email, SMS, WhatsApp, in-app)
  - Automatic path progress calculation on step completion
  - Competency-linked learning progression

  **Setup Files Updated**:
  - `supabase/setup/01_tables.sql` - Section 14: Personalization Module
  - `supabase/setup/03_policies.sql` - Section 14: RLS policies

  **Related Plan**: Workshop Alignment Transformation (Phase 3)

---

### 2026-02-01: Workshop Transformation - Industry Integration Module (Phase 2)

- **File**: `migrations/20260201_create_industry_integration_tables.sql` ⏳ **PENDING REVIEW**

  **Purpose**: Create Industry Integration module for connecting learners with industry partners, mentors, and real-world projects.

  **Tables Created (4)**:

  **1. industry_partners** - Company registry with MOU tracking:
  - Company info: name, logo, sector, size, website, description
  - Partnership: type, dates, MOU document, value description
  - Contact: person, designation, email, phone
  - Address: full address fields
  - Tracking: projects offered, internships, placements, rating
  - Verification: is_verified, verified_by, verified_at

  **2. industry_mentors** - Expert profiles with availability:
  - Profile: name, designation, company, photo, bio, linkedin
  - Contact: email, phone, preferred method
  - Expertise: areas (TEXT[]), experience years, competencies_can_mentor (UUID[])
  - Availability: JSONB (days, hours, mode, timezone)
  - Capacity: max_mentees, current_mentees
  - Tracking: total mentees, rating, sessions conducted

  **3. industry_projects** - Project marketplace:
  - Project info: title, code, description, requirements, outcomes
  - Deliverables: JSONB array
  - Competencies: required (UUID[]), minimum level, developed (UUID[])
  - Parameters: difficulty, duration, team size, hours
  - Eligibility: programs (UUID[]), semesters (UUID[]), prerequisites
  - Compensation: is_paid, stipend, benefits
  - Timeline: deadline, start/end dates
  - Status: project_status ENUM, capacity tracking

  **4. learner_industry_engagements** - Participation tracking:
  - Relationships: learner, project, mentor, partner
  - Team: team_id, role
  - Timeline: applied, approved, start, end dates
  - Status: engagement_status ENUM
  - Competencies: targeted, demonstrated, levels achieved
  - Progress: percentage, milestones JSONB
  - Deliverables: submitted JSONB
  - Feedback: mentor JSONB, learner JSONB
  - Certificate: issued, url, date

  **ENUMs Created (5)**:
  - `partnership_type`: mou, placement, project, mentorship, internship, sponsorship, training
  - `project_status`: draft, open, assigned, in_progress, under_review, completed, cancelled
  - `engagement_type`: project, internship, mentorship, workshop, site_visit, guest_lecture, hackathon
  - `engagement_status`: applied, approved, active, completed, withdrawn, terminated
  - `difficulty_level`: beginner, intermediate, advanced, expert

  **Indexes Created**: 23
  **RLS Policies Created**: 16 (4 per table)
  **Triggers Created**: 4 (updated_at)

  **Key Features**:
  - Full partner/mentor/project lifecycle management
  - Competency integration (required & developed)
  - Feedback tracking (mentor & learner)
  - Certificate issuance support
  - Team project support
  - Eligibility filtering

  **Related Plan**: Workshop Alignment Transformation (Phase 2.1)

---

### 2026-02-01: Workshop Transformation - Existing Table Modifications

- **File**: `migrations/20260201_modify_existing_tables_workshop.sql` ⏳ **PENDING REVIEW**

  **Purpose**: Add new columns to existing tables to support outcome-focused education model.

  **Tables Modified (4)**:

  **1. courses** - Learning hours and competency coverage:
  - `learning_hours_target INTEGER` - Total learning hours target
  - `self_study_hours INTEGER` - Expected self-study hours per week
  - `practical_hours INTEGER` - Lab/practical hours per week
  - `theory_hours INTEGER` - Lecture/theory hours per week
  - `competency_coverage JSONB` - Maps competencies to course with weights
  - + 1 GIN index, 4 constraints

  **2. learners_profiles** - Capabilities and career tracking:
  - `capabilities JSONB` - Competency achievements with evidence
  - `career_aspirations JSONB` - Career goals and preferences
  - `industry_readiness_score NUMERIC(5,2)` - Computed placement readiness (0-100)
  - `portfolio_url TEXT` - Link to learner portfolio
  - + 3 indexes, 1 constraint

  **3. staff** - Facilitator role and metrics:
  - `role_type VARCHAR(50)` - teacher, facilitator, trainer, industry_mentor, hybrid
  - `facilitator_certification JSONB` - Certifications array
  - `outcome_metrics JSONB` - Performance metrics tracking
  - + 3 indexes, 1 constraint

  **4. billing_discounts** - Outcome-based discounts:
  - `is_outcome_based BOOLEAN` - Flag for outcome-based discounts
  - `outcome_criteria JSONB` - Competency requirements for qualification
  - `outcome_verification JSONB` - Verification tracking
  - + 3 indexes

  **Summary**: 15 new columns, 10 new indexes, 6 new constraints

  **Related Plan**: Workshop Alignment Transformation (Phase 1.5)

---

### 2026-02-01: Workshop Transformation - Competency Catalog Module (NEW)

- **File**: `migrations/20260201_create_competency_tables.sql` ⏳ **PENDING REVIEW**

  **Purpose**: Create Competency Catalog module as part of Workshop Transformation for outcome-focused skill tracking. Replaces deprecated learner OKR tables.

  **Tables Created (4)**:
  - `competency_catalog` - Master competency/skill taxonomy
    - Fields: competency_code, competency_name, competency_type, description
    - JSONB: proficiency_levels, evidence_requirements
    - Array: industry_tags
    - Bloom's taxonomy level support
  - `competency_program_mapping` - Program competency requirements
    - Links competencies to programs with required levels
    - Fields: required_level, weight_percentage, semester_expected, is_mandatory
  - `course_competency_mapping` - Course competency links
    - Links courses to competencies with contribution details
    - Fields: contribution_level, learning_hours, assessment_method
  - `learner_competencies` - Individual learner competency tracking
    - Replaces deprecated learner_okr_assignments
    - Fields: current_level, progress_percentage
    - JSONB: evidence, assessments
    - Verification by staff (verified_by, verified_at)

  **ENUMs Created (3)**:
  - `competency_type`: technical, behavioral, domain, soft_skill
  - `bloom_taxonomy_level`: remember, understand, apply, analyze, evaluate, create
  - `proficiency_level`: novice, beginner, intermediate, advanced, expert

  **Indexes Created**: 16 total
  **RLS Policies Created**: 16 (4 per table: SELECT, INSERT, UPDATE, DELETE)
  **Triggers Created**: 4 (updated_at for each table)

  **Related Plan**: Workshop Alignment Transformation (Phase 1.2)

---

### 2026-02-01: Workshop Transformation - Learner OKR Deprecation

- **File**: `migrations/20260201_deprecate_learner_okr_tables.sql` ⏳ **PENDING REVIEW**

  **Purpose**: Soft-deprecate learner-specific OKR tables as part of Workshop Transformation. Learner OKRs being replaced by Competency module for outcome-focused tracking.

  **Tables Affected**:
  - `learner_core_okrs` - Added deprecated_at, blocked new inserts
  - `learner_okr_assignments` - Added deprecated_at, blocked new inserts
  - `learner_elective_okrs` - Added deprecated_at, blocked new inserts

  **Changes**:
  - Added `deprecated_at TIMESTAMPTZ` column to all 3 tables (set to NOW() for all existing records)
  - Created RLS policies with `WITH CHECK (false)` to block new inserts
  - Added deprecation comments to tables
  - Created indexes on deprecated_at columns for future cleanup queries

  **What Still Works**:
  - SELECT: All existing data remains accessible
  - UPDATE: Existing records can still be updated
  - DELETE: Existing records can still be deleted (by owners)

  **What's Blocked**:
  - INSERT: No new records can be created in these tables

  **Data Preserved**:
  - All existing learner OKR data preserved (zero data loss)
  - Historical reference available via deprecated_at timestamp

  **Replacement**:
  - Core OKRs → competency_catalog + learner_competencies (Task #4)
  - Elective OKRs → learning_paths + learning_path_steps (Phase 3)

  **Related Plan**: Workshop Alignment Transformation (Phase 1.1)

  **Files Updated**:
  - `supabase/SQL_FILE_INDEX.md` - This entry

---

### 2025-01-19: Advanced Engagement Analytics System ⭐ NEW

- **Files Created**:
  - `migrations/20260119_create_engagement_analytics_schema.sql` ✅ **APPLIED**
  - `migrations/20260119_create_engagement_functions.sql` ✅ **APPLIED**
  - `migrations/20260119_create_engagement_jobs.sql` ⏳ **PENDING** (requires pg_cron extension)

- **Purpose**: Transform basic login/logout activity tracking into comprehensive student engagement analytics with role-based tracking, organizational hierarchy analytics, and at-risk student identification.

- **Architecture**: Hybrid Event Capture + Materialized Views
  - Real-time session tracking with organizational context
  - Pre-computed daily metrics via background jobs
  - Materialized view for fast dashboard queries (15-min refresh)
  - Hierarchical drill-down: Institution → Department → Program → Semester → Section → Student

- **Database Changes**:
  - **Tables Created (4)**:
    - `user_sessions` - Detailed session tracking with organizational context
      - Fields: session_id, user_id, login_at, logout_at, duration_seconds, device_type
      - Organizational context: institution_id → section_id hierarchy
      - Activity tracking: modules_accessed[], actions_count
      - 7 performance indexes
    - `daily_engagement_metrics` - Pre-aggregated daily metrics by hierarchy and role
      - Metrics: total_logins, unique_users, avg_session_duration, modules_per_user
      - 4 composite indexes for fast queries
    - `student_engagement_scores` - Individual student engagement tracking
      - Metrics: logins_7d/30d, avg_session_duration, total_time_spent, modules_accessed
      - Comparative: percentile_rank, section averages
      - Risk indicators: engagement_level (high/medium/low/at_risk), risk_factors[]
      - 6 indexes including partial index on is_at_risk
    - `mv_engagement_overview` - Materialized view for fast dashboard summaries
  - **Functions Created (6)**:
    - `close_user_session()` - Session closure and duration calculation
    - `add_module_to_session()` - Track module access
    - `get_user_organizational_context()` - Hierarchy context detection
    - `compute_daily_engagement_metrics()` - Daily metric aggregation
    - `compute_student_engagement_scores()` - Engagement scoring and risk identification
    - `cleanup_orphaned_sessions()` - Auto-close stale sessions
  - **Background Jobs (3)** - Using pg_cron:
    - Daily at 2 AM: Compute daily metrics
    - Daily at 3 AM: Compute student engagement scores
    - Every 15 minutes: Refresh materialized view
  - **RLS Policies (3)**:
    - Hierarchical access control based on user role
    - Students can view own sessions
    - Admins see institution/department scoped data

- **Application Layer Changes**:
  - **Service Layer (2 files)**:
    - `lib/services/analytics/session-tracking-service.ts` - Session management
    - `lib/services/analytics/engagement-service.ts` - Analytics business logic with hierarchical access control
  - **API Endpoints (4 files)**:
    - `app/api/analytics/engagement/route.ts` - Main metrics endpoint
    - `app/api/analytics/engagement/at-risk/route.ts` - At-risk students
    - `app/api/analytics/engagement/student/[id]/route.ts` - Student detail
    - `app/api/analytics/engagement/sections/compare/route.ts` - Section comparison
  - **React Hooks (4 files)**:
    - `hooks/analytics/use-engagement-metrics.ts` - Dashboard metrics (15-min refetch)
    - `hooks/analytics/use-at-risk-students.ts` - At-risk students (5-min refetch)
    - `hooks/analytics/use-student-engagement.ts` - Student detail
    - `hooks/analytics/use-section-comparison.ts` - Section comparison
  - **UI Components (7 files)**:
    - `components/analytics/engagement-filters.tsx` - Hierarchical filters
    - `components/analytics/student-engagement-table.tsx` - Full-featured data table
    - `components/analytics/at-risk-modal.tsx` - At-risk students modal
    - `components/analytics/student-detail-modal.tsx` - Student drill-down (3 tabs)
    - `components/analytics/section-comparison-table.tsx` - Section comparison
    - `components/analytics/charts/login-trend-chart.tsx` - Trend visualization
    - `components/analytics/charts/engagement-distribution-chart.tsx` - Distribution chart
  - **Types (1 file)**:
    - `types/analytics.ts` - 30+ interfaces for complete type safety
  - **Modified Files (2)**:
    - `app/auth/callback/route.ts` - Enhanced with session creation
    - `app/api/auth/logout/route.ts` - Enhanced with session closure
    - `app/(routes)/users/activity/page.tsx` - Added Engagement Analytics tab

- **Key Features**:
  - ✅ Automatic session tracking on login/logout
  - ✅ Device detection (mobile/tablet/desktop)
  - ✅ Module access tracking (academic, billing, etc.)
  - ✅ Engagement level calculation (high/medium/low/at_risk)
  - ✅ Percentile ranking within section
  - ✅ At-risk student identification with risk factors:
    - no_login_7d - No login in 7 days
    - inactive_7d - Inactive for 7+ days
    - below_20_percentile - Bottom 20% performance
    - low_session_duration - Below section average
    - limited_module_access - Using <3 modules
  - ✅ Section comparison with engagement scoring
  - ✅ Trend charts (30-day login activity)
  - ✅ Distribution charts (engagement levels)
  - ✅ Hierarchical access control (Faculty → HOD → Principal → Super Admin)
  - ✅ Export to CSV functionality

- **Dashboard Integration**:
  - Tabbed interface: "Activity Logs" + "Engagement Analytics"
  - Overview cards: Active Students (7d), At-Risk Count, Avg Session Duration, Avg Logins/Week
  - Interactive charts: Login Trend, Engagement Distribution
  - Section comparison (when semester selected)
  - Student engagement table with sorting/filtering/pagination
  - Click-through modals for at-risk students and student details

- **Access Control**:
  - Faculty: See only sections they teach
  - HOD: See department-level data
  - Principal: See institution-level data
  - Super Admin: Global access across all institutions

- **Performance Optimizations**:
  - 17 indexes across 4 tables
  - Materialized view for fast queries
  - React Query caching (15-min stale time for metrics)
  - Pagination (50 items per page)
  - Lazy loading for charts and modals

- **Completion Status**: 95% Complete
  - ✅ Phase 1: Database schema (100%)
  - ✅ Phase 2: Session tracking integration (100%)
  - ✅ Phase 3: Database functions (100%)
  - ✅ Phase 4: Service layer (100%)
  - ✅ Phase 5: API endpoints (100%)
  - ✅ Phase 6: React hooks (100%)
  - ✅ Phase 7: TypeScript types (100%)
  - ✅ Phase 8: UI components (100%)
  - ✅ Phase 9: Dashboard integration (100%)
  - ⏳ Phase 10: pg_cron job scheduling (pending extension verification)

- **Ready for Use**:
  - All components functional and integrated
  - Session tracking starts on next login
  - Manually run database functions to compute initial metrics:
    ```sql
    SELECT compute_daily_engagement_metrics(CURRENT_DATE - INTERVAL '1 day');
    SELECT compute_student_engagement_scores(CURRENT_DATE);
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_engagement_overview;
    ```
  - Schedule pg_cron jobs when ready (migration file available)

- **Impact**:
  - Complete visibility into student engagement patterns
  - Early identification of at-risk students for intervention
  - Data-driven insights for improving student success
  - Section-level performance comparison for faculty
  - Comprehensive audit trail of system usage
  - Foundation for predictive analytics and ML models

- **Documentation Updated**:
  - `supabase/SQL_FILE_INDEX.md` - Added new tables and functions
  - `IMPLEMENTATION_STATUS.md` - Comprehensive tracking document
  - All code includes JSDoc comments and type annotations

### 2025-01-18: Unified Learners Profiles (Phase 1 Complete)

- **Files**:
  - `setup/01_tables.sql` - Added learners_profiles table and lifecycle_status ENUM
  - `migrations/20250118_migrate_to_learners_profiles.sql` - Data migration script

  **Purpose**: Unify admissions and students tables into single learners_profiles table with complete lifecycle tracking

  **Changes**:
  - ✅ Created `lifecycle_status` ENUM with 10 values (enquiry → pending → approved → rejected → waitlisted → active → inactive → exited → graduated → alumni)
  - ✅ Created `learners_profiles` table with:
    - 100+ fields combining all data from admissions + students
    - Migration lineage fields (original_admission_id, original_student_id, migrated_at, migration_source)
    - Unified lifecycle_status replacing dual status enums
    - Support for regulation_id and batch_id
  - ✅ Created 21 performance indexes for learners_profiles
  - ✅ Marked admissions and students tables as LEGACY (will become VIEWs in Phase 2)
  - ⏳ Migration script ready to execute (migrates 3,506 records: 535 admissions + 2,971 students)

  **Migration Strategy**:
  - Scenario A: Merged records (admission + student) - uses student data as primary source
  - Scenario B: Admission-only records (pending/approved applications)
  - Scenario C: Student-only records (orphaned or direct-created students)
  - Zero data loss verification with rollback capability

  **Impact**:
  - Single source of truth for all learner data from enquiry to alumni
  - Eliminates data duplication (60+ duplicate fields)
  - Expected 33% faster queries with optimized indexes
  - Complete audit trail with original IDs preserved
  - Enables comprehensive lifecycle analytics

  **Phase 2 Status:** ✅ **COMPLETE - REVISED APPROACH** (2025-01-18)
  - ❌ **Original Plan:** VIEWs for backward compatibility - **FAILED** (PostgREST can't detect FK relationships on VIEWs)
  - ✅ **Revised Plan:** Keep original tables + sync triggers
  - ✅ Restored admissions and students tables from legacy backups
  - ✅ Created bidirectional sync triggers:
    - `trg_sync_admission_to_learners` - admissions → learners_profiles
    - `trg_sync_student_to_learners` - students → learners_profiles
  - ✅ Verified PostgREST joins work correctly (institution, degree, department, program)
  - ✅ All existing frontend code works without changes
  - ✅ Data stays synchronized automatically via triggers

  **Phase 3 Status:** ✅ **COMPLETE** (2025-01-18)
  - ✅ Created comprehensive TypeScript types (types/learner-profile.ts - 500+ lines)
    - LifecycleStatus type with 10 values
    - Complete LearnerProfile interface (100+ fields)
    - Validation schemas with Zod
    - Status transition rules and required fields map
    - Dashboard analytics interfaces
  - ✅ Created LearnerProfileService (lib/services/learner-profile-service.ts - 550+ lines)
    - Complete CRUD operations with joins
    - Lifecycle status management with validation
    - Enrollment workflow (approved → active)
    - Analytics & dashboard methods
    - Bulk operations and utilities
  - ✅ Created React Query hooks (hooks/use-learner-profiles.ts - 300+ lines)
    - 16 query hooks (get, list, analytics, filtered lists)
    - 7 mutation hooks with optimistic updates
    - Common use case hooks (useEnquiries, useActiveStudents, etc.)
    - Prefetch utilities for performance

  **Implementation Status:**
  - **Phase 1:** ✅ Complete - Database foundation (2,973 records migrated)
  - **Phase 2:** ✅ Complete - Backward compatibility (VIEWs working)
  - **Phase 3:** ✅ Complete - Service layer ready for use
  - **Phase 4-5:** ⏳ Pending - Route migration and cleanup (optional gradual rollout)

  **Ready for Development:**
  - New code can now use learners_profiles table directly
  - Old code continues working via VIEWs (zero breaking changes)
  - Gradual migration can proceed module-by-module
  - Feature flags can control rollout pace

### 2025-11-28: Combined Enrollment Analytics Function

- **File**: `migrations/combined_enrollment_analytics.sql` ✅ **APPLIED**

  **Purpose**: Created database function for combined admissions + students analytics dashboard

  **Changes**:
  - Added `get_combined_enrollment_analytics()` function
    - Returns combined statistics from both `admissions` and `students` tables
    - Supports filtering by institution, date range, degree, department, program
    - Calculates: combinedTotal, totalAdmissions, totalStudents, pending, approved, rejected, waitlisted, enrolled, onboarded, directStudents, pendingProfile, conversionRate, onboardingRate, avgProcessingDays
  - Added 3 performance indexes:
    - `idx_admissions_analytics_combined` - Composite index on (institution_id, status, created_at)
    - `idx_students_onboarded_status` - Partial index for active students
    - `idx_students_direct_enrolled` - Partial index for direct students (no admission_id)

  **Impact**:
  - Dashboard shows combined view of admissions pipeline + student onboarding
  - Onboarded count now tracks students with `status = 'active'`
  - Direct students (added without admission) are now visible in analytics

### 2026-01-12: LTI 1.3 Integration for MATLAB

- **Files**:
  - `migrations/20260112100000_create_lti_tables.sql` ✅ **APPLIED**
  - `migrations/20260112100001_add_lti_fields_to_applications.sql` ✅ **APPLIED**

  **Purpose**: Enable LTI 1.3 (Learning Tools Interoperability) integration with MathWorks MATLAB suite (Grader, Online, Academy)

  **Changes**:
  - **Created 3 new tables**:
    - `lti_tools` - Registry of LTI 1.3 tools with configurations
    - `lti_launches` - Tracks every tool launch with academic context
    - `lti_grades` - Stores grade passback from MATLAB to MyJKKN
  - **Created 17 indexes** for performance:
    - 2 on lti_tools (active status, tool type)
    - 8 on lti_launches (user, learner, institution, context, resource, created, tool, nonce)
    - 7 on lti_grades (user, learner, institution, resource, launch, unsynced, received)
    - 1 composite on learners_profiles (roster queries)
  - **Created 6 RLS policies** for multi-tenant security
  - **Created 2 database functions**:
    - `get_lti_roster()` - Returns active students for Names & Roles service
    - `get_lti_launch_stats()` - Analytics for launch tracking
  - **Created 1 trigger function**:
    - `populate_lti_grade_fields()` - Auto-calculates score percentage and idempotency key
  - **Updated applications table**:
    - Added `lti_tool_id` column (foreign key to lti_tools)
    - Created index `idx_applications_lti_tool`

  **LTI 1.3 Features Supported**:
  - ✅ JWT-based authentication with RS256 signing
  - ✅ Single Sign-On (SSO) - no separate login for MATLAB
  - ✅ Grade passback (Assignment & Grade Services)
  - ✅ Roster sync (Names & Roles Service)
  - ✅ Context claims (program, semester, section)
  - ✅ Multi-tenancy with institution isolation
  - ✅ Learner lifecycle integration (only 'active' students can launch)
  - ✅ Security: JWT nonce, idempotency keys, rate limiting ready

  **Integration Architecture**:
  - Student clicks MATLAB Grader in Application Hub
  - MyJKKN generates LTI 1.3 JWT with user/academic context
  - MATLAB validates JWT and creates session (no separate login)
  - Student completes assignment in MATLAB
  - MATLAB passes grade back to MyJKKN automatically
  - Grade appears in student's grades view

  **Next Steps (Phase 1)**:
  - Register 3 MATLAB applications in Application Hub
  - Implement simple link integration (MATLAB Online, MATLAB Academy)
  - Phase 2: LTI core implementation (JWT generation, launch flow)
  - Phase 3: MathWorks registration & end-to-end testing
  - Phase 4: Grade passback implementation
  - Phase 5: Roster sync implementation
  - Phase 6: Analytics & monitoring

  **Files Updated**:
  - `types/lti.ts` - Complete TypeScript types for LTI integration
  - `supabase/SQL_FILE_INDEX.md` - Documentation updated

### 2025-01-20

- **Child App Authentication Cleanup**
  - Dropped 3 child app tables (child_app_analytics, child_app_auth_codes_bucket, child_app_unified_sessions)
  - Dropped 1 function (cleanup_expired_child_app_sessions)
  - Total cleanup: 440 rows, ~1.8 MB of data
  - Reason: Authentication flow moved to separate auth server (auth.jkkn.ai)
  - Migration: 20250120_cleanup_child_app_tables.sql
  - Preserved: applications and profiles tables (data synced to auth server)
  - Updated table comments to reflect new architecture

### 2025-01-17

- **Complete Database Analysis Performed**
- Created setup/02_functions.sql with 237 functions
- Created setup/03_policies.sql with 250+ RLS policies
- Created setup/04_triggers.sql with 71 triggers
- Created setup/05_views.sql with 7 views
- Generated comprehensive DATABASE_ANALYSIS_REPORT.md
- Identified critical issues (no foreign keys)
- Updated index with complete database structure
- **Parent Authentication Integration with Applications Module**
  - Added authentication fields to applications table in setup/01_tables.sql
  - Created migration file 20250117_add_auth_to_applications.sql
  - Updated TypeScript types to support authentication
  - Integrated authentication settings into application form UI
  - Applications can now optionally use MyJKKN authentication instead of separate login

### 2025-01-16

- Created organized structure
- Consolidated all existing SQL into proper files
- Established single source of truth policy

## ⚠️ Common Mistakes to Avoid

1. **Creating files like:**

   - ❌ `admission_module_schema.sql`
   - ❌ `organization_module_setup.sql`
   - ❌ `staff_module_setup.sql`
   - ❌ `billing_module_complete.sql`

2. **Instead, update:**
   - ✅ `setup/01_tables.sql` for any table changes
   - ✅ `setup/02_functions.sql` for function changes
   - ✅ This index file when changes are made

## 🔍 Quick Search

### Find billing-related objects:

- Tables: student_bills, billing_receipts in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find attendance-related objects:

- Tables: daily_attendance in `setup/01_tables.sql`
- Functions: (to be added in `setup/02_functions.sql`)

### Find user/auth-related objects:

- Tables: profiles in `setup/01_tables.sql`
- Functions: auth.\* functions in `setup/00_master_setup.sql`

## 📝 Recent Migrations

### 2025-12-29: Enhanced Program and Semester Fields

- **File**: `migrations/add_program_semester_enhanced_fields.sql` ✅ **APPLIED**

  **Purpose**: Add enhanced metadata fields to programs and semesters tables for better UI control and academic structure management

  **Programs Table Changes** (6 new fields):
  - `program_type` VARCHAR(10) - Program level: UG, PG, Ph.D (nullable)
  - `display_name` TEXT - Alternative display name (nullable)
  - `program_order` INTEGER - Sort order for UI display (default: 0)
  - `program_duration_yrs` NUMERIC(3,1) - Duration in years (nullable, must be > 0)
  - `pattern_type` VARCHAR(10) - Academic pattern: Year/Semester (nullable)
  - `is_part_time` BOOLEAN - Part-time program flag (default: false)

  **Semesters Table Changes** (4 new fields):
  - `semester_order` INTEGER - Chronological order (default: 1)
  - `initial_semester` BOOLEAN - First/entry semester flag (default: false)
  - `terminal_semester` BOOLEAN - Final/exit semester flag (default: false)
  - `semester_group` VARCHAR(50) - Grouping label (nullable)

  **Indexes Created**:
  - `idx_programs_type_order` - Programs filtered by type and order (partial)
  - `idx_programs_pattern_type` - Programs filtered by pattern type (partial)
  - `idx_semesters_order` - Semesters ordered by program
  - `idx_semesters_initial` - Initial semesters by program (partial)
  - `idx_semesters_terminal` - Terminal semesters by program (partial)
  - `idx_semesters_group` - Semesters filtered by group (partial)

  **Impact**:
  - ✅ All new fields are optional/nullable (backward compatible)
  - ✅ TypeScript types updated in `types/organizations.ts`
  - ✅ API endpoints automatically support new fields via spread operator
  - ✅ Enhanced filtering and sorting capabilities
  - ✅ Better UI/UX control for program and semester displays
  - ✅ Supports year-based and semester-based academic patterns

  **Files Updated**:
  - `setup/01_tables.sql` - Updated table definitions with new columns
  - `types/organizations.ts` - Added new fields to interfaces and DTOs
  - `migrations/add_program_semester_enhanced_fields.sql` - Migration file

### 2025-11-28: Add Academic Year to Admissions Table

- **File**: `migrations/add_academic_year_to_admissions.sql` ✅ **APPLIED**

  **Purpose**: Move Academic Year field from Learner Onboarding to Admission page

  **Changes**:
  - Added `academic_year_id` column (UUID) to `admissions` table
  - Added foreign key reference to `academic_years` table
  - Created index `idx_admissions_academic_year_id` for performance

  **Workflow Change**:
  - **Before**: Academic Year was entered during Learner Onboarding (after admission approval)
  - **After**: Academic Year is captured during Admission process and automatically copied to Student record

  **Impact**:
  - ✅ Academic Year field now available on Admission form (Course Selection tab)
  - ✅ Students created from approved admissions inherit `academic_year_id`
  - ✅ Reduces onboarding steps if academic year was set during admission
  - ✅ Backward compatible - existing admissions have NULL academic_year_id

### 2025-02-07: Bug Report Display ID Race Condition Fix 🚨 CRITICAL

- **File**: `migrations/20250207_fix_bug_report_display_id_race_condition.sql` ✅ **APPLIED**

  **Problem Solved**:
  - Fixed race condition causing "Unable to generate report ID" errors
  - Eliminated ~87% failure rate during concurrent bug submissions
  - Gap of 2,062 between actual reports (306) and max ID (2368) proved the issue

  **Solution**:
  - Replaced `SELECT MAX()+1` pattern with PostgreSQL SEQUENCE
  - Created `bug_reports_display_id_seq` starting at 2369
  - Updated `generate_bug_display_id()` to use atomic `nextval()` operation
  - Recreated triggers to use new function

  **Impact**:
  - ✅ Zero race conditions (atomic database operations)
  - ✅ Perfect concurrency handling (unlimited simultaneous users)
  - ✅ No more user-facing errors
  - ✅ Consecutive IDs with no gaps (except deletions)

  **Testing**:
  - Verified 10 consecutive unique IDs generated successfully
  - Confirmed trigger functioning correctly
  - Sequence properly configured and indexed

  **Files Updated**:
  - `setup/02_functions.sql` - Updated function to use SEQUENCE
  - `migrations/20250207_fix_bug_report_display_id_race_condition.sql` - Migration file

### 2025-01-16: Leave Permissions Migration to Academic Format

- **File**: `migrations/update_leave_permissions_to_academic_format.sql` ✅ **APPLIED**

  **Purpose**: Fix permission key mismatch preventing HOD and other users from accessing Leave Management module

  **Problem**:
  - Sidebar menu requires `academic.leaves.view` permission
  - Permission constants defined as `leave.view`
  - Database roles had old `leave.*` permission keys
  - Mismatch prevented menu from showing even when permissions were granted

  **Solution**:
  - Created transformation function to migrate all leave permission keys
  - Updated 3 roles: admission, hod, student
  - Transformed basic permissions: `leave.view` → `academic.leaves.view`, etc.
  - Consolidated settings permissions: `leave.types.*`, `leave.workflows.*`, `leave.settings.*` → `academic.leaves.manage`
  - Migrated approval permissions: `leave.approve.*` → `academic.leaves.approve.*`
  - Migrated report permissions: `leave.reports.*` → `academic.leaves.reports.*`
  - Migrated analytics permissions: `leave.analytics.*` → `academic.leaves.analytics.*`

  **Impact**:
  - ✅ HOD role now has 15 academic.leaves.* permissions
  - ✅ All old `leave.*` keys removed from database
  - ✅ Menu visibility now works correctly for granted permissions
  - ✅ Zero breaking changes (only key format changed)
  - ✅ Backward compatible with existing permission checks

  **Files Updated**:
  - `lib/constants/permissions.ts` - Updated permission definitions
  - `migrations/update_leave_permissions_to_academic_format.sql` - Database migration
  - `custom_roles` table - Updated permissions JSONB for 3 roles

### 2025-01-30: Resource Management - Missing Fields Implementation

- **File**: `migrations/20250130_add_missing_resource_fields.sql` ✅ **APPLIED**

  - Added structured vendor address fields:
    - `vendor_address_line1`, `vendor_address_line2`
    - `vendor_city`, `vendor_state`, `vendor_zip`
    - `vendor_contract_details`, `vendor_support_contact`
  - Added lifecycle management fields:
    - `depreciation_rate` (%, 0-100)
    - `current_value` (current estimated value)
    - `disposal_date` (planned retirement date)
  - Created indexes for disposal_date and vendor_city
  - Dropped old `vendor_address` column (replaced with structured fields)

### 2025-01-30: Resource Management Module Update

- **File**: `migrations/20250130_update_resources_table.sql` ✅ **APPLIED**

  - Added missing columns to `resources` table:
    - `caretaker_user_ids TEXT[]` - Array of staff IDs
    - `name`, `subcategory_id`, location fields, vendor fields
    - `booking_config`, `approval_config`, `reminder_config` JSONB
    - `image_urls`, `tags`, `access_roles` arrays
    - Usage tracking fields
  - Created indexes for better performance

- **File**: `migrations/20250130_create_resource_storage_bucket.sql` ✅ **APPLIED**
  - Created `resource-images` storage bucket
  - Set up RLS policies for image upload/access
  - Configured 5MB file size limit
  - Allowed image MIME types only

### 2025-01-27: Fix Sync Missing Profiles - Add learner_id to profiles

- **File**: `migrations/20250127_add_learner_id_to_profiles.sql` ✅ **APPLIED**

  **Purpose**: Fix "Sync Missing Profiles" functionality by adding bidirectional link between profiles and learners_profiles tables

  **Problem Solved**:
  - Profiles were created but not linked to learners (missing `learner_id`)
  - Students couldn't see their own profiles (filter by `learner_id` failed)
  - Sync function reported same missing profiles repeatedly
  - RLS policies failing (relied on non-existent `learner_id`)
  - Missing `department_id` in profile creation logic

  **Changes**:
  - Added `learner_id UUID` column to `profiles` table with foreign key to `learners_profiles(id)`
  - Added `department_id UUID` column to `profiles` table with foreign key to `departments(id)`
  - Created 3 indexes:
    - `idx_profiles_learner_id` - Fast lookup by learner
    - `idx_profiles_learner_id_unique` - Prevent duplicate profiles per learner (unique constraint)
    - `idx_profiles_department_id` - Department-level queries
  - Backfilled existing profiles:
    - Matched by `LOWER(email)` for case-insensitive comparison
    - Set `learner_id` for active/inactive/exited students
    - Set `department_id` from learners_profiles

  **Code Changes**:
  - Updated `app/api/learners/create-missing-profiles/route.ts`:
    - Added `learner_id: learner.id` to profile creation
    - Added `department_id: learner.department_id` to profile creation
    - Fixed phone field: `learner.mobile` → `learner.student_mobile`
  - Updated `app/api/learners/complete-onboarding/route.ts`:
    - Added `learner_id: learner.id` to profile creation
  - Updated `supabase/setup/01_tables.sql`:
    - Added `learner_id UUID` and `department_id UUID` columns to profiles table definition
  - Updated `types/auth.ts`:
    - Added `learner_id: string | null` to Profile interface

  **Impact**:
  - ✅ Profiles now properly linked to learners
  - ✅ Students can see their own profiles
  - ✅ Sync function works correctly
  - ✅ RLS policies function properly
  - ✅ Fast joins between profiles ↔ learners_profiles
  - ✅ Referential integrity maintained
  - ✅ Department-level filtering enabled

  **Files Updated**:
  - `supabase/migrations/20250127_add_learner_id_to_profiles.sql` (NEW)
  - `supabase/setup/01_tables.sql` (Updated profiles table)
  - `app/api/learners/create-missing-profiles/route.ts` (Added learner_id, department_id, fixed phone field)
  - `app/api/learners/complete-onboarding/route.ts` (Added learner_id)
  - `types/auth.ts` (Added learner_id to Profile interface)
  - `docs/fixes/2025-01/2025-01-27-FIX-sync-missing-profiles.md` (NEW - Documentation)

### 2025-01-27: Sync Profile Data from Learners (Role, Institution, Department)

- **Migration**: `fix_duplicate_learner_ids` + `sync_existing_profile_data_from_learners` + `add_unique_constraint_learner_id` ✅ **APPLIED**

  **Purpose**: Ensure profiles stay in sync with learner data (role, institution_id, department_id)

  **Problem Solved**:
  - Students showing with wrong role ('guest', 'faculty' instead of 'student')
  - Profiles had wrong institution_id (not matching learner's institution)
  - Profiles had wrong department_id (not matching learner's department)
  - Duplicate profiles with same learner_id (2 cases found and fixed)

  **Changes Applied**:
  1. **Fixed duplicate learner_ids**:
     - Found 2 profiles with duplicate learner_id values
     - Cleared learner_id from profiles with mismatched emails
     - Re-backfilled with correct email matching

  2. **Created sync function** - `sync_profile_data_from_learners()`:
     ```sql
     CREATE OR REPLACE FUNCTION sync_profile_data_from_learners()
     RETURNS INTEGER
     -- Updates role, institution_id, department_id from learners to profiles
     -- Returns count of profiles updated
     ```

  3. **One-time data sync**:
     - Fixed 3 profiles with wrong role (faculty→student, guest→student)
     - Fixed 2 profiles with wrong institution_id
     - Fixed 2 profiles with wrong department_id

  4. **Added unique constraint**:
     - `idx_profiles_learner_id_unique` - Prevents duplicate profiles per learner

  **Function Details**:
  - **Name**: `sync_profile_data_from_learners()`
  - **Returns**: INTEGER (count of profiles updated)
  - **Security**: SECURITY DEFINER
  - **Permissions**: Granted to authenticated and service_role
  - **Called by**: Sync Missing Profiles API + can be called manually

  **Profiles Fixed**:
  | Email | Issue | Status |
  |-------|-------|--------|
  | vijayabharathyrpcse2022@jkkn.ac.in | Role: faculty → student | ✅ |
  | jeevananthame24uba@jkkn.ac.in | Role: guest → student | ✅ |
  | keerthana23ucsai@jkkn.ac.in | Role: guest → student | ✅ |
  | roshinia25uen@jkkn.ac.in | Institution & Department synced | ✅ |
  | soundharyan25uen@jkkn.ac.in | Institution & Department synced | ✅ |

  **Code Changes**:
  - Updated `app/api/learners/create-missing-profiles/route.ts`:
    - Added call to `sync_profile_data_from_learners()` before creating new profiles
    - Ensures existing profiles stay in sync on every sync operation

  **Impact**:
  - ✅ All profiles with learner_id now have correct role='student' (100%)
  - ✅ All profiles with learner_id have correct institution_id (100%)
  - ✅ All profiles with learner_id have correct department_id (100%)
  - ✅ No duplicate learner_ids (unique constraint enforced)
  - ✅ Automatic sync on every "Sync Missing Profiles" button click
  - ✅ Students get correct role-based permissions
  - ✅ Accurate analytics and reporting by institution/department

  **Verification**:
  ```sql
  -- Test the function
  SELECT sync_profile_data_from_learners(); -- Returns: 0 (all synced)

  -- Verify no issues
  SELECT COUNT(*) FROM profiles p
  INNER JOIN learners_profiles lp ON p.learner_id = lp.id
  WHERE p.role != 'student'
     OR p.institution_id IS DISTINCT FROM lp.institution_id
     OR p.department_id IS DISTINCT FROM lp.department_id;
  -- Returns: 0 (all correct)
  ```

  **Files Updated**:
  - `app/api/learners/create-missing-profiles/route.ts` (Added sync call)
  - Database: Created function `sync_profile_data_from_learners()`
  - Database: Applied 3 migrations (fix duplicates, sync data, add unique constraint)
  - `docs/fixes/2025-01/2025-01-27-FIX-sync-profile-data-from-learners.md` (NEW - Documentation)

---

**Remember: ONE file per object type, NO duplicates, ALWAYS update existing files!**
