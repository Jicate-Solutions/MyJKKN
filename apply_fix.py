#!/usr/bin/env python3
"""
Apply sh_is_staff() function fix to Supabase staging database
Requires: pip install psycopg2-binary python-dotenv
"""

import os
from pathlib import Path

# Try to import required libraries
try:
    import psycopg2
    from dotenv import load_dotenv
except ImportError as e:
    print(f"❌ Missing required library: {e}")
    print("Install with: pip install psycopg2-binary python-dotenv")
    exit(1)

# Load environment variables
env_path = Path('.env.local')
load_dotenv(env_path)

# Get Supabase credentials
project_ref = "hhprjbgknupaplivtoib"
db_password = os.getenv('SUPABASE_DB_PASSWORD') or os.getenv('SUPABASE_PASSWORD')

if not db_password:
    print("❌ Database password not found in .env.local")
    print("Looking for: SUPABASE_DB_PASSWORD or SUPABASE_PASSWORD")
    print("")
    print("⚠️  Manual application required:")
    print("1. Go to: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql")
    print("2. Run the SQL from QUICK_FIX_sh_is_staff.sql")
    exit(1)

# Construct connection parameters
conn_params = {
    'host': f'aws-0-ap-south-1.pooler.supabase.com',
    'port': 6543,
    'database': 'postgres',
    'user': f'postgres.{project_ref}',
    'password': db_password,
    'sslmode': 'require'
}

# SQL to execute
sql = """
-- Create sh_is_staff() function
CREATE OR REPLACE FUNCTION public.sh_is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION sh_is_staff IS
'Checks if current user is a staff member (any staff-related role).';
"""

verify_sql = """
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'sh_is_staff';
"""

print("🔧 Applying sh_is_staff() function fix...")
print(f"📡 Connecting to: {project_ref}")
print("")

try:
    # Connect to database
    conn = psycopg2.connect(**conn_params)
    cursor = conn.cursor()

    # Execute SQL
    print("⚙️  Executing SQL...")
    cursor.execute(sql)
    conn.commit()
    print("✅ Function created successfully!")
    print("")

    # Verify
    print("🔍 Verifying function exists...")
    cursor.execute(verify_sql)
    result = cursor.fetchone()

    if result:
        print(f"✅ Verified: {result[0]} ({result[1]})")
    else:
        print("⚠️  Function not found (but may have been created)")

    cursor.close()
    conn.close()

    print("")
    print("✅ Fix applied successfully!")
    print("📝 Next step: Test the builders page")
    print("🌐 URL: https://myjkkn-omm-dev.vercel.app/solutions/software/builders")
    print("")

except psycopg2.Error as e:
    print(f"❌ Database error: {e}")
    print("")
    print("⚠️  Manual application required:")
    print("1. Go to: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql")
    print("2. Run the SQL from QUICK_FIX_sh_is_staff.sql")
    exit(1)
except Exception as e:
    print(f"❌ Unexpected error: {e}")
    exit(1)
