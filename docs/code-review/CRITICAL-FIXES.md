# CRITICAL FIXES REQUIRED - TQM Modules

**⚠️ DO NOT DEPLOY TO PRODUCTION UNTIL THESE ARE FIXED ⚠️**

---

## 🔴 C1: SQL Injection Vulnerability

**Files:**
- `lib/services/billing/copq/billing-copq-service.ts:127-131`
- `lib/services/process-excellence/process-excellence-service.ts:59-62, 306-309`

**Current Code:**
```typescript
const sanitizedSearch = filters.search.replace(/[%_]/g, '\\$&');
query = query.or(`description.ilike.%${sanitizedSearch}%,root_cause.ilike.%${sanitizedSearch}%`);
```

**FIX:**
```typescript
if (filters.search) {
  // Escape backslashes too
  const escaped = filters.search.replace(/[%_\\]/g, '\\$&');
  query = query.or(
    `description.ilike.%${escaped}%,root_cause.ilike.%${escaped}%`
  );
}
```

**Test:**
```bash
curl 'http://localhost:3000/api/waste-incidents?search="; DROP TABLE users;--'
```

**Time:** 30 min

---

## 🔴 C2: Race Condition in Process Advancement

**File:** `lib/services/process-excellence/process-excellence-service.ts:371-434`

**Problem:** Multiple concurrent calls can corrupt stage_history

**FIX:** Add retry logic with exponential backoff
```typescript
static async advanceStage(
  instanceId: string,
  newStage: string,
  isValueAdd?: boolean,
  maxRetries = 3
): Promise<ProcessInstance> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // ... existing logic
      
      const { data, error } = await this.supabase
        .from('process_instances')
        .update({ current_stage: newStage, stage_history: history })
        .eq('id', instanceId)
        .eq('updated_at', instance.updated_at) // Optimistic lock
        .select('...')
        .single();

      if (error) {
        if (error.code === 'PGRST116' && attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
          continue;
        }
        throw error;
      }

      return data;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
}
```

**Test:** Run 10 simultaneous advanceStage calls

**Time:** 2 hours

---

## 🔴 C3: Missing Null Safety in ABCD Calculations

**Files:** OKR service layer, database views

**FIX:** Add validation in service + database constraint
```typescript
static async updateProcessRating(keyResultId: string, rating: number, notes?: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Process rating must be an integer between 1 and 5');
  }
  // ... rest of update
}
```

**Database:**
```sql
ALTER TABLE okr_key_results
ADD CONSTRAINT process_rating_valid
CHECK (process_rating IS NULL OR (process_rating >= 1 AND process_rating <= 5));
```

**Time:** 1 hour

---

## 🔴 C4: Financial Calculation Precision Loss

**File:** `lib/services/billing/copq/billing-copq-service.ts`

**FIX:** Store money as integers (paise)

**Migration:**
```sql
-- Add new columns
ALTER TABLE billing_copq_incidents
ADD COLUMN visible_cost_paise INTEGER;

-- Migrate data
UPDATE billing_copq_incidents
SET visible_cost_paise = ROUND(visible_cost * 100);

-- Drop old column, rename new
ALTER TABLE billing_copq_incidents
DROP COLUMN visible_cost,
RENAME COLUMN visible_cost_paise TO visible_cost;
```

**Service Layer:**
```typescript
// Store as paise, display as rupees
const visibleCostRupees = incident.visible_cost / 100;
```

**Time:** 3 hours (includes migration testing)

---

## 🔴 C5: Cross-Institution Data Leakage

**Files:** All service layers

**FIX 1:** Make institutionId REQUIRED
```typescript
static async getIncident(id: string, institutionId: string): Promise<BillingCOPQIncident> {
  if (!institutionId) throw new Error('Institution ID required');
  
  const query = this.supabase
    .from('billing_copq_incidents')
    .select('*')
    .eq('id', id)
    .eq('institution_id', institutionId); // ALWAYS filter

  // ...
}
```

**FIX 2:** Enable RLS
```sql
-- Enable RLS on all tables
ALTER TABLE billing_copq_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE okr_key_results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY copq_institution_isolation ON billing_copq_incidents
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id
      FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );

-- Repeat for other tables
```

**Test:**
1. User A creates COPQ incident in Institution 1
2. User B (from Institution 2) tries to access it
3. Should get "not found or access denied"

**Time:** 4 hours

---

## 🔴 C6: Unvalidated Financial Inputs

**File:** `app/(routes)/process-excellence/waste/new/page.tsx`

**FIX:** Add strict validation
```typescript
// In validation schema
export const createWasteIncidentSchema = z.object({
  estimated_time_lost_hours: z
    .number()
    .min(0)
    .max(10000)
    .multipleOf(0.5)
    .optional()
    .nullable(),
    
  estimated_cost_impact: z
    .number()
    .int()
    .min(0)
    .max(100000000) // 10 crore max
    .optional()
    .nullable(),
});

// In component
onChange={(e) => {
  const val = parseFloat(e.target.value);
  if (isNaN(val) || !isFinite(val)) {
    field.onChange(undefined);
    return;
  }
  const rounded = Math.round(val * 2) / 2;
  field.onChange(rounded);
}}
```

**Time:** 1 hour

---

## 🔴 C7: Silent Error Swallowing

**File:** `lib/services/process-excellence/process-excellence-service.ts:691-712`

**Current:**
```typescript
if (metricsError) {
  console.warn('[process-excellence] Could not generate metrics:', metricsError);
}
const metrics = metricsResult || { /* defaults */ };
// Continues silently...
```

**FIX:**
```typescript
if (metricsError) {
  console.error('[process-excellence] Metrics generation failed:', metricsError);
  throw new Error(
    `Failed to generate audit metrics: ${metricsError.message}. ` +
    'Please check the audit period and ensure there is data available.'
  );
}
```

**Time:** 30 min

---

## 🔴 C8: Unbounded Query DoS

**Files:** All service layers

**FIX:** Enforce server-side limits
```typescript
static async getWasteIncidents(filters: WasteIncidentFilters = {}) {
  const MAX_LIMIT = 100;
  const limit = Math.min(filters.limit || 10, MAX_LIMIT);
  const page = filters.page || 1;

  // ... query building

  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await query;

  if (count && count > limit && page === 1) {
    console.warn(
      `[process-excellence] Large result set (${count} items). ` +
      `Showing first ${limit}. Use pagination.`
    );
  }

  return { data, metadata: { total: count, page, limit, totalPages: Math.ceil(count / limit) } };
}
```

**Time:** 1 hour

---

## ✅ Verification Checklist

After fixing all critical issues:

- [ ] C1: SQL injection tests pass
- [ ] C2: Concurrent update tests pass
- [ ] C3: Invalid ratings rejected
- [ ] C4: Financial calculations accurate to paisa
- [ ] C5: Cross-institution access blocked
- [ ] C6: Invalid inputs rejected
- [ ] C7: Errors properly reported
- [ ] C8: Pagination limits enforced

---

## Total Estimated Time: 12-15 hours

**Recommended Approach:**
- Day 1: C5 (RLS policies) + C1 (SQL injection)
- Day 2: C4 (financial precision) + C2 (race condition)
- Day 3: C3, C6, C7, C8 + testing

---

**Status:** BLOCKING PRODUCTION DEPLOYMENT
**Priority:** IMMEDIATE
**Owner:** TBD
**Due Date:** ASAP
