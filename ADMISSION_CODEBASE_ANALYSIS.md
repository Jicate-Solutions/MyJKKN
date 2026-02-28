# MyJKKN Admission Module - Comprehensive Codebase Analysis

**Generated:** 2026-02-27
**Analysis Scope:** Complete service layer, types, hooks, pages, and database schema

---

## 1. SERVICE LAYER INVENTORY

### Core Services (36 files in `lib/services/admission/`)

| Service File | Key Classes | Primary Tables | Status |
|---|---|---|---|
| **lead-service.ts** | LeadService | admission_leads | ✅ COMPLETE |
| **application-service.ts** | ApplicationService | admission_leads (funnel_stage >= application_started) | ✅ COMPLETE |
| **assignment-rules-service.ts** | AssignmentRulesService | admission_assignment_rules | ✅ COMPLETE |
| **lead-scoring-engine-service.ts** | LeadScoringEngineService | admission_lead_scores, admission_leads | ✅ COMPLETE |
| **activity-service.ts** | ActivityService | admission_lead_activities | ✅ Integrated |
| **consultant-service.ts** | ConsultantService | admission_consultants | ✅ COMPLETE |
| **counselor-daily-view-service.ts** | CounselorDailyViewService | admission_leads (custom query) | ✅ COMPLETE |

### LeadService Public Methods (~40 methods)

**CRUD:** getLeads(), getLead(), createLead(), updateLead(), deleteLead()
**Stage:** updateStage(), logStageHistory()
**Priority:** updatePriority(), toggleHotLead()
**Tags:** addTag(), removeTag()
**Assignment:** assignCounselor()
**Follow-up:** scheduleFollowup()
**Timeline:** getTimeline()
**Dashboard:** getFunnelSummary(), getDashboardSummary()

### AssignmentRulesService Public Methods (~13)

**CRUD:** getAssignmentRules(), getActiveAssignmentRules(), createAssignmentRule(), updateAssignmentRule(), deleteAssignmentRule()
**Operations:** toggleRuleStatus(), updatePriorities()
**Analytics:** getAssignmentStats()
**Helpers:** enrichRule(), getDefaultAction(), getDefaultCriteria()

**CRITICAL GAP:** NO evaluateRule() or evaluateAllRules() method exists - rules cannot be matched/executed

### LeadScoringEngineService Public Methods (~15)

**Calculation:** calculateLeadScore(), calculateBulkScores(), recalculateAllScores()
**Retrieval:** getLeadScore(), getScoreBreakdown(), getLeadsByScoreRange(), getLeadsWithScores()
**Statistics:** getScoreStatistics()

---

## 2. FUNNEL STAGES - ALL 26 TYPES

From `types/admission.ts` lines 22-48:

```
1.  new                      6.  engaged                   11. documents_verified        16. token_paid             21. confirmed
2.  contacted                7.  qualified                 12. interview_scheduled       17. applied (legacy)       22. declined
3.  not_reachable            8.  application_started       13. interview_completed       18. interviewed (legacy)   23. withdrew
4.  interested               9.  application_submitted     14. offer_sent                19. offered (legacy)       24. expired
5.  follow_up_scheduled      10. documents_pending         15. offer_accepted            20. enrolled               25. lost
                                                                                                                      26. dormant
```

**Note:** `funnel_stage` (text column, legacy) and `stage` (enum column) both exist in DB but are NOT synced.

---

## 3. AdmissionLead TYPE DEFINITION

**File:** `types/admission.ts` lines 89-181

### Core Fields
- `id`: UUID, `institution_id`: UUID (required)
- `full_name`: text (required), `phone`: text (required), `email`: nullable
- `source`: LeadSource enum (required for create)
- `funnel_stage`: text (legacy), `stage`: enum (preferred)

### Scoring Fields
- `score`: integer (0-100+), `score_category`: varchar(50), `score_updated_at`: timestamptz
- `engagement_score`: nullable integer (0-100)
- `quality_score`: nullable integer (0-100)
- `combined_score`: nullable integer
- `score_breakdown`: JSONB
- `conversion_probability`: numeric
- `is_hot_lead`: boolean (manual or computed)
- `is_priority`: boolean (manual flag)
- `priority`: VIRTUAL FIELD (derived from is_hot_lead + is_priority, NOT in DB)

