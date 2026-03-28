# Exhibition Lead Bridge — Module Connections & Dependencies

## Entity Relationship

```
institutions
     │
     ├── expo_masters (recurring event organizers)
     │       │
     │       └── expo_events (21 specific events)
     │              │
     │              ├── expo_event_team_members (staff + student volunteers)
     │              │       │
     │              │       └── profiles (staff_id / student_id)
     │              │
     │              ├── expo_daily_reports (expenses, visitors, photos)
     │              │
     │              └── admission_leads.expo_event_id ← THE BRIDGE
     │                     │
     │                     ├── admission_lead_activities
     │                     ├── admission_counselors (auto-assigned)
     │                     ├── admission_drip_sequences (auto follow-up)
     │                     └── referral_rewards (ambassador incentive)
     │
     ├── referral_reward_configs (commission tiers)
     │
     └── consultant_commission_structures (existing consultant rates)
```

## Foreign Keys (47 total across expo+event tables)

### expo_events
- `institution_id` → `institutions.id`
- `expo_master_id` → `expo_masters.id`
- `team_leader_id` → `profiles.id`
- `approved_by_id` → `profiles.id`
- `created_by` → `profiles.id`

### expo_event_team_members
- `expo_event_id` → `expo_events.id`
- `staff_id` → `staff.id` (nullable)
- `student_id` → `students.id` (nullable)

### expo_daily_reports
- `expo_event_id` → `expo_events.id`
- `institution_id` → `institutions.id`
- `submitted_by` → `profiles.id`

### admission_leads (bridge fields)
- `expo_event_id` → `expo_events.id`
- `referrer_id` → `profiles.id`
- `referred_by_id` → `profiles.id`
- `counselor_id` → `admission_counselors.id`
- `institution_id` → `institutions.id`

## Cross-Module Impact Analysis

### If You Modify admission_leads (adding captured_by or using referred_by_id)
- **Impact**: Lead list, lead detail, analytics, all lead hooks
- **Test**: Verify lead list still loads, lead detail shows expo info, analytics counts exhibition source

### If You Create Expo API Routes
- **Impact**: None on existing code — all new files
- **Test**: Just test the new routes

### If You Modify expo_events.total_leads_collected
- **Impact**: Wherever the expo event list is displayed (currently: DB only, no UI)
- **Test**: Verify the counter increments on capture

### If You Add 'ai_experience_zone' to LeadSource
- **Impact**: `types/admission.ts` type definition, any code that switches on source
- **Test**: Build passes, lead creation with new source works, analytics groups it correctly

## Tables: Production vs Staging Differences

| Table | Production | Staging |
|-------|-----------|---------|
| `expo_events` | 21 events (real data) | May not exist |
| `expo_event_team_members` | 170+ members (real) | May not exist |
| `expo_daily_reports` | Empty (no reports yet) | May not exist |
| `expo_masters` | 1 master record | May not exist |
| `admission_leads` | 78 cols, has `expo_event_id` | 61 cols (may lack `expo_event_id`) |
| `referral_rewards` | Exists | May not exist |

**Important**: The expo tables may need to be created on staging before development can proceed. Check staging first.

## Shared Services (What Existing Code Can Be Reused)

| Existing Service | Can Reuse For |
|------------------|---------------|
| `lead-service.ts` | Creating leads (add expo_event_id to create input) |
| `activity-service.ts` | Logging "captured at event" activity |
| `assignment-rules-service.ts` | Auto-assigning counselor |
| `reminders-service.ts` | Auto-scheduling follow-up |
| `communication-templates-service.ts` | WhatsApp template lookup |
| `source-tracking-service.ts` | Exhibition source analytics |

## Data Needed from Other Modules

| Data | Source Table | Why |
|------|-------------|-----|
| Programs list | `programs` | Dropdown on capture form |
| Institution list | `institutions` | Multi-institution booth |
| Counselor list | `admission_counselors` | Auto-assignment |
| Team member list | `expo_event_team_members` | Pre-fill "captured by" dropdown |
| Assignment rules | `admission_assignment_rules` | Counselor matching |
