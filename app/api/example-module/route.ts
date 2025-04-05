import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { Database } from '@/types/auth';

export async function GET(req: Request) {
  try {
    // Get user profile from session
    const supabase = createServerComponentClient<Database>({ cookies });
    const session = await supabase.auth.getSession();

    if (!session?.data.session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.data.session.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get user's role and permissions
    const { data: role } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('role_key', profile.role)
      .single();

    // Check for required permission
    if (!role?.permissions?.view_module_items) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Mock data to return
    const items = [
      { id: '1', name: 'Item 1', description: 'Description for item 1' },
      { id: '2', name: 'Item 2', description: 'Description for item 2' },
      { id: '3', name: 'Item 3', description: 'Description for item 3' }
    ];

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error in GET /api/example-module:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    // Get user profile from session
    const supabase = createServerComponentClient<Database>({ cookies });
    const session = await supabase.auth.getSession();

    if (!session?.data.session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.data.session.user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get user's role and permissions
    const { data: role } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('role_key', profile.role)
      .single();

    // Check for required permission
    if (!role?.permissions?.create_module_items) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Parse request body
    const data = await req.json();

    // Validate request data
    if (!data.name || typeof data.name !== 'string') {
      return NextResponse.json(
        { error: 'Invalid name provided' },
        { status: 400 }
      );
    }

    // In a real app, you would save to the database here
    // For now, we'll just return the created item with a mock ID
    const newItem = {
      id: Date.now().toString(),
      name: data.name,
      description: data.description || '',
      createdAt: new Date().toISOString()
    };

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/example-module:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
