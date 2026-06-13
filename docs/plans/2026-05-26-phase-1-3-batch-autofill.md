# Phase 1.3: Batch Auto-Fill for Existing School Learners

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Retroactively assign K-12 Program degree and Academic department to all existing learners at school institutions who lack proper defaults.

**Architecture:** Query learners at schools (entity_type='school') without K-12 Program degree, create virtual records if missing (idempotent), batch update learner degree/department IDs.

**Tech Stack:** TypeScript, Supabase, SchoolDefaultsService (existing), SQL batch operations

---

## Task 1: Create Batch Auto-Fill Utility Script

**Files:**
- Create: `scripts/batch-autofill-school-learners.ts`

**Step 1: Write the utility script**

Create file with TypeScript that:
1. Connects to Supabase
2. Finds all school institutions (entity_type='school')
3. For each school, ensures K-12 Program degree exists (idempotent)
4. Ensures Academic department exists under degree (idempotent)
5. Finds all learners at that school without the K-12 Program degree
6. Updates those learners to use school defaults
7. Logs progress and counts

```typescript
// scripts/batch-autofill-school-learners.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface BatchResult {
  schoolName: string;
  schoolId: string;
  learnersProcessed: number;
  learnersUpdated: number;
  errors: string[];
}

async function batchAutofillSchoolLearners(): Promise<void> {
  console.log('[Batch Auto-Fill] Starting...');
  const results: BatchResult[] = [];

  try {
    // 1. Find all school institutions
    const { data: schools, error: schoolsError } = await supabase
      .from('institutions')
      .select('id, institution_name')
      .eq('entity_type', 'school');

    if (schoolsError) throw schoolsError;

    console.log(`[Batch Auto-Fill] Found ${schools.length} school institutions`);

    // 2. Process each school
    for (const school of schools) {
      const result: BatchResult = {
        schoolName: school.institution_name,
        schoolId: school.id,
        learnersProcessed: 0,
        learnersUpdated: 0,
        errors: [],
      };

      try {
        // Ensure K-12 Program degree exists
        const { data: degree } = await supabase
          .from('degrees')
          .select('id')
          .eq('degree_code', 'K12')
          .eq('institution_id', school.id)
          .maybeSingle();

        let degreeId = degree?.id;
        if (!degreeId) {
          console.log(`[${school.institution_name}] Creating K-12 Program degree...`);
          const { data: newDegree, error: degreeError } = await supabase
            .from('degrees')
            .insert([
              {
                institution_id: school.id,
                degree_name: 'K-12 Program',
                degree_code: 'K12',
              },
            ])
            .select()
            .single();

          if (degreeError) throw new Error(`Failed to create degree: ${degreeError.message}`);
          degreeId = newDegree.id;
        }

        // Ensure Academic department exists
        const { data: dept } = await supabase
          .from('departments')
          .select('id')
          .eq('department_code', 'ACAD')
          .eq('degree_id', degreeId)
          .maybeSingle();

        let deptId = dept?.id;
        if (!deptId) {
          console.log(`[${school.institution_name}] Creating Academic department...`);
          const { data: newDept, error: deptError } = await supabase
            .from('departments')
            .insert([
              {
                degree_id: degreeId,
                institution_id: school.id,
                department_name: 'Academic',
                department_code: 'ACAD',
              },
            ])
            .select()
            .single();

          if (deptError) throw new Error(`Failed to create department: ${deptError.message}`);
          deptId = newDept.id;
        }

        // Find learners at this school without K-12 Program degree
        const { data: learnersNeedingUpdate, error: learnersError } = await supabase
          .from('learners_profiles')
          .select('id')
          .eq('institution_id', school.id)
          .neq('degree_id', degreeId);

        if (learnersError) throw learnersError;
        result.learnersProcessed = learnersNeedingUpdate.length;

        if (learnersNeedingUpdate.length > 0) {
          console.log(
            `[${school.institution_name}] Updating ${learnersNeedingUpdate.length} learners...`
          );

          // Batch update in chunks (500 at a time to avoid timeout)
          const chunkSize = 500;
          for (let i = 0; i < learnersNeedingUpdate.length; i += chunkSize) {
            const chunk = learnersNeedingUpdate.slice(i, i + chunkSize);
            const learnerIds = chunk.map(l => l.id);

            const { error: updateError } = await supabase
              .from('learners_profiles')
              .update({
                degree_id: degreeId,
                department_id: deptId,
                updated_at: new Date().toISOString(),
              })
              .in('id', learnerIds);

            if (updateError) throw updateError;
            result.learnersUpdated += chunk.length;
          }
        }

        console.log(
          `[${school.institution_name}] ✓ Processed ${result.learnersProcessed}, updated ${result.learnersUpdated}`
        );
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
        console.error(`[${school.institution_name}] ERROR:`, result.errors[0]);
      }

      results.push(result);
    }

    // Summary
    console.log('\n[Batch Auto-Fill] SUMMARY:');
    let totalProcessed = 0;
    let totalUpdated = 0;
    for (const result of results) {
      console.log(
        `  ${result.schoolName}: ${result.learnersProcessed} checked, ${result.learnersUpdated} updated`
      );
      totalProcessed += result.learnersProcessed;
      totalUpdated += result.learnersUpdated;
      if (result.errors.length > 0) {
        console.log(`    ERROR: ${result.errors[0]}`);
      }
    }
    console.log(`\nTotal: ${totalProcessed} learners checked, ${totalUpdated} updated`);
    console.log('[Batch Auto-Fill] Complete ✓');
  } catch (err) {
    console.error('[Batch Auto-Fill] FATAL ERROR:', err);
    process.exit(1);
  }
}

batchAutofillSchoolLearners();
```

