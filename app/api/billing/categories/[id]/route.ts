export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { NextResponse, connection } from 'next/server';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { getAuthSession } from '@/lib/supabase/server';

const FREQUENCIES = ['monthly', 'quarterly', 'yearly', 'one-time'] as const;

const updateCategorySchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID').optional(),
  category_name: z
    .string()
    .min(1, 'Category name is required')
    .max(150, 'Category name must be less than 150 characters')
    .optional(),
  amount: z.number().nonnegative().nullable().optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!id) {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    const category = await BillingCategoryService.getBillingCategory(id);
    return NextResponse.json(category);
  } catch (error) {
    console.error('[api/billing/categories/:id] GET error:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Billing category not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!id) {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    const json = await request.json();
    const validatedData = updateCategorySchema.parse(json);

    const category = await BillingCategoryService.updateBillingCategory(
      id,
      validatedData
    );
    return NextResponse.json(category);
  } catch (error) {
    console.error('[api/billing/categories/:id] PUT error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Billing category not found' },
          { status: 404 }
        );
      }
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!id) {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    await BillingCategoryService.deleteBillingCategory(id);
    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('[api/billing/categories/:id] DELETE error:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Billing category not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
