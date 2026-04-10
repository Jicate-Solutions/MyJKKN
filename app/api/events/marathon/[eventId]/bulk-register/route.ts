export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/bulk-register
// Accepts parsed registration rows (JSON array) and bulk-inserts them.
// Requires authentication — admin/coordinator only.
//
// GET /api/events/marathon/[eventId]/bulk-register?action=template
// Downloads the Excel import template for this event.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MarathonBulkRegistrationService } from '@/lib/services/events/marathon/marathon-bulk-registration-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const action = request.nextUrl.searchParams.get('action');

    if (action !== 'template') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Verify auth
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch event name
    const { data: event } = await supabase
      .from('events')
      .select('id, name')
      .eq('id', eventId)
      .single();

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const buffer = await MarathonBulkRegistrationService.generateTemplate(
      eventId,
      event.name
    );

    const filename = `${event.name.replace(/[^a-zA-Z0-9]/g, '_')}_Import_Template.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('events/marathon-bulk', 'Template generation failed', error);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Verify auth
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { rows, categoryCodes } = body as {
      rows: Record<string, unknown>[];
      categoryCodes: string[];
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    if (rows.length > 1000) {
      return NextResponse.json(
        { error: 'Maximum 1000 rows per import' },
        { status: 400 }
      );
    }

    // Validate rows
    const { validRows, errors: validationErrors } =
      MarathonBulkRegistrationService.validateRows(rows, categoryCodes);

    if (validRows.length === 0) {
      return NextResponse.json(
        {
          error: 'All rows failed validation',
          result: {
            total: rows.length,
            success: 0,
            skipped: 0,
            failed: rows.length,
            errors: validationErrors,
            registrations: [],
          },
        },
        { status: 422 }
      );
    }

    // Bulk register
    const result = await MarathonBulkRegistrationService.bulkRegister(
      eventId,
      validRows
    );

    // Merge validation errors with insert errors
    result.errors = [...validationErrors, ...result.errors];
    result.failed += validationErrors.length;
    result.total = rows.length;

    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    logger.error('events/marathon-bulk', 'Bulk import failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk import failed' },
      { status: 500 }
    );
  }
}
