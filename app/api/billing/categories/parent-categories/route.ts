import { z } from 'zod';
import { NextResponse } from 'next/server';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { getAuthSession } from '@/lib/supabase/server';

const createCategorySchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  parent_category_name: z
    .string()
    .min(1, 'Parent category name is required')
    .max(100, 'Parent category name must be less than 100 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    ),
  is_active: z.boolean().optional().default(true)
});

const filtersSchema = z.object({
  search: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10)
});

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const queryParams = {
      search: searchParams.get('search') || undefined,
      institution_id: searchParams.get('institution_id') || undefined,
      isActive: searchParams.get('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10
    };

    const validatedFilters = filtersSchema.parse(queryParams);

    const result =
      await BillingParentCategoryService.getBillingParentCategories(
        validatedFilters
      );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/billing/parent-categories:', error);

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
    const validatedData = createCategorySchema.parse(json);

    const category =
      await BillingParentCategoryService.createBillingParentCategory(
        validatedData
      );

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/billing/parent-categories:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
