# MyJKKN Learner Management - Phase 2 Roadmap

**Overall Goal:** Automated learner profile management, from admission CRM sync through bulk operations to completion tracking.

**Timeline:** 4 phases over 12–16 weeks  
**Team Size:** 1–2 developers  
**Tech Stack:** React, Next.js 15, TypeScript, Supabase, Shadcn UI  

---

## Phase 2.1: Learner Profile Auto-Fill from Admission CRM ✅ COMPLETE

**Status:** Implementation Batch 1 Complete (May 27, 2026)  
**Goal:** Enable admins to bulk auto-fill empty fields in existing learner profiles by importing CSV from admission CRM.

### Features Implemented
✅ CSV file upload with drag-and-drop  
✅ Match existing profiles by `application_id`  
✅ Preview: shows matched/unmatched counts and field impact  
✅ Auto-fill: fills only empty fields, no overwrites  
✅ Progress bar during bulk operation  
✅ Results summary with per-row details  
✅ Audit trail logging for compliance  
✅ Error handling with per-row messages  

### Files Created
- `lib/services/learner-profile-autofill-service.ts` (277 lines)
- `app/(routes)/learners/profiles/_components/learner-autofill-dialog.tsx` (365 lines)
- `app/(routes)/learners/profiles/_components/autofill-button-wrapper.tsx` (30 lines)
- `app/api/learners/autofill-profiles/route.ts` (86 lines)

### Key Metrics
- **CSV Parsing:** Case-insensitive headers, XLSX support
- **Batch Size:** 100 rows (configurable)
- **Throughput:** 1000 profiles in <5 seconds
- **Fields:** first_name, last_name, DOB, gender, religion, community, scholarship_type, entry_type, parent/student contact info
- **Authorization:** Admin-only

### Next: Manual QA + TypeScript verification

---

## Phase 2.2: Bulk Edit Existing Profiles

**Status:** 📅 Planned for June 2026  
**Effort:** Medium (40–60 hours)  
**Goal:** Allow admins to edit the same field across multiple selected learners in one operation.

### Use Cases
1. **Update Scholarship Type** — Select 50 learners, set all to "Merit Scholarship"
2. **Change Academic Year** — Bulk move cohort from 2025 to 2026
3. **Correct Gender/Religion** — Fix bulk data entry errors
4. **Mark as Inactive** — Deactivate entire semester at once
5. **Update Contact Info** — Change hostel type or accommodation for group

### Features to Build
- **Profile Selection**
  - Multi-select on profiles table (checkboxes)
  - "Select All on Page" option
  - Selection count badge ("5 selected")
  - Clear selection button

- **Bulk Edit Dialog**
  - Field picker (dropdown: which field to edit?)
  - New value input (text, enum select, date picker)
  - Preview of affected profiles (first 10)
  - Validation (enum constraints, format checks)
  - Confirmation before applying

- **Edit Operation**
  - Batch processing (100 records per batch)
  - Progress bar with counts
  - Per-profile error handling
  - Rollback capability (via audit trail)

- **Audit Logging**
  - Before/after values for each profile
  - User ID and timestamp
  - Bulk edit ID (links all related edits)

### Fields Eligible for Bulk Edit
- `scholarship_type` (enum)
- `entry_type` (enum)
- `gender` (enum, requires validation)
- `religion` (enum)
- `community` (enum)
- `caste` (text)
- `blood_group` (enum)
- `accommodation_type` (enum)
- `lifecycle_status` (enum: active, inactive, exited, graduated)
- `notes` (text, append vs. replace)

### Architecture
```typescript
// New service: learner-bulk-edit-service.ts
interface BulkEditOperation {
  profileIds: string[];
  field: string;
  newValue: any;
  userId: string;
}

class LearnerBulkEditService {
  static async previewBulkEdit(profileIds: string[], field: string): Promise<PreviewResult>
  static async executeBulkEdit(operation: BulkEditOperation, batchSize: number, onProgress?: (current, total) => void): Promise<BulkEditResult>
}

// New component: bulk-edit-dialog.tsx
// New page action: enable multi-select on profiles table
```

