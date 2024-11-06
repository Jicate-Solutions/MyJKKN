//app/api/categories/[categoryId]/subcategories/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/types/supabase';
import { CreateSubcategoryInput } from '@/types/categories';

export async function GET(
  request: NextRequest,
  { params }: { params: { categoryId: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Check authentication
    const {
      data: { session },
      error: authError
    } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('subcategories')
      .select('*')
      .eq('parent_id', params.categoryId)
      .order('name');

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { categoryId: string } }
) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const input: CreateSubcategoryInput = await request.json();

    // Check authentication
    const {
      data: { session },
      error: authError
    } = await supabase.auth.getSession();

    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin privileges
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (
      profileError ||
      !['administrator', 'super_admin'].includes(profile?.role)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create subcategory
    const { data, error } = await supabase
      .from('subcategories')
      .insert({
        name: input.name,
        description: input.description,
        parent_id: params.categoryId,
        created_by: session.user.id
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating subcategory:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
