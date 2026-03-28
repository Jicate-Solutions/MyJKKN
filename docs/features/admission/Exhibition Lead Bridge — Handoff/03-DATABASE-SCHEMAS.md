# Expo & Event Database Schemas (Live from Production)

> **Tables**: 15 | **Columns**: 183 | **FKs**: 47 | **RLS Policies**: 64


### `event_checklist_completions` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| checklist_item_id | uuid | NO |  |
| completed_by | uuid | NO |  |
| registration_id | uuid | YES |  |
| staff_assignment_id | uuid | YES |  |
| completed_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `registration_id` → `event_registrations.id`
- `completed_by` → `profiles.id`
- `staff_assignment_id` → `event_staff_assignments.id`
- `checklist_item_id` → `event_checklist_items.id`

**RLS Policies:** 4 policies
- `event_checklist_completions_delete` (DELETE)
- `event_checklist_completions_select` (SELECT)
- `event_checklist_completions_insert` (INSERT)
- `event_checklist_completions_delete_own` (DELETE)

### `event_checklist_items` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| checklist_id | uuid | NO |  |
| title | text | NO |  |
| description | text | YES |  |
| order_index | integer | YES | 0 |
| is_required | boolean | YES | false |

**Foreign Keys:**
- `checklist_id` → `event_checklists.id`

**RLS Policies:** 4 policies
- `event_checklist_items_insert_admin` (INSERT)
- `event_checklist_items_update_admin` (UPDATE)
- `event_checklist_items_select` (SELECT)
- `event_checklist_items_delete_admin` (DELETE)

### `event_checklists` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| title | text | NO |  |
| phase | text | NO |  |
| target_role | text | NO |  |
| order_index | integer | YES | 0 |
| day_type | text | YES |  |

**Foreign Keys:**
- `event_id` → `startup_events.id`

**RLS Policies:** 4 policies
- `event_checklists_insert_admin` (INSERT)
- `event_checklists_update_admin` (UPDATE)
- `event_checklists_select` (SELECT)
- `event_checklists_delete_admin` (DELETE)

### `event_demo_slots` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| venue_assignment_id | uuid | NO |  |
| registration_id | uuid | YES |  |
| start_time | timestamp with time zone | YES |  |
| duration_minutes | integer | YES | 5 |
| room_label | text | YES |  |
| slot_order | integer | YES |  |
| created_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `registration_id` → `event_registrations.id`
- `event_id` → `startup_events.id`
- `venue_assignment_id` → `event_venue_assignments.id`

**RLS Policies:** 4 policies
- `event_demo_slots_insert_admin` (INSERT)
- `event_demo_slots_update_admin` (UPDATE)
- `event_demo_slots_select` (SELECT)
- `event_demo_slots_delete_admin` (DELETE)

### `event_registrations` (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| team_name | text | NO |  |
| problem_idea | text | YES |  |
| owner_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| checked_in | boolean | YES | false |
| checked_in_at | timestamp with time zone | YES |  |
| checked_in_by | uuid | YES |  |
| status | text | NO | 'registered'::text |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| team_code | text | YES |  |

**Foreign Keys:**
- `checked_in_by` → `profiles.id`
- `event_id` → `startup_events.id`
- `owner_id` → `profiles.id`
- `institution_id` → `institutions.id`

**RLS Policies:** 5 policies
- `event_registrations_insert` (INSERT)
- `event_registrations_voting_select` (SELECT)
- `event_registrations_update` (UPDATE)
- `event_registrations_delete` (DELETE)
- `event_registrations_select` (SELECT)

### `event_staff_assignments` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| venue_assignment_id | uuid | NO |  |
| staff_id | uuid | NO |  |
| role | text | NO |  |
| day_type | text | NO |  |
| created_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `staff_id` → `staff.id`
- `venue_assignment_id` → `event_venue_assignments.id`
- `event_id` → `startup_events.id`

**RLS Policies:** 4 policies
- `event_staff_assignments_delete_admin` (DELETE)
- `event_staff_assignments_insert_admin` (INSERT)
- `event_staff_assignments_select` (SELECT)
- `event_staff_assignments_update_admin` (UPDATE)

