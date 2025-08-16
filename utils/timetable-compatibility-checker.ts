// =====================================================
// TIMETABLE COMPATIBILITY CHECKER
// =====================================================
// Run this to check if your database has been migrated to JSON structure

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export async function checkTimetableStructure() {
  const supabase = createClientComponentClient();

  try {
    console.log('🔍 Checking timetable structure...');

    // Check if new JSON structure exists
    const { data: newStructure, error: newError } = await supabase
      .from('timetables')
      .select('id, timetable_data, periods')
      .limit(1);

    // Check if old structure still exists (should be renamed to _old after migration)
    const { data: oldStructure, error: oldError } = await supabase
      .from('timetable_slots_old')
      .select('id')
      .limit(1);

    // Check if backup tables exist
    const { data: backupTables, error: backupError } = await supabase
      .from('timetables_old')
      .select('id')
      .limit(1);

    const results = {
      hasJsonStructure:
        !newError &&
        newStructure &&
        newStructure.length > 0 &&
        newStructure[0]?.timetable_data,
      hasOldStructure: !oldError, // This checks if _old tables exist (good sign)
      hasBackupTables: !backupError,
      migrationComplete: false,
      recommendations: [] as string[]
    };

    console.log('📊 Structure Analysis:', {
      'JSON Structure': results.hasJsonStructure ? '✅ Found' : '❌ Not found',
      'Old Structure Backup': results.hasOldStructure
        ? '✅ Backed up as _old tables'
        : '⚠️  No backup found',
      'Backup Tables': results.hasBackupTables ? '✅ Found' : '❌ Not found'
    });

    // Analyze migration status
    if (
      results.hasJsonStructure &&
      results.hasOldStructure &&
      results.hasBackupTables
    ) {
      results.migrationComplete = true;
      results.recommendations.push(
        '✅ Migration complete - using JSON structure'
      );
      results.recommendations.push(
        '📈 Old tables safely backed up with _old suffix'
      );
      results.recommendations.push(
        '🚀 Should see ~98% reduction in timetable records'
      );
    } else if (results.hasJsonStructure && !results.hasOldStructure) {
      results.recommendations.push(
        '⚠️  JSON structure exists but no backup found'
      );
      results.recommendations.push(
        '🔍 Migration may have been applied without backup'
      );
      results.recommendations.push('✅ Current structure should be working');
    } else if (!results.hasJsonStructure) {
      results.recommendations.push(
        '❌ JSON structure not found - migration not applied'
      );
      results.recommendations.push(
        '📝 Run: database_migration_timetables_json_optimization_final.sql'
      );
      results.recommendations.push(
        '⚡ Expected benefits: 98% record reduction, faster queries'
      );
    } else {
      results.recommendations.push(
        '❓ Unknown state - check database manually'
      );
    }

    // Check for new utility functions
    try {
      await supabase.rpc('get_all_timetable_slots', {
        p_timetable_id: '00000000-0000-0000-0000-000000000000'
      });
    } catch (funcError: any) {
      if (
        funcError.message?.includes(
          'function public.get_all_timetable_slots does not exist'
        )
      ) {
        results.recommendations.push(
          '⚠️  New utility functions not found - migration incomplete'
        );
        results.recommendations.push(
          '📝 Missing: get_all_timetable_slots, update_timetable_slot, delete_timetable_slot'
        );
      }
    }

    return results;
  } catch (error) {
    console.error('❌ Error checking timetable structure:', error);
    return {
      hasJsonStructure: false,
      hasOldStructure: false,
      hasBackupTables: false,
      migrationComplete: false,
      recommendations: ['❌ Error checking database structure'],
      error: error
    };
  }
}

export async function getPerformanceStats() {
  const supabase = createClientComponentClient();

  try {
    const { data: stats, error } = await supabase
      .from('timetable_optimization_stats')
      .select('*');

    if (error) {
      console.log(
        '📊 Performance stats view not found (expected if migration not run)'
      );
      return null;
    }

    return stats;
  } catch (error) {
    console.log('📊 Could not fetch performance stats:', error);
    return null;
  }
}

// Usage function for testing
export async function runCompatibilityCheck() {
  console.log('🚀 Starting Timetable Compatibility Check...\n');

  const structureStatus = await checkTimetableStructure();

  console.log('📋 Migration Status:');
  structureStatus.recommendations.forEach((rec) => console.log(`   ${rec}`));

  if (structureStatus.migrationComplete) {
    console.log('\n📊 Fetching performance statistics...');
    const perfStats = await getPerformanceStats();

    if (perfStats) {
      console.log('\n📈 Performance Comparison:');
      perfStats.forEach((stat) => {
        console.log(
          `   ${stat.table_name}: ${stat.record_count} records (${stat.table_size})`
        );
      });
    }
  }

  return structureStatus;
}

// Example usage:
// import { runCompatibilityCheck } from '@/utils/timetable-compatibility-checker';
// const status = await runCompatibilityCheck();
