/**
 * Migration Script: Add section_id to existing attendance records
 *
 * This script backfills section_id for all students in existing attendance_data.
 * It fetches each student's current section_id from the students table and adds it
 * to the attendance record.
 *
 * Note: This uses CURRENT section_id, which may not be 100% historically accurate
 * if students have transferred sections. However, it's better than having no section_id.
 *
 * Run with: npx ts-node scripts/migrate-attendance-section-ids.ts
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface AttendanceStudent {
  student_id: string;
  section_id?: string;
  status: 'Present' | 'Absent';
  marked_at: string;
}

interface AttendancePeriod {
  period_id: string;
  period_name: string;
  students: AttendanceStudent[];
  [key: string]: any;
}

interface AttendanceData {
  [periodId: string]: AttendancePeriod;
}

interface AttendanceRecord {
  id: string;
  attendance_data: AttendanceData;
}

async function migrateAttendanceSectionIds() {
  console.log('🚀 Starting attendance section_id migration...\n');

  try {
    // Step 1: Fetch all attendance records
    console.log('📊 Fetching all attendance records...');
    const { data: attendanceRecords, error: fetchError } = await supabase
      .from('student_attendance')
      .select('id, attendance_data');

    if (fetchError) {
      throw fetchError;
    }

    console.log(`✅ Found ${attendanceRecords?.length || 0} attendance records\n`);

    if (!attendanceRecords || attendanceRecords.length === 0) {
      console.log('✅ No records to migrate. Exiting.');
      return;
    }

    let totalRecordsUpdated = 0;
    let totalStudentsUpdated = 0;
    let totalStudentsAlreadyHaveSection = 0;
    let totalStudentsNotFound = 0;

    // Step 2: Process each attendance record
    for (const record of attendanceRecords as AttendanceRecord[]) {
      let recordUpdated = false;
      const attendanceData = record.attendance_data;

      if (!attendanceData || typeof attendanceData !== 'object') {
        console.log(`⚠️  Record ${record.id}: Invalid attendance_data, skipping`);
        continue;
      }

      const updatedAttendanceData: AttendanceData = { ...attendanceData };

      // Step 3: Process each period in the record
      for (const periodId in attendanceData) {
        const period = attendanceData[periodId];

        if (!period.students || !Array.isArray(period.students)) {
          continue;
        }

        const updatedStudents: AttendanceStudent[] = [];

        // Step 4: Process each student in the period
        for (const student of period.students) {
          // Check if student already has section_id
          if (student.section_id) {
            totalStudentsAlreadyHaveSection++;
            updatedStudents.push(student);
            continue;
          }

          // Fetch student's current section_id from students table
          const { data: studentData, error: studentError } = await supabase
            .from('students')
            .select('section_id')
            .eq('id', student.student_id)
            .maybeSingle();

          if (studentError) {
            console.error(`❌ Error fetching student ${student.student_id}:`, studentError.message);
            totalStudentsNotFound++;
            updatedStudents.push(student);
            continue;
          }

          if (!studentData || !studentData.section_id) {
            console.log(`⚠️  Student ${student.student_id} not found or has no section_id`);
            totalStudentsNotFound++;
            updatedStudents.push(student);
            continue;
          }

          // Add section_id to student record
          updatedStudents.push({
            ...student,
            section_id: studentData.section_id
          });

          totalStudentsUpdated++;
          recordUpdated = true;
        }

        // Update period with updated students
        updatedAttendanceData[periodId] = {
          ...period,
          students: updatedStudents
        };
      }

      // Step 5: Update record if any students were updated
      if (recordUpdated) {
        const { error: updateError } = await supabase
          .from('student_attendance')
          .update({ attendance_data: updatedAttendanceData })
          .eq('id', record.id);

        if (updateError) {
          console.error(`❌ Error updating record ${record.id}:`, updateError.message);
        } else {
          totalRecordsUpdated++;
          console.log(`✅ Updated record ${record.id}`);
        }
      }
    }

    // Step 6: Summary
    console.log('\n📊 Migration Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total attendance records processed: ${attendanceRecords.length}`);
    console.log(`Total attendance records updated: ${totalRecordsUpdated}`);
    console.log(`Total students updated with section_id: ${totalStudentsUpdated}`);
    console.log(`Total students already had section_id: ${totalStudentsAlreadyHaveSection}`);
    console.log(`Total students not found/no section: ${totalStudentsNotFound}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateAttendanceSectionIds();