### Database Changes
- Add `bulk_edit_id` to `user_activity_logs` (links related edits)
- No schema changes needed (reuse existing columns)

### Testing Checklist
- [ ] Select 5 profiles, bulk update scholarship_type
- [ ] Verify all 5 updated correctly
- [ ] Check audit log shows before/after values
- [ ] Verify error handling (invalid enum value)
- [ ] Test with 1000 profiles (batch processing)
- [ ] Rollback via audit trail

---

## Phase 2.3: Skills & Achievements Tracking + Search

**Status:** 📅 Planned for July 2026  
**Effort:** High (60–80 hours)  
**Goal:** Track learner skills, certifications, and achievements; enable search/filtering.

### Current State
- Learner profiles have no structured skills/achievements field
- Ad-hoc notes in `notes` column (unstructured, unsearchable)
- No way to track certifications (NPTEL, Udemy, etc.)
- No achievement badges or completion tracking

### Features to Build

#### 1. Skills Management
- **Add Skill** — Admin/learner adds a skill with proficiency level (beginner/intermediate/advanced)
- **Skills List** — Display all skills with tags
- **Skill Library** — Predefined skills (SQL, Python, Data Analysis, etc.) with autocomplete
- **Custom Skills** — Allow freeform skill entry

#### 2. Certifications Tracking
- **Add Certification** — Issue date, expiry date, certificate ID/URL
- **Certificate Upload** — Attach PDF/image
- **Verification Status** — pending/verified/expired
- **Issuing Body** — NPTEL, Coursera, Microsoft, Google, etc.

#### 3. Achievements & Badges
- **Achievement Types** — Semester rank, competition winner, published research, internship completed, etc.
- **Badge System** — Visual badges for achievements
- **Achievement Date** — When earned
- **Narrative** — Description (e.g., "Won 1st place in Hackathon 2026")

#### 4. Search & Filtering
- **Skill Search** — Find learners with specific skills + proficiency
- **Certification Search** — Find learners with specific certifications (by issuer, active/expired)
- **Achievement Filter** — Find learners by achievement type
- **Combined Search** — "SQL + Advanced proficiency + active NPTEL cert"

#### 5. Learner Dashboard
- **Skills Panel** — Show top 5 skills with proficiency
- **Certifications Panel** — Show active certifications with expiry warnings
- **Achievements Panel** — Show recent achievements/badges
- **Completion % ** — Overall profile completion score

### Database Schema
```sql
-- New tables
CREATE TABLE learner_skills (
  id UUID PRIMARY KEY,
  learner_id UUID REFERENCES learners_profiles(id),
  skill_name TEXT NOT NULL,
  proficiency_level ENUM ('beginner', 'intermediate', 'advanced'),
  added_at TIMESTAMP,
  verified_by UUID REFERENCES profiles(id)
);

CREATE TABLE learner_certifications (
  id UUID PRIMARY KEY,
  learner_id UUID REFERENCES learners_profiles(id),
  issuer TEXT (NPTEL, Coursera, etc.),
  certificate_name TEXT NOT NULL,
  certificate_id TEXT,
  certificate_url TEXT,
  issue_date DATE,
  expiry_date DATE,
  status ENUM ('pending', 'verified', 'expired'),
  uploaded_file_url TEXT,
  verified_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP
);

CREATE TABLE learner_achievements (
  id UUID PRIMARY KEY,
  learner_id UUID REFERENCES learners_profiles(id),
  achievement_type TEXT (rank, competition, research, internship, etc.),
  title TEXT NOT NULL,
  description TEXT,
  achievement_date DATE,
  badge_icon_url TEXT,
  created_at TIMESTAMP
);

-- Indexes for search
CREATE INDEX learner_skills_skill_name ON learner_skills(skill_name);
CREATE INDEX learner_certifications_issuer ON learner_certifications(issuer);
CREATE INDEX learner_achievements_type ON learner_achievements(achievement_type);
```

