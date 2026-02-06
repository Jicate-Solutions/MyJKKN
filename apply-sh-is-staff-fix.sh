#!/bin/bash
# Apply sh_is_staff() function fix using curl and Supabase REST API

set -e

# Load environment variables
source .env.local

# SQL to execute
SQL_QUERY="CREATE OR REPLACE FUNCTION public.sh_is_staff() RETURNS BOOLEAN AS \$\$ BEGIN RETURN EXISTS ( SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'faculty', 'teaching_staff', 'non_teaching_staff') ); END; \$\$ LANGUAGE plpgsql SECURITY DEFINER;"

echo "🔧 Applying sh_is_staff() function fix..."
echo ""

# Use Supabase REST API to execute SQL via RPC
# Note: This requires a custom RPC function to execute arbitrary SQL, which may not exist
# Alternative: Use direct psql connection

# Check if we can use supabase CLI to execute
if command -v ~/bin/supabase &> /dev/null; then
    echo "📝 Creating temporary SQL file..."
    cat > /tmp/apply_fix.sql << 'EOF'
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
EOF

    echo "✅ SQL file created at /tmp/apply_fix.sql"
    echo ""
    echo "⚠️  Manual application required:"
    echo "1. Go to: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql"
    echo "2. Copy and paste the SQL from /tmp/apply_fix.sql"
    echo "3. Click 'Run'"
    echo ""
    echo "Or use psql if available:"
    echo "psql 'postgresql://postgres:[YOUR_PASSWORD]@db.hhprjbgknupaplivtoib.supabase.co:5432/postgres' -f /tmp/apply_fix.sql"
else
    echo "❌ Supabase CLI not found"
fi
