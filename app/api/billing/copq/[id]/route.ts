// app/api/billing/copq/[id]/route.ts
// API routes for individual COPQ incident operations

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { BillingCOPQService } from '@/lib/services/billing/copq/billing-copq-service';
import {
  updateCOPQIncidentSchema,
  resolveCOPQIncidentSchema
} from '@/lib/validations/billing-copq';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Incident ID is required' },
        { status: 400 }
      );
    }

    const incident = await BillingCOPQService.getIncident(id);

    return NextResponse.json(incident);
  } catch (error) {
    console.error('[API] Error in GET /api/billing/copq/[id]:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Incident ID is required' },
        { status: 400 }
      );
    }

    const json = await request.json();

    // Validate request body
    const validatedData = updateCOPQIncidentSchema.parse(json);

    const incident = await BillingCOPQService.updateIncident(id, validatedData);

    return NextResponse.json(incident);
  } catch (error) {
    console.error('[API] Error in PATCH /api/billing/copq/[id]:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Incident ID is required' },
        { status: 400 }
      );
    }

    await BillingCOPQService.deleteIncident(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Error in DELETE /api/billing/copq/[id]:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST for special actions (resolve, write-off)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (!id) {
      return NextResponse.json(
        { error: 'Incident ID is required' },
        { status: 400 }
      );
    }

    if (action === 'resolve') {
      const json = await request.json().catch(() => ({}));
      const validatedData = resolveCOPQIncidentSchema.parse(json);
      const incident = await BillingCOPQService.resolveIncident(
        id,
        validatedData.preventive_action
      );
      return NextResponse.json(incident);
    }

    if (action === 'write-off') {
      const incident = await BillingCOPQService.writeOffIncident(id);
      return NextResponse.json(incident);
    }

    return NextResponse.json(
      { error: 'Invalid action. Use ?action=resolve or ?action=write-off' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] Error in POST /api/billing/copq/[id]:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
