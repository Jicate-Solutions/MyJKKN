export const dynamic = 'force-dynamic';

// POST /api/events/marathon/[eventId]/bulk-register
// Accepts parsed roster rows (JSON array) and bulk-inserts them into events_registrations.
// Requires authentication — admin/coordinator only.
//
// GET /api/events/marathon/[eventId]/bulk-register?action=template
// Downloads the Excel import template for this event.
//
// Events Platform Promotion PR7: this route is now event-type-agnostic. Bulk import was promoted to
// the shared EventBulkRegisterService. The route auto-detects whether the event has categories:
//   • categories present (e.g. marathon 5K/10K) → MarathonBulkRegistrationService (BIB-number scheme)
//   • no categories → EventBulkRegisterService directly (neutral REG-#### registration numbers)
// The /marathon/ path segment is retained for URL stability (same convention as the promoted
// committees/budget services); the logic underneath is shared.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MarathonBulkRegistrationService } from '@/lib/services/events/marathon/marathon-bulk-registration-service';
import { EventBulkRegisterService } from '@/lib/services/events/shared/event-bulk-register-service';
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

    const buffer = await EventBulkRegisterService.generateTemplate(eventId, event.name);

    const filename = `${event.name.replace(/[^a-zA-Z0-9]/g, '_')}_Import_Template.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('events/bulk-register', 'Template generation failed', error);
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
      categoryCodes?: string[];
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 rows per import' }, { status: 400 });
    }

    // Resolve the valid category codes for this event. The client passes them for marathon; for any
    // other event we resolve from the DB so the route works without the caller knowing the categories.
    let codes = (categoryCodes ?? []).map((c) => c.toUpperCase()).filter(Boolean);
    if (codes.length === 0) {
      const cats = await EventBulkRegisterService.getCategoryInfo(eventId);
      codes = cats.map((c) => c.code).filter(Boolean).map((c) => String(c).toUpperCase());
    }

    const hasCategories = codes.length > 0;

    if (hasCategories) {
      // Category-bearing event (marathon and any future categorized event) → BIB scheme.
      const { validRows, errors: validationErrors } =
        MarathonBulkRegistrationService.validateRows(rows, codes);

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

      const result = await MarathonBulkRegistrationService.bulkRegister(eventId, validRows);
      result.errors = [...validationErrors, ...result.errors];
      result.failed += validationErrors.length;
      result.total = rows.length;
      return NextResponse.json({ result }, { status: 200 });
    }

    // Category-less event → shared engine with neutral REG-#### codes.
    const { validRows, errors: validationErrors } = EventBulkRegisterService.validateRows(
      rows,
      [],
      { requireCategory: false }
    );

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

    const result = await EventBulkRegisterService.bulkRegister(eventId, validRows);
    result.errors = [...validationErrors, ...result.errors];
    result.failed += validationErrors.length;
    result.total = rows.length;
    return NextResponse.json({ result }, { status: 200 });
  } catch (error) {
    logger.error('events/bulk-register', 'Bulk import failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk import failed' },
      { status: 500 }
    );
  }
}
