import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CreateSubcategoryDTO } from '@/types/categories';
import toast from 'react-hot-toast';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (
      profileError ||
      !profile ||
      !['super_admin', 'administrator'].includes(profile.role)
    ) {
      toast.error('You are not authorized to create a subcategory');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: CreateSubcategoryDTO = await request.json();

    // Validate that the category exists
    const { data: category, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', body.category_id)
      .single();

    if (categoryError || !category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Create subcategory
    const { data: subcategory, error: createError } = await supabase
      .from('subcategories')
      .insert([
        {
          name: body.name,
          description: body.description || null,
          category_id: body.category_id,
          created_by: session.user.id
        }
      ])
      .select(
        `
        *,
        category:categories(
          id,
          name,
          code
        )
      `
      )
      .single();

    if (createError) {
      console.error('Create error:', createError);
      return NextResponse.json(
        { error: createError.message || 'Failed to create subcategory' },
        { status: 500 }
      );
    }

    return NextResponse.json(subcategory, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/categories/subcategories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get all categories with their subcategories in a single query
    const { data: categories, error } = await supabase
      .from('categories')
      .select(
        `
        *,
        subcategories (
          id,
          name,
          description,
          category_id
        )
      `
      )
      .order('name');

    if (error) throw error;

    return NextResponse.json(categories);
  } catch (error) {
    console.error('Error in GET /api/categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