### `event_submissions` (31 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| registration_id | uuid | NO |  |
| app_name | text | YES |  |
| github_url | text | YES |  |
| live_app_url | text | YES |  |
| description | text | YES |  |
| category | text | YES |  |
| mrr_amount | numeric | YES | 0 |
| paying_users_count | integer | YES | 0 |
| user_count | integer | YES | 0 |
| proof_urls | ARRAY | YES | '{}'::text[] |
| mrr_verified | boolean | YES | false |
| mrr_verified_at | timestamp with time zone | YES |  |
| mrr_verified_by | uuid | YES |  |
| mrr_rejected_reason | text | YES |  |
| tier_level | integer | YES | 0 |
| tier_points | integer | YES | 0 |
| mrr_bonus_points | integer | YES | 0 |
| total_score | integer | YES | 0 |
| submitted_at | timestamp with time zone | YES |  |
| submitted_by | uuid | YES |  |
| metrics_updated_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| problem_statement | text | YES |  |
| solution_summary | text | YES |  |
| elevator_pitch | text | YES |  |
| lovable_url | text | YES |  |
| demo_video_url | text | YES |  |
| active_users_count | integer | YES | 0 |

**Foreign Keys:**
- `registration_id` → `event_registrations.id`
- `submitted_by` → `profiles.id`
- `event_id` → `startup_events.id`
- `mrr_verified_by` → `profiles.id`

**RLS Policies:** 5 policies
- `event_submissions_select` (SELECT)
- `event_submissions_member_select` (SELECT)
- `event_submissions_insert` (INSERT)
- `event_submissions_voting_select` (SELECT)
- `event_submissions_update` (UPDATE)

### `event_team_attendance` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| registration_id | uuid | NO |  |
| venue_assignment_id | uuid | NO |  |
| day_type | text | NO |  |
| status | text | NO | 'present'::text |
| marked_by | uuid | NO |  |
| marked_at | timestamp with time zone | NO | now() |
| notes | text | YES |  |

**Foreign Keys:**
- `registration_id` → `event_registrations.id`
- `event_id` → `startup_events.id`
- `venue_assignment_id` → `event_venue_assignments.id`
- `marked_by` → `profiles.id`

**RLS Policies:** 4 policies
- `event_team_attendance_delete` (DELETE)
- `event_team_attendance_update` (UPDATE)
- `event_team_attendance_select` (SELECT)
- `event_team_attendance_insert` (INSERT)

### `event_team_members` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| registration_id | uuid | NO |  |
| profile_id | uuid | YES |  |
| email | text | NO |  |
| full_name | text | YES |  |
| student_id | text | YES |  |
| has_laptop | boolean | YES | false |
| added_at | timestamp with time zone | NO | now() |
| learner_id | uuid | YES |  |
| status | text | NO | 'accepted'::text |
| is_leader | boolean | NO | false |
| responded_at | timestamp with time zone | YES |  |

**Foreign Keys:**
- `registration_id` → `event_registrations.id`
- `profile_id` → `profiles.id`
- `learner_id` → `learners_profiles.id`

**RLS Policies:** 6 policies
- `event_team_members_member_self_select` (SELECT)
- `event_team_members_insert` (INSERT)
- `event_team_members_owner_update` (UPDATE)
- `event_team_members_select` (SELECT)
- `event_team_members_delete` (DELETE)
- `event_team_members_member_self_update` (UPDATE)

### `event_team_venue_allocations` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| registration_id | uuid | NO |  |
| venue_assignment_id | uuid | NO |  |
| day_type | text | NO |  |
| allocated_at | timestamp with time zone | NO | now() |
| allocated_by | uuid | YES |  |

**Foreign Keys:**
- `allocated_by` → `profiles.id`
- `event_id` → `startup_events.id`
- `registration_id` → `event_registrations.id`
- `venue_assignment_id` → `event_venue_assignments.id`

**RLS Policies:** 4 policies
- `event_team_venue_allocations_insert_admin` (INSERT)
- `event_team_venue_allocations_update_admin` (UPDATE)
- `event_team_venue_allocations_delete_admin` (DELETE)
- `event_team_venue_allocations_select` (SELECT)

### `event_venue_assignments` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | uuid_generate_v4() |
| event_id | uuid | NO |  |
| resource_id | uuid | YES |  |
| manual_name | text | YES |  |
| manual_building | text | YES |  |
| manual_room | text | YES |  |
| capacity_override | integer | YES |  |
| day_type | text | NO |  |
| institution_id | uuid | NO |  |
| created_at | timestamp with time zone | NO | now() |

