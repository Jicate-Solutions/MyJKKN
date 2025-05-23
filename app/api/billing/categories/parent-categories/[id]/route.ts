import { z } from 'zod';
import { NextResponse } from 'next/server';
import { BillingParentCategoryService } from '@/lib/services/billing/categories/billing-parent-category-service';
import { getAuthSession } from '@/lib/supabase/server';

const updateCategorySchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID').optional(),
  parent_category_name: z
    .string()
    .min(1, 'Parent category name is required')
    .max(100, 'Parent category name must be less than 100 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    )
    .optional(),
  is_active: z.boolean().optional()
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    const category =
      await BillingParentCategoryService.getBillingParentCategory(id);

    return NextResponse.json(category);
  } catch (error) {
    console.error('Error in GET /api/billing/parent-categories/[id]:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Billing parent category not found' },
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
  { params }: { params: { id: string } }
) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    const json = await request.json();

    // Validate request body
    const validatedData = updateCategorySchema.parse(json);

    const category =
      await BillingParentCategoryService.updateBillingParentCategory(
        id,
        validatedData
      );

    return NextResponse.json(category);
  } catch (error) {
    console.error('Error in PUT /api/billing/parent-categories/[id]:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Billing parent category not found' },
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
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid category ID' },
        { status: 400 }
      );
    }

    await BillingParentCategoryService.deleteBillingParentCategory(id);

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error(
      'Error in DELETE /api/billing/parent-categories/[id]:',
      error
    );

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Billing parent category not found' },
          { status: 404 }
        );
      }

      if (error.message.includes('associated sub-categories')) {
        return NextResponse.json(
          {
            error:
              'Cannot delete parent category with associated sub-categories'
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
