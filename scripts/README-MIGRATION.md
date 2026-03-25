# Attendance Section ID Migration

## Overview

This migration script adds `section_id` to all students in existing attendance records. This change enables historical accuracy for student sections, preventing issues when students transfer or get promoted to different sections.

## Why is this needed?

### Before (Old Structure):
```json
{
  "period_id": {
    "students": [
      {
        "student_id": "uuid",
        "status": "Present",
        "marked_at": "2025-10-08T..."
      }
    ]
  }
}
```
**Problem**: When displaying reports, we fetch section from `students` table. If student transfers to a new section, old reports show the NEW section (incorrect).

### After (New Structure):
```json
{
  "period_id": {
    "students": [
      {
        "student_id": "uuid",
        "section_id": "uuid",  // ✅ Frozen at time of marking
        "status": "Present",
        "marked_at": "2025-10-08T..."
      }
    ]
  }
}
```
**Benefit**: Section is frozen at the time attendance was marked. Student transfers don't affect historical data.

## Prerequisites

1. Ensure you have the following environment variables set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Install dependencies:
   ```bash
   npm install
   ```

## How to Run

### Option 1: Using ts-node (Recommended)
```bash
npx ts-node scripts/migrate-attendance-section-ids.ts
```

### Option 2: Using tsx
```bash
npx tsx scripts/migrate-attendance-section-ids.ts
```

### Option 3: Compile and run
```bash
npx tsc scripts/migrate-attendance-section-ids.ts
node scripts/migrate-attendance-section-ids.js
```

## What the Migration Does

1. ✅ Fetches all records from `student_attendance` table
2. ✅ For each record, iterates through `attendance_data` periods
3. ✅ For each student in each period:
   - Checks if `section_id` already exists (skip if yes)
   - Fetches student's current `section_id` from `students` table
   - Adds `section_id` to the student record in `attendance_data`
4. ✅ Updates the record with the modified `attendance_data`
5. ✅ Displays summary statistics

## Important Notes

⚠️ **Historical Accuracy Limitation**: This migration uses the student's CURRENT section_id from the students table. If a student has already transferred sections, the migrated data will reflect their current section, NOT their section at the time attendance was marked.

**For truly accurate historical data**: This migration should be run BEFORE any students are promoted or transferred to different sections.

**Going Forward**: All NEW attendance records will automatically include section_id at the time of marking, preserving perfect historical accuracy.

## Migration Output

The script will display:
- Total attendance records processed
- Total attendance records updated
- Total students updated with section_id
- Total students that already had section_id
- Total students not found or with no section

Example:
```
📊 Migration Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total attendance records processed: 150
Total attendance records updated: 145
Total students updated with section_id: 4,320
Total students already had section_id: 0
Total students not found/no section: 15
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Rollback

If you need to rollback this migration, you can:

1. **Restore from backup** (if you created one before running migration)
2. **Remove section_id manually**:
   ```sql
   -- This is complex due to JSONB structure
   -- It's recommended to restore from backup instead
   ```

## Recommendations

1. ✅ **Backup your database** before running the migration
2. ✅ Run the migration during low-traffic hours
3. ✅ Test on a staging environment first
4. ✅ Run the migration BEFORE any student promotions/transfers

## Future Attendance Records

After this migration, all NEW attendance records will automatically include `section_id` when marked. No further action is needed.

## Troubleshooting

### Error: "Missing Supabase environment variables"
- Ensure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in your `.env` file

### Error: "Cannot find module '@supabase/supabase-js'"
- Run `npm install` to install dependencies

### Students not found / no section_id
- Some students may have been deleted or have no section assigned
- These will be logged and skipped

## Support

If you encounter issues, check:
1. Environment variables are correctly set
2. Database connection is working
3. Service role key has necessary permissions
4. Review the migration script logs for specific error messages
