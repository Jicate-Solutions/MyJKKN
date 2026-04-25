export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const BUG_REPORTS_BUCKET = 'bug-reports';

// Extracts a normalized error signature from console_logs for deduplication.
// Strips dynamic parts (UUIDs, line:col, hex addresses) so similar errors group together.
function extractErrorSignature(consoleLogs: any[] | null): string | null {
  if (!consoleLogs || !Array.isArray(consoleLogs) || consoleLogs.length === 0) return null;

  for (const log of consoleLogs) {
    const level = log.level ?? log.type ?? '';
    if (!['error', 'Error'].includes(level)) continue;

    const msg: string =
      typeof log.message === 'string'
        ? log.message
        : JSON.stringify(log.message ?? '');

    const normalized = msg
      .split('\n')[0]
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]+\b/gi, 'UUID')
      .replace(/:\d+:\d+/g, ':L:C')
      .replace(/0x[0-9a-f]+/gi, '0xADDR')
      .trim()
      .slice(0, 200);

    if (normalized.length > 10) return normalized;
  }
  return null;
}

const createReportSchema = z.object({
  page_url: z.string().url({ message: 'A valid page URL is required.' }),
  description: z
    .string()
    .min(10, { message: 'Description must be at least 10 characters long.' }),
  category: z
    .enum(['bug', 'feature_request', 'ui_design', 'performance', 'security', 'other'])
    .optional()
    .default('bug'),
  // Screenshot and images are uploaded browser-direct via signed URLs, not through the API body.
  wants_screenshot: z.boolean().optional().default(false),
  screenshot_format: z.enum(['jpg', 'png']).optional().default('jpg'),
  additional_image_count: z.number().int().min(0).max(5).optional().default(0),
  additional_image_formats: z.array(z.enum(['jpg', 'png'])).max(5).optional().default([]),
  console_logs: z.array(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  log_summary: z.any().optional()
});

export async function POST(request: Request) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      logger.error('bug-reports', 'Auth error', authError);
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
      logger.error('bug-reports', 'No authenticated user found');
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

    let json;
    try {
      json = await request.json();
    } catch (parseError) {
      logger.error('bug-reports/api', 'JSON parse error', parseError);
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

    let validatedData;
    try {
      validatedData = createReportSchema.parse(json);
    } catch (validationError) {
      logger.error('bug-reports/api', 'Validation error', validationError);
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

    // Test database connection first
    const { error: dbTestError } = await supabase
      .from('bug_reports')
      .select('id')
      .limit(1);

    if (dbTestError) {
      logger.error('bug-reports/api', 'Database connection test failed', dbTestError);
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
    const userContextResult = await Promise.allSettled([
      // Get user's institution and department information
      supabase
        .from('staff')
        .select('institution_id, department_id')
        .eq('email', user.email)
        .single(),
      supabase
        .from('profiles')
        .select('institution_id, department_id')
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
      departmentId = profileResult.value.data.department_id;
    }

    // Create the bug report (display_id will be auto-generated by database)
    const initialReport = {
      reporter_user_id: user.id,
      page_url: validatedData.page_url,
      description: validatedData.description,
      category: validatedData.category,
      console_logs: validatedData.console_logs,
      metadata: validatedData.metadata,
      institution_id: institutionId,
      department_id: departmentId
    };

    // Retry logic for handling potential race conditions
    let insertAttempts = 0;
    const maxAttempts = 3;
    let newReport = null;
    let insertError = null;

    while (insertAttempts < maxAttempts && !newReport) {
      insertAttempts++;

      const result = await supabase
        .from('bug_reports')
        .insert(initialReport)
        .select()
        .single();

      if (result.error) {
        insertError = result.error;
        logger.error('bug-reports/api', `Insert attempt ${insertAttempts} failed`, insertError);

        // If it's a display_id constraint error, wait briefly and retry
        if (insertError.message.includes('bug_reports_display_id_key') && insertAttempts < maxAttempts) {
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
      logger.error('bug-reports/api', 'All insert attempts failed', insertError);

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
      logger.error('bug-reports/api', 'No report returned from insert', null);
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

    // Add participant (sequential — avoids concurrent write contention with signed URL creation)
    const { error: participantError } = await supabase
      .from('bug_report_participants')
      .insert({
        bug_report_id: newReport.id,
        user_id: user.id,
        role: 'reporter',
        can_view_internal: false,
        is_active: true,
        joined_at: new Date().toISOString()
      });

    if (participantError && !participantError.message.includes('duplicate')) {
      logger.warn('bug-reports/api', 'Could not add participant', participantError);
    }

    // Generate signed upload URLs for browser-direct upload.
    // Screenshots are never sent through the API body — the browser uploads directly
    // to Supabase Storage via these signed URLs, eliminating server-side ECONNRESET on
    // large binary writes.
    let screenshotSignedData: { path: string; signedUrl: string; token: string } | null = null;
    const additionalSignedData: Array<{ path: string; signedUrl: string; token: string }> = [];
    const urlUpdatePayload: { screenshot_url?: string; attachment_urls?: string[] } = {};

    if (validatedData.wants_screenshot) {
      const ext = validatedData.screenshot_format ?? 'jpg';
      const screenshotPath = `${newReport.id}/screenshot.${ext}`;

      const { data: signedResult, error: signedError } = await supabase.storage
        .from(BUG_REPORTS_BUCKET)
        .createSignedUploadUrl(screenshotPath, { upsert: false });

      if (signedResult && !signedError) {
        screenshotSignedData = { path: screenshotPath, ...signedResult };
        // Pre-store the public URL — path is deterministic so URL is valid once upload completes
        const { data: publicData } = supabase.storage
          .from(BUG_REPORTS_BUCKET)
          .getPublicUrl(screenshotPath);
        urlUpdatePayload.screenshot_url = publicData.publicUrl;
      } else {
        logger.warn('bug-reports/api', 'Could not create screenshot signed URL', signedError);
      }
    }

    const additionalCount = validatedData.additional_image_count ?? 0;
    const additionalFormats = validatedData.additional_image_formats ?? [];

    if (additionalCount > 0) {
      const attachmentPublicUrls: string[] = [];

      for (let i = 0; i < additionalCount; i++) {
        const ext = additionalFormats[i] ?? 'jpg';
        const path = `${newReport.id}/additional-${i + 1}.${ext}`;

        const { data: signedResult, error: signedError } = await supabase.storage
          .from(BUG_REPORTS_BUCKET)
          .createSignedUploadUrl(path, { upsert: false });

        if (signedResult && !signedError) {
          additionalSignedData.push({ path, ...signedResult });
          const { data: publicData } = supabase.storage
            .from(BUG_REPORTS_BUCKET)
            .getPublicUrl(path);
          attachmentPublicUrls.push(publicData.publicUrl);
        }
      }

      if (attachmentPublicUrls.length > 0) {
        urlUpdatePayload.attachment_urls = attachmentPublicUrls;
      }
    }

    // Update report with pre-computed public URLs so they're immediately queryable
    let finalReport = newReport;
    if (Object.keys(urlUpdatePayload).length > 0) {
      const { data: updatedReport, error: updateError } = await supabase
        .from('bug_reports')
        .update(urlUpdatePayload)
        .eq('id', newReport.id)
        .select()
        .single();

      if (updateError) {
        logger.warn('bug-reports/api', 'Could not pre-store image URLs', updateError);
      } else if (updatedReport) {
        finalReport = updatedReport;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: finalReport,
        // Signed URLs returned to widget for browser-direct upload
        signedUploadUrl: screenshotSignedData,
        additionalSignedUrls: additionalSignedData,
        message: 'Bug report created successfully'
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('bug-reports/api', 'Unexpected error occurred', error);

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
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;
    const category = searchParams.get('category') as any;
    const institution_id = searchParams.get('institution_id');
    const department_id = searchParams.get('department_id');
    const module_name = searchParams.get('module_name');
    const sub_module_name = searchParams.get('sub_module_name');
    const reporter_user_id = searchParams.get('reporter_user_id');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    let query = supabase
      .from('bug_reports_with_details')
      .select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (department_id) {
      query = query.eq('department_id', department_id);
    }

    if (module_name) {
      query = query.eq('module_name', module_name);
    }

    if (sub_module_name) {
      query = query.eq('sub_module_name', sub_module_name);
    }

    if (reporter_user_id) {
      query = query.eq('reporter_user_id', reporter_user_id);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`reporter_name.ilike.${term},reporter_email.ilike.${term}`);
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

    // Compute similar_count: bugs sharing the same error signature are "similar"
    const sigMap: Record<string, number> = {};
    const bugsWithSig = (transformedData ?? []).map((bug: any) => ({
      ...bug,
      _sig: extractErrorSignature(bug.console_logs)
    }));
    for (const bug of bugsWithSig) {
      if (bug._sig) sigMap[bug._sig] = (sigMap[bug._sig] ?? 0) + 1;
    }
    const processedBugs = bugsWithSig.map(({ _sig, ...bug }: any) => ({
      ...bug,
      similar_count: _sig ? Math.max(0, (sigMap[_sig] ?? 1) - 1) : 0
    }));

    return NextResponse.json({
      data: processedBugs,
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    logger.error('bug-reports/api', 'Failed to fetch bug reports', error);
    return NextResponse.json(
      { error: 'Failed to fetch bug reports.' },
      { status: 500 }
    );
  }
}