**Step 2: Verify script syntax**

Check file was created: `ls -la scripts/batch-autofill-school-learners.ts`

Expected: File exists, ~150 lines

**Step 3: Add to package.json scripts**

Read current package.json scripts section and add:

```json
"batch:autofill-schools": "ts-node scripts/batch-autofill-school-learners.ts"
```

**Step 4: Commit**

```bash
git add scripts/batch-autofill-school-learners.ts package.json
git commit -m "feat: add batch auto-fill script for existing school learners

- Create K-12 Program degree and Academic department (idempotent)
- Find all learners at schools without proper defaults
- Batch update in chunks of 500 to avoid timeout
- Log progress and summary for audit trail"
```

---

## Task 2: Test Script on Development Database

**Files:**
- Run: `scripts/batch-autofill-school-learners.ts`

**Step 1: Create test data (optional)**

If you want to test with real data from development, create a school learner first:
- Navigate to /learners/profiles/create in the running dev server
- Create a learner at a non-school institution (college)
- Get the learner ID from the URL

Alternatively, use an existing school learner in the database.

**Step 2: Run the batch script**

```bash
npm run batch:autofill-schools
```

Expected output:
```
[Batch Auto-Fill] Starting...
[Batch Auto-Fill] Found N school institutions
[SchoolName] Creating K-12 Program degree...
[SchoolName] Creating Academic department...
[SchoolName] Updating M learners...
[SchoolName] ✓ Processed M, updated M

[Batch Auto-Fill] SUMMARY:
  SchoolName: M checked, M updated

Total: M learners checked, M updated
[Batch Auto-Fill] Complete ✓
```

**Step 3: Verify in database**

```sql
-- Check that school learners now have K-12 Program degree
SELECT COUNT(*) as total_school_learners,
       COUNT(CASE WHEN degree_id IS NOT NULL THEN 1 END) as with_degree
FROM learners_profiles lp
WHERE institution_id IN (SELECT id FROM institutions WHERE entity_type = 'school');

-- Verify all have the same degree
SELECT DISTINCT d.degree_name, d.degree_code
FROM learners_profiles lp
JOIN degrees d ON lp.degree_id = d.id
WHERE lp.institution_id IN (SELECT id FROM institutions WHERE entity_type = 'school');

-- Expected: All show 'K-12 Program' / 'K12'
```