**Foreign Keys:**
- `resource_id` → `resources.id`
- `institution_id` → `institutions.id`
- `event_id` → `startup_events.id`

**RLS Policies:** 4 policies
- `event_venue_assignments_delete_admin` (DELETE)
- `event_venue_assignments_select` (SELECT)
- `event_venue_assignments_update_admin` (UPDATE)
- `event_venue_assignments_insert_admin` (INSERT)

### `expo_daily_reports` (23 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| expo_event_id | uuid | NO |  |
| institution_id | uuid | NO |  |
| report_date | date | NO |  |
| stall_fee | numeric | YES | 0 |
| travel_expense | numeric | YES | 0 |
| accommodation_expense | numeric | YES | 0 |
| food_expense | numeric | YES | 0 |
| printing_materials | numeric | YES | 0 |
| miscellaneous_expense | numeric | YES | 0 |
| total_expense | numeric | YES |  |
| total_visitors | integer | YES | 0 |
| counselling_done | integer | YES | 0 |
| brochures_distributed | integer | YES | 0 |
| interested_students | integer | YES | 0 |
| leads_collected | integer | YES | 0 |
| stall_photos | ARRAY | YES | '{}'::text[] |
| event_photos | ARRAY | YES | '{}'::text[] |
| visitor_photos | ARRAY | YES | '{}'::text[] |
| notes | text | YES |  |
| submitted_by | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `expo_event_id` → `expo_events.id`
- `institution_id` → `institutions.id`
- `submitted_by` → `profiles.id`

**RLS Policies:** 4 policies
- `expo_reports_update` (UPDATE)
- `expo_reports_select` (SELECT)
- `expo_reports_delete` (DELETE)
- `expo_reports_insert` (INSERT)

### `expo_event_team_members` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| expo_event_id | uuid | NO |  |
| member_type | text | NO |  |
| staff_id | uuid | YES |  |
| student_id | uuid | YES |  |
| name | text | NO |  |
| phone | text | YES |  |
| role | text | NO | 'volunteer'::text |
| created_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `expo_event_id` → `expo_events.id`
- `staff_id` → `profiles.id`
- `student_id` → `learners_profiles.id`

**RLS Policies:** 4 policies
- `expo_team_select` (SELECT)
- `expo_team_delete` (DELETE)
- `expo_team_insert` (INSERT)
- `expo_team_update` (UPDATE)

### `expo_events` (21 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| expo_master_id | uuid | YES |  |
| event_name | text | NO |  |
| organizer_name | text | YES |  |
| city | text | NO |  |
| venue_name | text | YES |  |
| start_date | date | NO |  |
| end_date | date | NO |  |
| travel_mode | text | YES |  |
| accommodation_details | text | YES |  |
| team_leader_id | uuid | YES |  |
| approved_by_id | uuid | YES |  |
| event_status | text | NO | 'planned'::text |
| notes | text | YES |  |
| total_team_members | integer | YES | 0 |
| total_expenses | numeric | YES | 0 |
| total_leads_collected | integer | YES | 0 |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `team_leader_id` → `profiles.id`
- `created_by` → `profiles.id`
- `expo_master_id` → `expo_masters.id`
- `institution_id` → `institutions.id`
- `approved_by_id` → `profiles.id`

**RLS Policies:** 4 policies
- `expo_events_insert` (INSERT)
- `expo_events_delete` (DELETE)
- `expo_events_select` (SELECT)
- `expo_events_update` (UPDATE)

### `expo_masters` (13 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO |  |
| event_name | text | NO |  |
| organizer_name | text | YES |  |
| city | text | YES |  |
| venue_name | text | YES |  |
| description | text | YES |  |
| frequency | text | YES |  |
| tags | ARRAY | YES |  |
| is_active | boolean | YES | true |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Foreign Keys:**
- `created_by` → `profiles.id`
- `institution_id` → `institutions.id`

**RLS Policies:** 4 policies
- `expo_masters_delete` (DELETE)
- `expo_masters_select` (SELECT)
- `expo_masters_update` (UPDATE)
- `expo_masters_insert` (INSERT)