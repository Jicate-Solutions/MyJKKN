// app/api/categories/subcategories/[id]/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import toast from 'react-hot-toast';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Check admin role
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
      toast.error('You are not authorized to update this subcategory');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    // Verify the subcategory exists
    const { data: existingSubcategory, error: existingError } = await supabase
      .from('subcategories')
      .select('id, category_id')
      .eq('id', params.id)
      .single();

    if (existingError || !existingSubcategory) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData = {
      name: body.name,
      description: body.description || null,
      updated_at: new Date().toISOString()
    };

    // Update subcategory
    const { data: updatedSubcategory, error: updateError } = await supabase
      .from('subcategories')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update subcategory' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedSubcategory);
  } catch (error) {
    console.error('Error updating subcategory:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user's session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify subcategory exists
    const { data: existingSubcategory, error: existingError } = await supabase
      .from('subcategories')
      .select('id')
      .eq('id', params.id)
      .single();

    if (existingError || !existingSubcategory) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      );
    }

    // Delete subcategory
    const { error: deleteError } = await supabase
      .from('subcategories')
      .delete()
      .eq('id', params.id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to delete subcategory' },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
