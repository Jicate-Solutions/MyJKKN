// app/api/grievance/categories/route.ts
// F004: Grievance Ticketing System - Categories API

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { getAuthSession } from '@/lib/supabase/server';
import { createGrievanceCategorySchema, categoryFiltersSchema } from '@/lib/validations/grievance';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const queryParams = {
      institution_id: searchParams.get('institution_id') || undefined,
      parent_id: searchParams.get('parent_id') || undefined,
      is_active: searchParams.get('is_active')
        ? searchParams.get('is_active') === 'true'
        : undefined,
      search: searchParams.get('search') || undefined
    };

    const validatedFilters = categoryFiltersSchema.parse(queryParams);

    if (!validatedFilters.institution_id) {
      return NextResponse.json(
        { error: 'Institution ID is required' },
        { status: 400 }
      );
    }

    const tree = searchParams.get('tree') === 'true';

    const categories = tree
      ? await GrievanceService.getCategories(validatedFilters.institution_id)
      : await GrievanceService.getAllCategories(
          validatedFilters.institution_id,
          validatedFilters.is_active === false
        );

    return NextResponse.json({ data: categories });
  } catch (error) {
    console.error('Error in GET /api/grievance/categories:', error);

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
    const validatedData = createGrievanceCategorySchema.parse(json);

    const category = await GrievanceService.createCategory(validatedData as any);

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/grievance/categories:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        return NextResponse.json({ error: 'Category already exists' }, { status: 409 });
      }
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
