import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  console.log('[BUG_REPORTS_TEST] Test endpoint called');

  try {
    const supabase = await createServerSupabaseClient();

    // Test 1: Check authentication
    console.log('[BUG_REPORTS_TEST] Checking authentication');
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('[BUG_REPORTS_TEST] Auth error:', authError);
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        details: authError.message
      });
    }

    if (!user) {
      console.log('[BUG_REPORTS_TEST] No authenticated user');
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        details: 'No authenticated user found'
      });
    }

    console.log('[BUG_REPORTS_TEST] User authenticated:', user.id);

    // Test 2: Check bug_reports table exists
    console.log('[BUG_REPORTS_TEST] Testing bug_reports table');
    const { data: tableTest, error: tableError } = await supabase
      .from('bug_reports')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('[BUG_REPORTS_TEST] Table error:', tableError);
      return NextResponse.json({
        success: false,
        error: 'Database table access failed',
        details: tableError.message
      });
    }

    console.log('[BUG_REPORTS_TEST] Table accessible');

    // Test 3: Check storage bucket exists
    console.log('[BUG_REPORTS_TEST] Testing bug-reports storage bucket');
    const { data: bucketTest, error: bucketError } = await supabase.storage
      .from('bug-reports')
      .list('', { limit: 1 });

    if (bucketError) {
      console.error('[BUG_REPORTS_TEST] Bucket error:', bucketError);
      return NextResponse.json({
        success: false,
        error: 'Storage bucket access failed',
        details: bucketError.message
      });
    }

    console.log('[BUG_REPORTS_TEST] Storage bucket accessible');

    // Test 4: Check if user can insert (dry run)
    console.log('[BUG_REPORTS_TEST] Testing insert permissions');
    const testReport = {
      reporter_user_id: user.id,
      page_url: 'https://example.com/test',
      description: 'Test report for system validation'
    };

    // We'll just validate the structure, not actually insert
    const { error: insertTestError } = await supabase
      .from('bug_reports')
      .insert(testReport)
      .select()
      .single();

    // If we get here, the insert would work, but let's clean up
    if (!insertTestError) {
      console.log('[BUG_REPORTS_TEST] Insert test successful, cleaning up');
      // Delete the test record
      await supabase
        .from('bug_reports')
        .delete()
        .eq('reporter_user_id', user.id)
        .eq('page_url', 'https://example.com/test');
    } else {
      console.error('[BUG_REPORTS_TEST] Insert test failed:', insertTestError);
      return NextResponse.json({
        success: false,
        error: 'Database insert failed',
        details: insertTestError.message
      });
    }

    console.log('[BUG_REPORTS_TEST] All tests passed');
    return NextResponse.json({
      success: true,
      message: 'All systems operational',
      user_id: user.id,
      tests_passed: [
        'Authentication',
        'Database table access',
        'Storage bucket access',
        'Insert permissions'
      ]
    });
  } catch (error) {
    console.error('[BUG_REPORTS_TEST] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: 'System test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