### Counselor Assignment
- `counselor_id`: FK to admission_counselors (legacy model)
- `assigned_counselor_id`: FK to profiles (current model)
- `assigned_at`: timestamptz, `ownership_mode`: enum
- `last_contact_at`, `next_followup_at`, `last_activity_at`: timestamptz

### Personal Details
- `address_line1`, `city`, `state`, `district`, `pincode`
- `date_of_birth`, `gender`, `alternate_phone`
- `parent_name`, `parent_phone`, `parent_email`, `parent_opted_in`

### Academic
- `interested_programs`: UUID array
- `preferred_campus`: UUID
- `academic_year`: text

### JKKN Tier-1 Custom Fields
- `student_interest_level`: enum (very_high | high | medium | low | none)
- `parent_decision_status`: enum (supportive | considering | against | not_involved | unknown)

### WhatsApp Opt-in
- `wa_opt_in`: boolean, `wa_opt_in_at`, `wa_opt_in_source`, `wa_opt_out_at`

### Status Flags
- `is_active`: boolean (soft delete)
- `is_dormant`, `dormant_at`
- `is_lost`, `lost_reason`, `lost_at`

### Meta
- `tags`: text array, `notes`: text
- `learner_profile_id`: FK to learners_profiles (one-to-one)
- `created_by`, `created_at`, `updated_at`

---

## 4. DATABASE SCHEMA

**File:** `supabase/migrations/admission/002_core_tables.sql`

### admission_leads (65 columns)

Key indexes (10 total):
- `idx_admission_leads_institution`, `idx_admission_leads_funnel_stage`, `idx_admission_leads_counselor`
- `idx_admission_leads_phone`, `idx_admission_leads_email`, `idx_admission_leads_created`
- `idx_admission_leads_next_followup`, `idx_admission_leads_score`, `idx_admission_leads_source`
- `idx_admission_leads_assigned_counselor`, `idx_admission_leads_stage`

**MISSING CONSTRAINTS:**
- No UNIQUE(institution_id, phone)
- No UNIQUE(institution_id, email)
- No CHECK on stage transitions
- No CONSTRAINT on phone format

### Related Tables

**admission_counselors:** id, name, email, institution_id, phone, designation, is_active, user_id
**admission_lead_activities:** lead_id FK, activity_type, title, description, metadata JSONB, performed_by
**admission_lead_stage_history:** lead_id FK, from_stage, to_stage, changed_by, notes
**admission_assignment_rules:** institution_id FK, name, description, priority, is_active, criteria JSONB, action JSONB
**admission_lead_scores:** lead_id FK, institution_id FK, total_score, engagement_score, quality_score, score_breakdown JSONB, score_category, recommended_action, calculated_at, expires_at (7 days)

---

## 5. REACT HOOKS

**Location:** `hooks/admission/`

### use-lead-scoring.ts (310 lines)

**Retrieval Hooks:**
- `useLeadScore(leadId)` - Single score
- `useScoreBreakdown(leadId)` - Detailed breakdown
- `useLeadsByScoreRange(filters)` - Query by range
- `useLeadsWithScores(institutionId, options)` - Joined data
- `useScoreStatistics(institutionId)` - Distribution

**Mutation Hooks:**
- `useScoreCalculation()` - Returns `calculateScore()`, `calculateBulkScores()`, `recalculateAllScores()`

**Display Helpers:**
- `useScoreCategoryDisplay()` - Color mapping
- `useScoreBreakdownFormatter()` - Format for display

### use-admission-tqm-metrics.ts
- TQM metrics integration

### use-lead-mutations.ts (imported in new/page.tsx)
- `useLeadMutations()`, `useCounselorProfiles()`

---

## 6. PAGE STRUCTURE

**Base:** `app/(routes)/admission/`

### Leads Module
- `/leads` → LeadsDataTable (list page)
- `/leads/new` → Create form (45KB, comprehensive)
  - Form fields: full_name, email, phone, alternate_phone, DOB, gender, address, parent info
  - JKKN fields: student_interest_level, parent_decision_status, academic_year
  - Location picker: State → District (using `indianStates`, `getDistrictsByState`)
  - Lead sources: 11 options
  - Integration: LeadService.createLead(), CounselorDailyViewService, ConsultantService
