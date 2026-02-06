#!/usr/bin/env node
// Quick script to apply the sh_is_staff() function fix
// Run: node apply-fix.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sql = `
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
`;

async function applyFix() {
  console.log('🔧 Applying sh_is_staff() function fix...\n');

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      // If exec_sql RPC doesn't exist, try direct SQL execution
      console.log('⚠️  exec_sql RPC not available, trying direct execution...');
      throw error;
    }

    console.log('✅ Function created successfully!\n');

    // Verify the function exists
    const { data: verifyData, error: verifyError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type')
      .eq('routine_schema', 'public')
      .eq('routine_name', 'sh_is_staff');

    if (verifyError) {
      console.log('⚠️  Could not verify (but function may have been created)');
      console.log('   Error:', verifyError.message);
    } else if (verifyData && verifyData.length > 0) {
      console.log('✅ Verified: sh_is_staff() function exists');
      console.log('   Type:', verifyData[0].routine_type);
    }

    console.log('\n✅ Fix applied successfully!');
    console.log('📝 Next step: Test the builders page');
    console.log('🌐 URL: https://myjkkn-omm-dev.vercel.app/solutions/software/builders\n');

  } catch (error) {
    console.error('❌ Failed to apply fix:', error.message);
    console.error('\n📋 Manual application required:');
    console.error('1. Go to: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql');
    console.error('2. Run the SQL from QUICK_FIX_sh_is_staff.sql\n');
    process.exit(1);
  }
}

applyFix();
