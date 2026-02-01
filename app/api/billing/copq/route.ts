// app/api/billing/copq/route.ts
// API routes for Billing COPQ incidents

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { BillingCOPQService } from '@/lib/services/billing/copq/billing-copq-service';
import type { COPQFilters } from '@/types/billing-copq';
import {
  createCOPQIncidentSchema,
  copqFiltersSchema
} from '@/lib/validations/billing-copq';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's institution_id from query param (temporary - should be from profile)
    // SECURITY NOTE: In production, institution_id should come from user's profile, not query params
    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    if (!institutionId) {
      return NextResponse.json(
        { error: 'institution_id is required' },
        { status: 400 }
      );
    }

    // Parse and validate query parameters
    const queryParams = {
      institution_id: institutionId,
      category: searchParams.get('category') || undefined,
      status: searchParams.get('status') || undefined,
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10
    };

    const validatedFilters = copqFiltersSchema.parse(queryParams) as COPQFilters;

    const result = await BillingCOPQService.getIncidents(validatedFilters);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Error in GET /api/billing/copq:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();

    // Validate request body
    const validatedData = createCOPQIncidentSchema.parse(json);

    const incident = await BillingCOPQService.logIncident(validatedData as any);

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    console.error('[API] Error in POST /api/billing/copq:', error);

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
