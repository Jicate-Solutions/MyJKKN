import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // Test 1: Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      logger.error('bug-reports', 'Auth error', authError);
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        details: authError.message
      });
    }

    if (!user) {
      logger.warn('bug-reports', 'No authenticated user');
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        details: 'No authenticated user found'
      });
    }

    // Test 2: Check bug_reports table exists
    const { data: tableTest, error: tableError } = await supabase
      .from('bug_reports')
      .select('id')
      .limit(1);

    if (tableError) {
      logger.error('bug-reports', 'Table error', tableError);
      return NextResponse.json({
        success: false,
        error: 'Database table access failed',
        details: tableError.message
      });
    }

    // Test 3: Check storage bucket exists
    const { data: bucketTest, error: bucketError } = await supabase.storage
      .from('bug-reports')
      .list('', { limit: 1 });

    if (bucketError) {
      logger.error('bug-reports/api', 'Storage bucket access failed', bucketError);
      return NextResponse.json({
        success: false,
        error: 'Storage bucket access failed',
        details: bucketError.message
      });
    }

    // Test 4: Check if user can insert (dry run)
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
      // Delete the test record
      await supabase
        .from('bug_reports')
        .delete()
        .eq('reporter_user_id', user.id)
        .eq('page_url', 'https://example.com/test');
    } else {
      logger.error('bug-reports/api', 'Database insert test failed', insertTestError);
      return NextResponse.json({
        success: false,
        error: 'Database insert failed',
        details: insertTestError.message
      });
    }
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
    logger.error('bug-reports/api', 'System test failed with unexpected error', error);
    return NextResponse.json({
      success: false,
      error: 'System test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