- `/leads/[id]` → View/edit with subdirectory components

### Applications Module
- `/applications` → List (funnel_stage in APPLICATION_STAGES)
- `/applications/[id]` → Detail

### Other Routes
- `/counselors/` → Daily view, calls, alerts, briefing
- `/consultants/` → Partner management
- `/analytics/` → Dashboard

---

## 7. IDENTIFIED GAPS & ISSUES

### GAP #1: No Duplicate Detection on createLead()

**File:** `lead-service.ts` lines 211-284
**Severity:** HIGH

**Issue:** Creates lead without checking if phone/email already exists
- No unique constraint on (institution_id, phone) or (institution_id, email)
- Global phone index exists but not scoped to institution
- Duplicates create orphaned data, communication issues

**Missing Code:**
```typescript
const { data: existing } = await this.supabase
  .from('admission_leads')
  .select('id')
  .eq('institution_id', leadData.institution_id)
  .or(`phone.eq.${leadData.phone},email.eq.${leadData.email}`)
  .limit(1);

if (existing?.length > 0) {
  throw new Error('Lead with this phone/email already exists');
}
```

---

### GAP #2: No Auto-Assignment Logic on createLead()

**File:** `lead-service.ts` lines 211-284
**Severity:** HIGH

**Issue:** Lead always created with counselor_id = null
- No evaluation of admission_assignment_rules table
- No round-robin, workload-balancing, or rule-based assignment
- Manual assignment required via assignCounselor() - manual bottleneck

**Missing Integration:**
```typescript
// After creating lead:
const rules = await AssignmentRulesService.getActiveAssignmentRules(
  leadData.institution_id
);
const assignedCounselorId = await evaluateAssignmentRules(leadData, rules);
if (assignedCounselorId) {
  await this.assignCounselor(leadId, assignedCounselorId);
}
```

---

### GAP #3: No Stage Validation in updateStage()

**File:** `lead-service.ts` lines 370-408
**Severity:** MEDIUM

