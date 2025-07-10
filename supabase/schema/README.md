# MyJKKN Database Schema

This directory contains the complete database schema for the MyJKKN project, extracted from the existing Supabase database.

## Schema Files

The schema is organized into logical files for better maintainability:

1. **00_extensions.sql** - Database extensions (UUID, crypto, etc.)
2. **01_types.sql** - Custom types and enums
3. **02_tables.sql** - All table definitions
4. **03_indexes.sql** - Database indexes for performance
5. **04_functions.sql** - Stored procedures and functions
6. **05_triggers.sql** - Database triggers
7. **06_views.sql** - Views and materialized views
8. **07_rls.sql** - Row Level Security policies
9. **master_schema.sql** - Combined schema file that includes all others

## How to Use

### Option 1: Using Individual Files (Recommended for Development)

1. Create a new Supabase project
2. Go to the SQL Editor in your Supabase dashboard
3. Run each file in numerical order:
   - First run `00_extensions.sql`
   - Then run `01_types.sql`
   - Continue with each file in order
   - Finally run `07_rls.sql`

### Option 2: Using the Master Schema File

The `master_schema.sql` file uses PostgreSQL's `\i` command to include all files in the correct order. However, this only works when running from psql command line:

```bash
psql -h <your-db-host> -U postgres -d postgres -f master_schema.sql
```

### Option 3: Combined Single File

If you need a single file with all SQL combined, you can create one:

```bash
cat 00_extensions.sql 01_types.sql 02_tables.sql 03_indexes.sql 04_functions.sql 05_triggers.sql 06_views.sql 07_rls.sql > complete_schema.sql
```

Then run this file in the Supabase SQL editor.

## Important Notes

1. **Supabase Auth**: The schema references `auth.users` table which is automatically created by Supabase. Make sure you have authentication enabled.

2. **Storage Buckets**: After setting up the database, create these storage buckets in Supabase:

   - `avatars` - For user profile pictures
   - `documents` - For general document storage
   - `staff-photos` - For staff photos
   - `student-photos` - For student photos

3. **Environment Variables**: Your application will need these environment variables:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (for admin operations)

4. **Materialized Views**: The schema includes materialized views that need periodic refresh. Consider setting up pg_cron jobs:

   ```sql
   -- Run after enabling pg_cron extension
   SELECT cron.schedule('refresh-activity-stats', '0 */6 * * *', 'REFRESH MATERIALIZED VIEW activity_stats;');
   SELECT cron.schedule('refresh-billing-summary', '0 2 * * *', 'REFRESH MATERIALIZED VIEW mv_student_billing_summary;');
   ```

5. **Initial Data**: After schema creation, you may want to:
   - Create an institution record
   - Set up initial admin user
   - Configure billing categories
   - Set up academic structure (degrees, departments, etc.)

## Troubleshooting

- **Foreign Key Errors**: Make sure to run files in the correct order
- **Type Already Exists**: If re-running scripts, you may need to drop types first
- **Permission Errors**: Make sure you're connected as a superuser (postgres)
- **RLS Policies**: Remember that RLS is enabled on all tables, so direct table access requires appropriate policies

## Maintenance

- Regularly backup your database
- Monitor query performance and add indexes as needed
- Review and update RLS policies as requirements change
- Keep materialized views refreshed for optimal performance
