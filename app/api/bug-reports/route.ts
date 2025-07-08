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
          details: authError.message
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
          details: 'Auth session missing!'
        },
        { status: 401 }
      );
    }

    console.log('[BUG_REPORTS_API] Authenticated user:', user.id);

    console.log('[BUG_REPORTS_API] Parsing request body');
    const json = await request.json();

    console.log('[BUG_REPORTS_API] Request data:', {
      page_url: json.page_url,
      description: json.description?.substring(0, 100) + '...',
      has_screenshot: !!json.screenshot_data_url,
      console_logs_count: json.console_logs?.length || 0,
      metadata: json.metadata
    });

    console.log('[BUG_REPORTS_API] Validating request data');
    const validatedData = createReportSchema.parse(json);

    console.log('[BUG_REPORTS_API] Data validation successful');

    // Create the bug report
    const initialReport = {
      reporter_user_id: user.id,
      page_url: validatedData.page_url,
      description: validatedData.description,
      console_logs: validatedData.console_logs,
      metadata: validatedData.metadata
    };

    console.log('[BUG_REPORTS_API] Inserting bug report');
    const { data: newReport, error: insertError } = await supabase
      .from('bug_reports')
      .insert(initialReport)
      .select()
      .single();

    if (insertError) {
      console.error('[BUG_REPORTS_API] Insert error:', insertError);
      throw new Error(`Failed to insert bug report: ${insertError.message}`);
    }

    if (!newReport) {
      console.error('[BUG_REPORTS_API] No report returned from insert');
      throw new Error('Failed to create bug report - no data returned.');
    }

    console.log('[BUG_REPORTS_API] Report created with ID:', newReport.id);

    // Handle screenshot upload if provided
    if (validatedData.screenshot_data_url) {
      console.log('[BUG_REPORTS_API] Processing screenshot upload');

      try {
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
            console.log('[BUG_REPORTS_API] Report updated with screenshot URL');
            return NextResponse.json(updatedReport, { status: 201 });
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
    return NextResponse.json(newReport, { status: 201 });
  } catch (error) {
    console.error('[BUG_REPORTS_API] Error occurred:', error);

    if (error instanceof z.ZodError) {
      console.error('[BUG_REPORTS_API] Validation error:', error.errors);
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }

    // Log the full error for debugging
    console.error('[BUG_REPORTS_API] Full error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined
    });

    return NextResponse.json(
      { error: 'Failed to create bug report.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    let query = supabase.from('bug_reports').select('*', { count: 'exact' });

    if (status) {
      query = query.eq('status', status);
    }

    query = query.range((page - 1) * limit, page * limit - 1);
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data || [],
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