**Issue:** Allows arbitrary transitions (e.g., new → offer_sent → new → enrolled)
- No state machine enforcement
- No precondition checks (e.g., can't offer without documents verified)
- Invalid states possible

**Missing Validation:**
```typescript
const VALID_TRANSITIONS: Record<FunnelStage, FunnelStage[]> = {
  'new': ['contacted', 'lost', 'dormant'],
  'contacted': ['interested', 'not_reachable', 'lost', 'dormant'],
  'interested': ['follow_up_scheduled', 'engaged', 'lost', 'dormant'],
  // ... etc
};

if (!VALID_TRANSITIONS[currentStage]?.includes(newStage)) {
  throw new Error(`Cannot transition from ${currentStage} to ${newStage}`);
}
```

---

### GAP #4: No Phone Validation

**File:** `lead-service.ts` lines 219-234 (createLead), 289-324 (updateLead)
**Severity:** MEDIUM

**Issue:** Phone only .trim()'d, not validated for:
- Length (Indian: 10 digits)
- Format (dashes, spaces, international prefixes)
- Invalid characters
- Duplicate normalization (123-456-7890 vs 1234567890 treated as different)

**Impact:** Invalid phones, failed SMS/WhatsApp delivery, unmatched duplicates

**Missing Validation:**
```typescript
private static normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2); // Remove +91
  }
  return digits.slice(-10); // Last 10 digits
}

if (!this.validatePhone(leadData.phone)) {
  throw new Error('Invalid phone format (must be 10 digits)');
}
```

---

### GAP #5: Score Not Linked to Priority Flags

**File:** `lead-scoring-engine-service.ts` lines 762-780 (updateLeadScore)
**File:** `lead-service.ts` lines 33-60 (normalizeLead)
**Severity:** MEDIUM

**Issue:**
- Score calculated and saved to `score` + `score_category`
- But `is_hot_lead` and `is_priority` **never** auto-updated based on score
- These flags remain manual-only
- normalizeLead() derives priority FROM flags but never updates flags FROM score

**Missing Logic:**
```typescript
// In LeadScoringEngineService.updateLeadScore():
const isHot = score >= 80; // threshold
const isPriority = score >= 60;
await this.supabase
  .from('admission_leads')
  .update({
    is_hot_lead: isHot,
    is_priority: isPriority || isHot,
    score,
    score_category: category,
    score_updated_at: new Date().toISOString()
  })
  .eq('id', leadId);
```

---

### GAP #6: No Score Re-calculation Cron/Scheduler

**File:** All admission services
**Severity:** MEDIUM

**Issue:**
- calculateLeadScore() exists for one-time calculation
- No scheduled job to recalculate periodically
- Scores expire after 7 days (line 731) but no auto-refresh on expiry
- recalculateAllScores() exists but must be manually triggered

**Missing Implementation:**
```typescript
// Edge Function or cron job:
// 1. Query all institutions
// 2. For each institution:
//    - Get leads with expired_scores (expires_at < now())
//    - Call LeadScoringEngineService.recalculateAllScores(institutionId)
// 3. Schedule to run daily at 2 AM
```

---

### GAP #7: No Webhook/Inbound API for Lead Creation

**File:** `app/api/admission/` (20+ endpoints but NO /leads/ endpoint)
**Severity:** HIGH

**Issue:**
- NO `POST /api/admission/leads/` endpoint
- No webhook support for:
  - Website form submissions
  - Third-party integrations
  - Callback-based lead ingestion
- Page form submits directly to LeadService client-side

**Impact:** Cannot integrate external lead sources (website forms, 3rd party tools)

**Missing Endpoint:**
```typescript
// app/api/admission/leads/route.ts (does not exist)
export async function POST(req: Request) {
  const leadData = await req.json();

  // Validate
  // Duplicate check
  // Assignment rules evaluation
  // Create lead
  // Return with 201
}
```

---

### GAP #8: Assignment Rules Evaluation Not Implemented

**File:** `assignment-rules-service.ts` (entire file)
**Severity:** HIGH

**Issue:**
- Service exists with CRUD operations
- **NO** evaluateRule() or evaluateAllRules() method
- Rules stored as criteria JSONB + action JSONB
- No logic to:
  1. Check if lead matches criteria
  2. Execute action (assign to counselor, round-robin, etc.)
  3. Handle fallbacks

**Missing Methods:**
```typescript
static async evaluateLead(lead: AdmissionLead, rules: AssignmentRule[]): Promise<AssignmentAction | null> {
  for (const rule of rules) {
    if (this.matchesCriteria(lead, rule.criteria)) {
      return rule.action;
    }
  }
  return null;
}

private static matchesCriteria(lead: AdmissionLead, criteria: AssignmentCriterion[]): boolean {
  return criteria.every(c => {
    switch (c.operator) {
      case 'equals':
        return lead[c.field as keyof AdmissionLead] === c.value;
      case 'contains':
        return String(lead[c.field as keyof AdmissionLead]).includes(String(c.value));
      case 'greater_than':
        return Number(lead[c.field as keyof AdmissionLead]) > Number(c.value);
      case 'in':
        return (c.value as string[]).includes(
          String(lead[c.field as keyof AdmissionLead])
        );
    }
    return false;
  });
}

static async executeAction(leadId: string, action: AssignmentAction): Promise<void> {
  if (action.type === 'assign_to_counselor' && action.counselor_ids?.length) {
    const counselorId = action.counselor_ids[0]; // or round-robin
    await LeadService.assignCounselor(leadId, counselorId);
  }
  // Handle other action types
}
```

---

### GAP #9: Score Thresholds Not Configurable

**File:** `lead-scoring-engine-service.ts` lines 680-690
**File:** `use-lead-scoring.ts` lines 224-254
**Severity:** LOW

**Issue:**
- Score calculation thresholds hardcoded
- Category mapping hardcoded in hook
- No institution-specific scoring configuration
- scoring_rules_service feature removed - no config table

**Missing Configuration:**
```typescript
// Should have table: admission_score_configurations
interface ScoreConfiguration {
  institution_id: uuid;
  hot_lead_min: integer;     // >= 80
  priority_min: integer;     // >= 60
  cold_lead_max: integer;    // < 60
  categories: JSONB;         // { 'Hot': { min: 80, max: 100, action: '...' }, ...}
}
```

---

## 8. SUMMARY: What Works vs What's Missing

| Component | Status | Notes |
|-----------|--------|-------|
| Lead CRUD | ✅ Works | createLead, getLead, updateLead, deleteLead (soft) |
| Stage Management | ⚠️ Partial | updateStage() exists, no validation |
| Counselor Assignment | ✅ Works | assignCounselor() exists, no auto-trigger |
| Priority/Scoring | ❌ Broken | Score calculated but not linked to flags |
| Auto-Assignment | ❌ Missing | Rules service exists, evaluation logic missing |
| Duplicate Detection | ❌ Missing | No pre-insert check for phone/email |
| Stage Validation | ❌ Missing | No state machine enforcement |
| Phone Validation | ❌ Missing | No format/length checks |
| Webhook API | ❌ Missing | No POST /api/admission/leads/ endpoint |
| Score Cron | ❌ Missing | No scheduled recalculation |
| Configuration | ⚠️ Hardcoded | Score thresholds hardcoded, not per-institution |
| Follow-up Scheduling | ✅ Works | scheduleFollowup() creates activity |
| Timeline/History | ✅ Works | logStageHistory() and getTimeline() |
| Dashboard Stats | ✅ Works | getFunnelSummary(), getDashboardSummary() |

---

## 9. EXACT FILE PATHS & LINE NUMBERS

### Services
- **LeadService**: `/d/Projects/MyJKKN/lib/services/admission/lead-service.ts`
  - createLead(): lines 211-284
  - updateLead(): lines 289-324
  - updateStage(): lines 370-408
  - assignCounselor(): lines 577-618
  - normalizeLead(): lines 33-60

- **AssignmentRulesService**: `/d/Projects/MyJKKN/lib/services/admission/assignment-rules-service.ts`
  - getActiveAssignmentRules(): lines 101-115
  - No evaluation methods implemented

- **LeadScoringEngineService**: `/d/Projects/MyJKKN/lib/services/admission/lead-scoring-engine-service.ts`
  - calculateLeadScore(): lines 117-176
  - updateLeadScore(): lines 762-780
  - getLeadsWithScores(): lines 338-412

### Types
- **FunnelStage**: `/d/Projects/MyJKKN/types/admission.ts` lines 22-48
- **AdmissionLead**: lines 89-181
- **LeadPriority**: line 50

### Database Schema
- **admission_leads**: `/d/Projects/MyJKKN/supabase/migrations/admission/002_core_tables.sql` lines 25-106
- **admission_assignment_rules**: lines 200+
- **admission_lead_scores**: lines 300+

### Pages/Hooks
- **Create Lead Form**: `/d/Projects/MyJKKN/app/(routes)/admission/leads/new/page.tsx`
- **Lead List**: `/d/Projects/MyJKKN/app/(routes)/admission/leads/page.tsx` lines 1-52
- **Scoring Hook**: `/d/Projects/MyJKKN/hooks/admission/use-lead-scoring.ts` (310 lines)

---

## 10. COLUMN NAMING INCONSISTENCIES

| Column | Alias | Table | Inconsistency |
|--------|-------|-------|---|
| `funnel_stage` | `stage` | admission_leads | Both exist, not synced |
| `counselor_id` (FK admission_counselors) | `assigned_counselor_id` (FK profiles) | admission_leads | Two counselor models |
| `last_contact_at` | `last_activity_at` or `last_contacted_at` | admission_leads | Normalized in code |
| `priority` | computed from `is_hot_lead` + `is_priority` | N/A (virtual) | Virtual field only |
| `program_interest` | `interested_programs` | (inconsistent naming) | assignment-rules vs admission_leads |

---

## CRITICAL PATH TO PRODUCTION READINESS

**MUST FIX (blocks external API):**
1. #1 Duplicate detection (data quality)
2. #2 Auto-assignment (core feature)
3. #7 Webhook API (external integration)
4. #8 Rule evaluation (auto-assignment depends on it)

**SHOULD FIX (before major feature launch):**
5. #3 Stage validation (data integrity)
6. #4 Phone validation (communication reliability)
7. #5 Score-to-priority linking (lead ranking)
8. #6 Score recalculation cron (data freshness)

**NICE TO HAVE:**
9. #9 Configuration per institution (flexibility)

---

**Analysis Complete.** This report provides the exact file locations, line numbers, and code snippets needed for implementation planning.
