#!/usr/bin/env ts-node

// ============================================
// BATCH AUTO-FILL: School Learner Defaults
// ============================================
// Purpose: Retroactively assign K-12 Program degree and Academic department
// to all existing learners at school institutions who lack proper defaults.
//
// Usage: npm run batch:autofill-schools
// Env: Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// ============================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Batch Auto-Fill] ERROR: Missing Supabase environment variables');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface School {
  id: string;
  institution_name: string;
}

interface BatchResult {
  schoolName: string;
  schoolId: string;
  learnersProcessed: number;
  learnersUpdated: number;
  errors: string[];
}

async function batchAutofillSchoolLearners(): Promise<void> {
  console.log('[Batch Auto-Fill] Starting...\n');
  const results: BatchResult[] = [];
  const startTime = Date.now();

  try {
    // 1. Find all school institutions
    console.log('[Batch Auto-Fill] Fetching school institutions...');
    const { data: schools, error: schoolsError } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('entity_type', 'school')
      .order('name');

    if (schoolsError) {
      throw new Error(`Failed to fetch schools: ${schoolsError.message}`);
    }

    if (!schools || schools.length === 0) {
      console.log('[Batch Auto-Fill] No school institutions found. Exiting.');
      return;
    }

    console.log(`[Batch Auto-Fill] Found ${schools.length} school institution(s)\n`);

    // 2. Process each school
    for (const school of schools) {
      const result: BatchResult = {
        schoolName: school.name,
        schoolId: school.id,
        learnersProcessed: 0,
        learnersUpdated: 0,
        errors: [],
      };

      try {
        console.log(`[${school.name}] Processing...`);

        // Ensure K-12 Program degree exists (search by name, not hard-coded degree_id)
        const { data: existingDegree, error: degreeCheckError } = await supabase
          .from('degrees')
          .select('id')
          .eq('degree_name', 'K-12 Program')
          .eq('institution_id', school.id)
          .maybeSingle();

        if (degreeCheckError) throw degreeCheckError;

        let degreeId = existingDegree?.id;

        if (!degreeId) {
          console.log(`  ├─ Creating K-12 Program degree...`);
          const { data: newDegree, error: degreeError } = await supabase
            .from('degrees')
            .insert([
              {
                institution_id: school.id,
                degree_name: 'K-12 Program',
                degree_id: 'K-12',
                degree_type: 'ug',
              },
            ])
            .select('id')
            .single();

          if (degreeError) {
            throw new Error(`Failed to create degree: ${degreeError.message}`);
          }

          degreeId = newDegree.id;
        }

        // Ensure Academic department exists for this degree
        const { data: existingDept, error: deptCheckError } = await supabase
          .from('departments')
          .select('id')
          .eq('department_name', 'Academic')
          .eq('degree_id', degreeId)
          .maybeSingle();

        if (deptCheckError) throw deptCheckError;

        let deptId = existingDept?.id;

        if (!deptId) {
          console.log(`  ├─ Creating Academic department...`);
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
            .select('id')
            .single();

          if (deptError) {
            throw new Error(`Failed to create department: ${deptError.message}`);
          }

          deptId = newDept.id;
        }

        // Find learners at this school without K-12 Program degree
        console.log(`  ├─ Finding learners without K-12 Program degree...`);
        const { data: learnersNeedingUpdate, error: learnersError } = await supabase
          .from('learners_profiles')
          .select('id')
          .eq('institution_id', school.id)
          .not('degree_id', 'eq', degreeId);

        if (learnersError) throw learnersError;

        result.learnersProcessed = learnersNeedingUpdate?.length || 0;

        if (result.learnersProcessed > 0) {
          console.log(`  ├─ Updating ${result.learnersProcessed} learner(s)...`);

          // Batch update in chunks of 500
          const chunkSize = 500;
          const totalChunks = Math.ceil(result.learnersProcessed / chunkSize);

          for (let i = 0; i < result.learnersProcessed; i += chunkSize) {
            const chunkNumber = Math.floor(i / chunkSize) + 1;
            const chunk = learnersNeedingUpdate!.slice(i, i + chunkSize);
            const learnerIds = chunk.map(l => l.id);

            console.log(
              `  │  ├─ Batch ${chunkNumber}/${totalChunks} (${chunk.length} learners)...`
            );

            const { error: updateError } = await supabase
              .from('learners_profiles')
              .update({
                degree_id: degreeId,
                department_id: deptId,
                updated_at: new Date().toISOString(),
              })
              .in('id', learnerIds);

            if (updateError) {
              throw new Error(`Failed to update batch ${chunkNumber}: ${updateError.message}`);
            }

            result.learnersUpdated += chunk.length;
          }

          console.log(
            `  └─ ✓ Successfully updated ${result.learnersUpdated}/${result.learnersProcessed} learner(s)\n`
          );
        } else {
          console.log(`  └─ ✓ All learners already have K-12 Program degree\n`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.errors.push(errorMsg);
        console.error(`  └─ ERROR: ${errorMsg}\n`);
      }

      results.push(result);
    }

    // Summary
    console.log('\n[Batch Auto-Fill] SUMMARY:');
    console.log('═'.repeat(60));

    let totalProcessed = 0;
    let totalUpdated = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const result of results) {
      const status = result.errors.length === 0 ? '✓' : '✗';
      console.log(
        `${status} ${result.schoolName}: ${result.learnersProcessed} checked, ${result.learnersUpdated} updated`
      );

      totalProcessed += result.learnersProcessed;
      totalUpdated += result.learnersUpdated;

      if (result.errors.length > 0) {
        console.log(`  └─ Error: ${result.errors[0]}`);
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log('═'.repeat(60));
    console.log(
      `Total: ${totalProcessed} learner(s) checked, ${totalUpdated} updated, ${successCount} school(s) succeeded`
    );

    if (errorCount > 0) {
      console.log(`Warning: ${errorCount} school(s) had errors`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n[Batch Auto-Fill] Complete in ${elapsed}s ✓`);

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n[Batch Auto-Fill] FATAL ERROR:', err);
    process.exit(1);
  }
}

batchAutofillSchoolLearners();