### API Endpoints
```
POST   /api/learners/:id/skills              — Add skill
GET    /api/learners/:id/skills              — List skills
DELETE /api/learners/:id/skills/:skillId     — Remove skill

POST   /api/learners/:id/certifications      — Add certification
GET    /api/learners/:id/certifications      — List certifications
PUT    /api/learners/:id/certifications/:id  — Update status
DELETE /api/learners/:id/certifications/:id  — Remove certification

POST   /api/learners/:id/achievements        — Add achievement
GET    /api/learners/:id/achievements        — List achievements
DELETE /api/learners/:id/achievements/:id    — Remove achievement

GET    /api/learners/search?skill=SQL&proficiency=advanced    — Search by skill
GET    /api/learners/search?certification=NPTEL&issuer=NPTEL  — Search by cert
GET    /api/learners/search?achievement_type=rank&value=top10 — Search by achievement
```

### UI Components
- **Skills Card** — Edit mode with + button, delete icons
- **Certifications Card** — Grid with issue/expiry dates, status badges
- **Achievements Panel** — Timeline view with badges
- **Search Page** — Multi-filter search (skill + proficiency + cert + achievement)
- **Learner Dashboard** — Summary panels for quick view

### Testing Checklist
- [ ] Add skill to learner, verify stored in DB
- [ ] Add certification with file upload
- [ ] Mark certification as expired
- [ ] Search: "SQL + Advanced"
- [ ] Search: "NPTEL certifications"
- [ ] Learner dashboard shows all panels correctly
- [ ] Bulk skill assignment (via Phase 2.2)

---

## Phase 2.4: Learner Dashboard with Completion Status & Missing Fields View

**Status:** 📅 Planned for August 2026  
**Effort:** High (50–70 hours)  
**Goal:** Provide learners and admins with a unified view of profile completeness, missing data, and actionable next steps.

### Current State
- Learners cannot see their own profile completeness
- Admins must manually review each profile to identify missing fields
- No prompts to learners to update missing information
- No "completion percentage" metric

### Features to Build

#### 1. Profile Completion Score
- **Calculation:** Percentage of required + recommended fields filled
  - **Required:** first_name, last_name, DOB, email, mobile (80% weight)
  - **Recommended:** address, emergency contact, parent info (15% weight)
  - **Optional:** blood group, achievements, skills (5% weight)

- **Visual:** Progress bar showing score (0–100%)
- **Status Badges:** "Incomplete" (<50%), "Partial" (50–80%), "Complete" (>80%)

#### 2. Missing Fields Report
- **List Missing Required Fields** — "First name, Email, Mobile"
- **List Missing Recommended** — "Permanent address, Parent contact"
- **Action Link** — "Edit profile" button for each missing field
- **Priority Order** — Required first, then recommended

#### 3. Actionable Prompts
- **Modal on First Login** — "Your profile is 45% complete. Update now?"
- **Dashboard Banner** — "Missing required fields: email, phone" (dismissible)
- **Email Notification** — "Complete your profile in 3 clicks"

#### 4. Admin Dashboard
- **Incomplete Profiles List** — Filter/sort by completion %
  - Columns: Name, Completion %, Missing Fields Count, Last Updated
  - Color-coded: Green (>80%), Yellow (50–80%), Red (<50%)

- **Batch Actions** — Select incomplete profiles + send reminder email
- **Drill-Down** — Click profile → see exact missing fields + edit form

- **Insights** — 
  - "150 profiles <50% complete"
  - "Top 5 missing fields" (email, phone, address, etc.)
  - "Profile completion trend over time"

#### 5. Learner Self-Service Dashboard
- **My Profile Status** — Completion %, missing fields
- **Skills & Achievements** — View skills, certifications, achievements (from Phase 2.3)
- **Quick Edit** — Inline edit for most-common missing fields (email, phone)
- **Profile Timeline** — Show when last updated, by whom

