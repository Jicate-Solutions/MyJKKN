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

    // Generate a unique display_id for the bug report with retry logic
    console.log('[BUG_REPORTS_API] Generating display_id');

    let displayId = 'BUG-001';
    let attempts = 0;
    const maxAttempts = 5;
    let newReport = null;

    while (attempts < maxAttempts) {
      try {
        // Get the latest display_id to generate the next one
        const { data: lastReport, error: lastReportError } = await supabase
          .from('bug_reports')
          .select('display_id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastReport && lastReport.display_id) {
          // Extract the number from the last display_id and increment it
          const lastNumber = parseInt(
            lastReport.display_id.replace('BUG-', ''),
            10
          );
          const nextNumber = lastNumber + 1;
          displayId = `BUG-${nextNumber.toString().padStart(3, '0')}`;
        }

        console.log(
          '[BUG_REPORTS_API] Generated display_id:',
          displayId,
          'Attempt:',
          attempts + 1
        );

        // Get user's institution and department information
        let institutionId = null;
        let departmentId = null;

        try {
          // First try to get from staff record (more specific)
          const { data: staffRecord } = await supabase
            .from('staff')
            .select('institution_id, department_id')
            .eq('email', user.email)
            .single();

          if (staffRecord) {
            institutionId = staffRecord.institution_id;
            departmentId = staffRecord.department_id;
          } else {
            // Fallback to profile institution
            const { data: profile } = await supabase
              .from('profiles')
              .select('institution_id')
              .eq('id', user.id)
              .single();

            if (profile) {
              institutionId = profile.institution_id;
            }
          }
        } catch (error) {
          console.warn(
            '[BUG_REPORTS_API] Could not fetch user institution/department:',
            error
          );
        }

        // Create the bug report
        const initialReport = {
          reporter_user_id: user.id,
          display_id: displayId,
          page_url: validatedData.page_url,
          description: validatedData.description,
          console_logs: validatedData.console_logs,
          metadata: validatedData.metadata,
          institution_id: institutionId,
          department_id: departmentId
        };

        console.log('[BUG_REPORTS_API] Inserting bug report');
        const { data: insertData, error: insertError } = await supabase
          .from('bug_reports')
          .insert(initialReport)
          .select()
          .single();

        if (insertError) {
          // Check if it's a duplicate key error for display_id
          if (
            insertError.message.includes(
              'duplicate key value violates unique constraint'
            ) &&
            insertError.message.includes('display_id')
          ) {
            console.warn(
              '[BUG_REPORTS_API] Display ID conflict, retrying with new ID'
            );
            attempts++;
            continue;
          }

          // Other errors should be thrown
          console.error('[BUG_REPORTS_API] Insert error:', insertError);
          return NextResponse.json(
            {
              success: false,
              error: 'Failed to create bug report',
              details: insertError.message,
              errorCode: 'INSERT_ERROR',
              hint: insertError.hint
            },
            { status: 500 }
          );
        }

        // Success - break out of the retry loop
        newReport = insertData;
        break;
      } catch (error) {
        console.error(
          '[BUG_REPORTS_API] Unexpected error during insert:',
          error
        );
        attempts++;
        if (attempts >= maxAttempts) {
          return NextResponse.json(
            {
              success: false,
              error: 'Failed to create bug report after multiple attempts',
              details: error instanceof Error ? error.message : 'Unknown error',
              errorCode: 'INSERT_RETRY_FAILED'
            },
            { status: 500 }
          );
        }
      }
    }

    // If we've exhausted all attempts
    if (!newReport) {
      console.error(
        '[BUG_REPORTS_API] Failed to create bug report after maximum attempts'
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create bug report',
          details:
            'Could not generate unique display ID after multiple attempts',
          errorCode: 'DISPLAY_ID_GENERATION_FAILED'
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

    // Handle screenshot upload if provided
    if (validatedData.screenshot_data_url) {
      console.log('[BUG_REPORTS_API] Processing screenshot upload');

      try {
        // Test storage bucket access first
        console.log('[BUG_REPORTS_API] Testing storage bucket access');
        const { error: bucketTestError } = await supabase.storage
          .from(BUG_REPORTS_BUCKET)
          .list('', { limit: 1 });

        if (bucketTestError) {
          console.error(
            '[BUG_REPORTS_API] Storage bucket test failed:',
            bucketTestError
          );
          // Continue without screenshot but log the error
          console.warn(
            '[BUG_REPORTS_API] Continuing without screenshot due to bucket access error'
          );
        } else {
          const screenshotFile = dataURLtoFile(
            validatedData.screenshot_data_url,
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
            console.error(
              '[BUG_REPORTS_API] Screenshot upload error:',
              uploadError
            );
            // Don't fail the whole operation, just log the error
            console.warn('[BUG_REPORTS_API] Continuing without screenshot');
          } else {
            console.log('[BUG_REPORTS_API] Screenshot uploaded successfully');

            const { data: urlData } = supabase.storage
              .from(BUG_REPORTS_BUCKET)
              .getPublicUrl(filePath);

            console.log('[BUG_REPORTS_API] Screenshot URL:', urlData.publicUrl);

            const { data: updatedReport, error: updateError } = await supabase
              .from('bug_reports')
              .update({ screenshot_url: urlData.publicUrl })
              .eq('id', newReport.id)
              .select()
              .single();

            if (updateError) {
              console.error('[BUG_REPORTS_API] Update error:', updateError);
              // Don't fail the whole operation, return the original report
              console.warn(
                '[BUG_REPORTS_API] Returning report without screenshot URL'
              );
            } else {
              console.log(
                '[BUG_REPORTS_API] Report updated with screenshot URL'
              );
              return NextResponse.json(
                {
                  success: true,
                  data: updatedReport,
                  message: 'Bug report created successfully with screenshot'
                },
                { status: 201 }
              );
            }
          }
        }
      } catch (screenshotError) {
        console.error(
          '[BUG_REPORTS_API] Screenshot processing error:',
          screenshotError
        );
        // Continue without screenshot
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