**Step 4: Commit verification**

```bash
git log --oneline -3
```

Expected: Show the batch script commit

---

## Task 3: Document the Batch Process

**Files:**
- Modify: `docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md`

**Step 1: Add Data Migration section**

After "Database Checks" section, add:

```markdown
## Data Migration: Batch Auto-Fill

If you have existing learners at school institutions created before Phase 1.3, you can retroactively assign school defaults using the batch auto-fill script.

### Running the Migration

```bash
npm run batch:autofill-schools
```

### What it does:
1. Finds all school institutions (entity_type='school')
2. Ensures K-12 Program degree exists per school (creates if missing)
3. Ensures Academic department exists per degree (creates if missing)
4. Finds all learners at schools without K-12 Program degree
5. Batch updates learners in chunks (500 at a time)
6. Logs summary: schools processed, learners updated, any errors

### Idempotency:
- Safe to run multiple times
- Will not create duplicate virtual records
- Will not re-update learners already assigned to K-12 Program
- Existing learner data preserved, only degree_id/department_id updated

### Rollback:
If needed, manually update learners back to their original degree/department:
```sql
UPDATE learners_profiles
SET degree_id = (SELECT id FROM degrees WHERE degree_code != 'K12' LIMIT 1),
    department_id = NULL
WHERE institution_id IN (SELECT id FROM institutions WHERE entity_type = 'school');
```
```

**Step 2: Update deferred tasks**

Change line "Add batch auto-fill for existing learners at schools (data migration)" to:

```markdown
- [x] Add batch auto-fill for existing learners at schools (data migration) (completed 2026-05-26)
```

**Step 3: Commit**

```bash
git add docs/PHASE1.2-SCHOOLS-AUTO-FILL-TESTING.md
git commit -m "docs: add data migration guide for batch auto-fill of school learners"
```

---

## Task 4: Final Verification

**Files:**
- Verify: Build, scripts, documentation

**Step 1: Type check the script**

Run: `npx tsc scripts/batch-autofill-school-learners.ts --noEmit --skipLibCheck`

Expected: No TypeScript errors

**Step 2: Verify package.json**

Run: `npm run batch:autofill-schools --help` (or dry-run)

Expected: Script can be invoked without errors

**Step 3: Final git log**

Run: `git log --oneline -5`

Expected: 3 new commits (script, test verification, docs)

**Step 4: Summary**

```bash
echo "Phase 1.3 Task 2 Complete:"
echo "- Batch auto-fill script: scripts/batch-autofill-school-learners.ts"
echo "- Package.json script added: npm run batch:autofill-schools"
echo "- Documentation updated with migration guide"
echo "- All commits in place"
```

---

## Success Criteria

- [x] Batch script handles all school institutions
- [x] K-12 Program degree created per school (idempotent)
- [x] Academic department created per degree (idempotent)
- [x] Learners at schools without defaults are identified
- [x] Batch update works in chunks (500 learners per batch)
- [x] Progress logged to stdout for audit trail
- [x] npm script added to package.json
- [x] Documentation with migration guide
- [x] All commits created

## Rollback

If issues occur:
1. Remove `batch:autofill-schools` from package.json
2. Delete `scripts/batch-autofill-school-learners.ts`
3. Revert documentation changes
4. Run manual SQL rollback if learners were updated:
```sql
UPDATE learners_profiles
SET degree_id = NULL, department_id = NULL
WHERE degree_id = (SELECT id FROM degrees WHERE degree_code = 'K12' LIMIT 1);
```

## Notes

- Script uses Supabase service role key (needs SUPABASE_SERVICE_ROLE_KEY env var)
- Batch size 500 prevents timeout on large institutions
- Idempotent design allows safe re-runs
- Logs include school name, learner counts, any errors for traceability
- No learner data modified except degree_id/department_id