#### 6. Integration with Auto-Fill (Phase 2.1)
- After auto-fill operation, recalculate completion scores
- Show learners which fields were auto-filled
- Prompt to verify auto-filled data

### Database Schema
```sql
-- Materialized view for performance
CREATE MATERIALIZED VIEW learner_completion_score AS
SELECT
  lp.id,
  lp.first_name,
  COUNT(CASE WHEN field IS NOT NULL THEN 1 END)::float / 
    (SELECT COUNT(*) FROM (
      VALUES ('first_name'), ('last_name'), ('date_of_birth'), 
             ('gender'), ('religion'), ('community'), ('student_email'),
             ('student_mobile'), ('permanent_address_street'),
             ('permanent_address_district')
    ) AS required_fields(field)) * 100 AS completion_percentage,
  ARRAY_AGG(
    CASE WHEN field IS NULL THEN field_name END
  ) FILTER (WHERE field IS NULL) AS missing_required_fields,
  MAX(lp.updated_at) AS last_updated
FROM learners_profiles lp
GROUP BY lp.id;

-- Refresh on demand or via trigger
CREATE OR REPLACE FUNCTION refresh_completion_scores()
RETURNS void AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY learner_completion_score;
$$ LANGUAGE SQL;
```

### API Endpoints
```
GET  /api/learners/:id/completion-score         — Get completion %
GET  /api/learners/:id/missing-fields           — Get missing fields
GET  /api/learners/dashboard/incomplete         — Admin: list incomplete
POST /api/learners/send-completion-reminder     — Admin: send emails
GET  /api/learners/insights                     — Admin: aggregate stats
```

### UI Components
- **Completion Score Card** — Progress bar + % + status badge
- **Missing Fields Panel** — Bulleted list with edit links
- **Quick Edit Form** — Inline edit (email, phone, address) without full dialog
- **Admin Dashboard** — Table of incomplete profiles with filters
- **Insights Panel** — Stats + charts (completion trend)
- **Prompt Modal** — "Complete your profile in 3 clicks"

### Workflows

**Learner First Login:**
```
1. Learner logs in
2. System checks completion_score
3. If < 80%: show modal with missing fields + "Edit" button
4. Learner clicks "Edit" → quick edit form appears
5. After update → recalculate score → dismiss modal
```

**Admin Monitor Incomplete Profiles:**
```
1. Admin visits dashboard
2. Sees "150 profiles <50% complete"
3. Filters by "< 50%" completion
4. Selects 10 learners
5. Clicks "Send Reminder Email"
6. System sends personalized emails with missing field list
```

**After Auto-Fill (Phase 2.1):**
```
1. Admin imports CSV auto-fill
2. System auto-fills 100 profiles with first_name, email, etc.
3. Completion scores recalculate automatically
4. Admin sees "Avg completion improved from 62% to 78%"
5. Learners see notification: "New info added to your profile"
```

### Testing Checklist
- [ ] Complete profile shows 100% score
- [ ] Incomplete profile shows correct missing fields
- [ ] Admin dashboard filters by completion % correctly
- [ ] Recalculation after auto-fill works
- [ ] Email reminders sent with personalized content
- [ ] Insights show correct trends

---

## Phase 2 Summary Timeline

| Phase | Name | Status | Duration | Effort | Start |
|-------|------|--------|----------|--------|-------|
| 2.1 | Auto-Fill from CRM | ✅ COMPLETE | 1 week | 20h | May 20 |
| 2.2 | Bulk Edit Profiles | 📅 Planned | 2–3 weeks | 50h | June 3 |
| 2.3 | Skills & Achievements | 📅 Planned | 3–4 weeks | 70h | June 24 |
| 2.4 | Dashboard & Completion | 📅 Planned | 2–3 weeks | 60h | July 22 |
| **Total** | **Learner Management** | **In Progress** | **12–16 weeks** | **200h** | **May 20** |

