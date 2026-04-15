export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { getAuthSession } from '@/lib/supabase/server';
import { withUsageTracking } from '@/lib/middleware/usage-tracking-middleware';

const FREQUENCIES = ['monthly', 'quarterly', 'yearly', 'one-time'] as const;

const createCategorySchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID'),
  category_name: z
    .string()
    .min(1, 'Category name is required')
    .max(150, 'Category name must be less than 150 characters'),
  amount: z.number().nonnegative().nullable().optional(),
  frequency: z.enum(FREQUENCIES),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true)
});

const filtersSchema = z.object({
  search: z.string().optional(),
  institution_id: z.string().uuid().optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  isActive: z.boolean().optional(),
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(10)
});

async function handleGET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryParams = {
      search: searchParams.get('search') || undefined,
      institution_id: searchParams.get('institution_id') || undefined,
      frequency: (searchParams.get('frequency') as any) || undefined,
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
      await BillingCategoryService.getBillingCategories(validatedFilters);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/billing/categories] GET error:', error);
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

async function handlePOST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validatedData = createCategorySchema.parse(json);

    const category = await BillingCategoryService.createBillingCategory(
      validatedData as any
    );
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('[api/billing/categories] POST error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export const GET = withUsageTracking(handleGET);
export const POST = withUsageTracking(handlePOST);
