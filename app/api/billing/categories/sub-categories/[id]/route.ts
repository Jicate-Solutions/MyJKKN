import { z } from 'zod';
import { NextResponse } from 'next/server';
import { BillingSubCategoryService } from '@/lib/services/billing/categories/billing-sub-category-service';
import { getAuthSession } from '@/lib/supabase/server';

const updateSubCategorySchema = z.object({
  institution_id: z.string().uuid('Invalid institution ID').optional(),
  parent_category_id: z.string().uuid('Invalid parent category ID').optional(),
  sub_category_name: z
    .string()
    .min(1, 'Sub category name is required')
    .max(100, 'Sub category name must be less than 100 characters')
    .regex(
      /^[a-zA-Z0-9\s\-]+$/,
      'Only letters, numbers, spaces, and hyphens are allowed'
    )
    .optional(),
  is_active: z.boolean().optional()
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid sub category ID' },
        { status: 400 }
      );
    }

    const subCategory = await BillingSubCategoryService.getBillingSubCategory(
      id
    );

    return NextResponse.json(subCategory);
  } catch (error) {
    console.error('Error in GET /api/billing/sub-categories/[id]:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Billing sub category not found' },
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
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid sub category ID' },
        { status: 400 }
      );
    }

    const json = await request.json();

    // Validate request body
    const validatedData = updateSubCategorySchema.parse(json);

    const subCategory =
      await BillingSubCategoryService.updateBillingSubCategory(
        id,
        validatedData
      );

    return NextResponse.json(subCategory);
  } catch (error) {
    console.error('Error in PUT /api/billing/sub-categories/[id]:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Billing sub category not found' },
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid sub category ID' },
        { status: 400 }
      );
    }

    await BillingSubCategoryService.deleteBillingSubCategory(id);

    return NextResponse.json({ message: 'Sub category deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/billing/sub-categories/[id]:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Billing sub category not found' },
          { status: 404 }
        );
      }

      if (error.message.includes('associated billing items')) {
        return NextResponse.json(
          {
            error: 'Cannot delete sub category with associated billing items'
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