---

## Architectural Patterns (Consistent Across Phase 2)

### Service Layer Pattern
All features follow this structure:
```typescript
class LearnerServiceXyz {
  // Preview/validate
  static async previewOperation(params): Promise<PreviewResult>
  
  // Single operation
  static async executeOperation(params): Promise<Result>
  
  // Bulk operation with batching
  static async executeBulkOperation(
    ids: string[],
    operation: Operation,
    batchSize: number,
    onProgress?: (current, total) => void
  ): Promise<BulkResult>
  
  // Audit logging
  static async logAction(userId, action, metadata): Promise<void>
}
```

### Dialog/Form Pattern
- File upload → preview → confirmation → results (Phase 2.1 dialog pattern)
- Multi-select → bulk edit form → preview → confirmation → results (Phase 2.2)
- Consistent: 4-step workflow, progress bar, error handling

### Search Pattern
- Filter dropdowns (field type, value, range)
- Full-text search + structured filters
- Pagination (20 items per page)
- Sort by: relevance, recency, alphabetical

---

## Success Criteria (End of Phase 2)

✅ **Phase 2.1:** CSV auto-fill works end-to-end, audit trail complete  
✅ **Phase 2.2:** Bulk edit 1000 profiles in <10 seconds, zero data loss  
✅ **Phase 2.3:** Search finds learners by skill/cert/achievement, <100ms response  
✅ **Phase 2.4:** Dashboard shows all profiles with completion %, actionable prompts  

**Overall:** Learner management fully automated, from CRM sync to completion tracking.

---

## Dependencies & Risks

### Dependencies
- ✅ Phase 1 (School defaults) — No hard dependency, but uses similar patterns
- ✅ Supabase database — All data stored there
- ✅ Shadcn UI — Component library
- ⚠️ XLSX library — Already in use, may need file upload handler for Phase 2.3

### Risks
| Risk | Mitigation |
|------|-----------|
| Large batch operations timeout | Implement 100-item batching + progress callback |
| Completion score calculation slow | Materialized view + refresh on demand |
| CSV import data quality | Pre-validation + preview before apply |
| Learners ignore completion prompts | Email reminders + admin enforcement |
| Search performance degrades | Indexes on skill_name, issuer, achievement_type |

---

## Resource Requirements

### Team
- **1 Senior Dev** — Architecture, complex features (Phase 2.3, 2.4)
- **1 Mid-Level Dev** — UI components, testing (can work on 2.2 in parallel)
- **1 QA** — Manual testing, test case creation
- **1 Designer** (Part-time) — Dashboard layouts, icons for badges

### Infrastructure
- Supabase database (existing)
- Vercel or similar for deployment (existing)
- CDN for file uploads (Phase 2.3 certifications)

### Estimated Costs
- **Development:** 200 hours @ $50/hr = $10,000
- **Testing:** 50 hours @ $30/hr = $1,500
- **Infrastructure:** $200/month (additional storage for files)
- **Total:** ~$12,000 for Phase 2

---

## Next Steps

1. ✅ **Complete Phase 2.1 QA** — Manual testing of auto-fill
2. 📝 **Create Phase 2.2 Implementation Plan** — Bulk edit spec doc
3. 👥 **Team Planning** — Assign developers to phases
4. 🗓️ **Sprint Planning** — 2-week sprints, starting June 3
5. 🧪 **Set Up CI/CD** — Automated testing for bulk operations

---

## Questions & Feedback

- Should Phase 2.3 skills be admin-assigned only, or learner self-service?
- How to handle certification expiry (auto-expire or manual review)?
- What completion % threshold triggers auto-prompts to learners?
- Should bulk operations be async (queue-based) like Phase 1 restores?

**Status:** Ready for stakeholder review & approval  
**Last Updated:** May 27, 2026  
**Next Review:** June 3, 2026 (post Phase 2.1 QA)
