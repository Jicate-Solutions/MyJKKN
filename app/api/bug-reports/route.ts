import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { dataURLtoFile } from '@/lib/utils/file-converters';

const BUG_REPORTS_BUCKET = 'bug-reports';

const createReportSchema = z.object({
  page_url: z.string().url({ message: 'A valid page URL is required.' }),
  description: z
    .string()
    .min(10, { message: 'Description must be at least 10 characters long.' }),
  screenshot_data_url: z.string().optional(),
  console_logs: z.array(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

export async function POST(request: Request) {
  console.log('[BUG_REPORTS_API] POST request received');

  try {
    console.log('[BUG_REPORTS_API] Creating server Supabase client');
    const supabase = await createServerSupabaseClient();

    console.log('[BUG_REPORTS_API] Checking authentication');
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('[BUG_REPORTS_API] Auth error:', authError);
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          details: authError.message,
          errorCode: 'AUTH_ERROR'
        },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('[BUG_REPORTS_API] No authenticated user found');
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication failed',
          details: 'Auth session missing! Please log in again.',
          errorCode: 'NO_USER'
        },
        { status: 401 }
      );
    }

    console.log('[BUG_REPORTS_API] Authenticated user:', user.id);

    console.log('[BUG_REPORTS_API] Parsing request body');
    let json;
    try {
      json = await request.json();
    } catch (parseError) {
      console.error('[BUG_REPORTS_API] JSON parse error:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
          details:
            parseError instanceof Error
              ? parseError.message
              : 'Could not parse JSON',
          errorCode: 'INVALID_JSON'
        },
        { status: 400 }
      );
    }

    console.log('[BUG_REPORTS_API] Request data:', {
      page_url: json.page_url,
      description: json.description?.substring(0, 100) + '...',
      has_screenshot: !!json.screenshot_data_url,
      console_logs_count: json.console_logs?.length || 0,
      metadata: json.metadata
    });

    console.log('[BUG_REPORTS_API] Validating request data');
    let validatedData;
    try {
      validatedData = createReportSchema.parse(json);
    } catch (validationError) {
      console.error('[BUG_REPORTS_API] Validation error:', validationError);
      if (validationError instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: validationError.errors.map((e) => e.message).join(', '),
            errorCode: 'VALIDATION_ERROR',
            validationErrors: validationError.errors
          },
          { status: 400 }
        );
      }
      throw validationError;
    }

    console.log('[BUG_REPORTS_API] Data validation successful');

    // Test database connection first
    console.log('[BUG_REPORTS_API] Testing database connection');
    const { error: dbTestError } = await supabase
      .from('bug_reports')
      .select('id')
      .limit(1);

    if (dbTestError) {
      console.error(
        '[BUG_REPORTS_API] Database connection test failed:',
        dbTestError
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed',
          details: dbTestError.message,
          errorCode: 'DB_CONNECTION_ERROR'
        },
        { status: 500 }
      );
    }

    // Get user context for institution and department information
    console.log('[BUG_REPORTS_API] Fetching user context');

    const userContextResult = await Promise.allSettled([
      // Get user's institution and department information
      supabase
        .from('staff')
        .select('institution_id, department_id')
        .eq('email', user.email)
        .single(),
      supabase
        .from('profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single()
    ]);

    // Process user context
    let institutionId = null;
    let departmentId = null;

    const [staffResult, profileResult] = userContextResult;

    if (staffResult.status === 'fulfilled' && staffResult.value.data) {
      institutionId = staffResult.value.data.institution_id;
      departmentId = staffResult.value.data.department_id;
    } else if (profileResult.status === 'fulfilled' && profileResult.value.data) {
      institutionId = profileResult.value.data.institution_id;
    }

    console.log('[BUG_REPORTS_API] User context processed:', {
      institutionId,
      departmentId
    });

    // Create the bug report (display_id will be auto-generated by database)
    const initialReport = {
      reporter_user_id: user.id,
      page_url: validatedData.page_url,
      description: validatedData.description,
      console_logs: validatedData.console_logs,
      metadata: validatedData.metadata,
      institution_id: institutionId,
      department_id: departmentId
    };

    console.log('[BUG_REPORTS_API] Inserting bug report');

    // Retry logic for handling potential race conditions
    let insertAttempts = 0;
    const maxAttempts = 3;
    let newReport = null;
    let insertError = null;

    while (insertAttempts < maxAttempts && !newReport) {
      insertAttempts++;
      console.log(`[BUG_REPORTS_API] Insert attempt ${insertAttempts}/${maxAttempts}`);

      const result = await supabase
        .from('bug_reports')
        .insert(initialReport)
        .select()
        .single();

      if (result.error) {
        insertError = result.error;
        console.error(`[BUG_REPORTS_API] Insert attempt ${insertAttempts} failed:`, insertError);

        // If it's a display_id constraint error, wait briefly and retry
        if (insertError.message.includes('bug_reports_display_id_key') && insertAttempts < maxAttempts) {
          console.log('[BUG_REPORTS_API] Display ID conflict detected, retrying...');
          await new Promise(resolve => setTimeout(resolve, 100 * insertAttempts)); // Exponential backoff
          continue;
        }

        // For other errors or max attempts reached, break
        break;
      } else {
        newReport = result.data;
        insertError = null;
        break;
      }
    }

    if (insertError) {
      console.error('[BUG_REPORTS_API] All insert attempts failed:', insertError);

      // Provide specific error messages based on error type
      let errorCode = 'INSERT_ERROR';
      let errorMessage = 'Failed to create bug report';

      if (insertError.message.includes('bug_reports_display_id_key')) {
        errorCode = 'DISPLAY_ID_GENERATION_FAILED';
        errorMessage = 'Unable to generate unique report ID. Please try again.';
      } else if (insertAttempts >= maxAttempts) {
        errorCode = 'INSERT_RETRY_FAILED';
        errorMessage = 'System is busy. Please try again in a moment.';
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          details: insertError.message,
          errorCode: errorCode,
          hint: insertError.hint,
          attempts: insertAttempts
        },
        { status: 500 }
      );
    }

    if (!newReport) {
      console.error('[BUG_REPORTS_API] No report returned from insert');
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create bug report',
          details: 'No data returned from database insert',
          errorCode: 'NO_DATA_RETURNED'
        },
        { status: 500 }
      );
    }

    console.log('[BUG_REPORTS_API] Report created with ID:', newReport.id);

    // Optimize: Handle participant creation and screenshot upload in parallel
    const tasks = [];

    // Add participant creation task
    tasks.push(
      (async () => {
        try {
          const { error } = await supabase
            .from('bug_report_participants')
            .insert({
              bug_report_id: newReport.id,
              user_id: user.id,
              role: 'reporter',
              can_view_internal: false,
              is_active: true,
              joined_at: new Date().toISOString()
            });

          if (error && !error.message.includes('duplicate')) {
            console.warn('[BUG_REPORTS_API] Could not add participant:', error);
          }
          return null;
        } catch (err) {
          console.warn('[BUG_REPORTS_API] Participant creation failed:', err);
          return null;
        }
      })()
    );

    // Handle screenshot upload if provided
    if (validatedData.screenshot_data_url) {
      // Add screenshot upload task
      tasks.push(
        (async () => {
          try {
            const screenshotFile = dataURLtoFile(
              validatedData.screenshot_data_url!,
              'screenshot.png'
            );
            const filePath = `${newReport.id}/screenshot.png`;

            console.log('[BUG_REPORTS_API] Uploading screenshot to:', filePath);

            const { error: uploadError } = await supabase.storage
              .from(BUG_REPORTS_BUCKET)
              .upload(filePath, screenshotFile, {
                cacheControl: '3600',
                upsert: false
              });

            if (uploadError) {
              console.error('[BUG_REPORTS_API] Screenshot upload error:', uploadError);
              return null;
            }

            const { data: urlData } = supabase.storage
              .from(BUG_REPORTS_BUCKET)
              .getPublicUrl(filePath);

            // Update report with screenshot URL
            const { data: updatedReport, error: updateError } = await supabase
              .from('bug_reports')
              .update({ screenshot_url: urlData.publicUrl })
              .eq('id', newReport.id)
              .select()
              .single();

            if (updateError) {
              console.error('[BUG_REPORTS_API] Update error:', updateError);
              return null;
            }

            console.log('[BUG_REPORTS_API] Screenshot uploaded successfully');
            return updatedReport;
          } catch (error) {
            console.error('[BUG_REPORTS_API] Screenshot processing error:', error);
            return null;
          }
        })()
      );
    }

    // Execute all tasks in parallel
    const results = await Promise.allSettled(tasks);

    // Check if screenshot upload was successful and return updated report
    if (validatedData.screenshot_data_url && results.length > 1) {
      const screenshotResult = results[1];
      if (screenshotResult.status === 'fulfilled' && screenshotResult.value) {
        return NextResponse.json(
          {
            success: true,
            data: screenshotResult.value,
            message: 'Bug report created successfully with screenshot'
          },
          { status: 201 }
        );
      }
    }

    console.log(
      '[BUG_REPORTS_API] Bug report created successfully:',
      newReport.id
    );

    return NextResponse.json(
      {
        success: true,
        data: newReport,
        message: 'Bug report created successfully'
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[BUG_REPORTS_API] Unexpected error occurred:', error);

    // Log the full error for debugging
    console.error('[BUG_REPORTS_API] Full error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        errorCode: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;
    const institution_id = searchParams.get('institution_id');
    const department_id = searchParams.get('department_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    let query = supabase
      .from('bug_reports_with_details')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (department_id) {
      query = query.eq('department_id', department_id);
    }

    query = query.range((page - 1) * limit, page * limit - 1);
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    // Transform the data to match the expected BugReport interface
    const transformedData = data?.map((report) => ({
      ...report,
      reporter: report.reporter_name
        ? {
            id: report.reporter_user_id,
            full_name: report.reporter_name,
            email: report.reporter_email
          }
        : null
    }));

    return NextResponse.json({
      data: transformedData || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    console.error('[BUG_REPORTS_GET_API]', error);
    return NextResponse.json(
      { error: 'Failed to fetch bug reports.' },
      { status: 500 }
    );
  }
}
