// app/api/applications/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CreateApplicationDTO } from '@/types/applications';
import toast from 'react-hot-toast';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const isActive = searchParams.get('isActive');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    // Debug log
    console.log('Category filter:', category);

    // Start building the query
    let query = supabase.from('applications').select(
      `
        *,
        category:categories (
          id,
          name,
          description
        )
      `,
      { count: 'exact' }
    );

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category_id', category);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    const { data: applications, error, count } = await query;

    if (error) {
      console.error('Error fetching applications:', error);
      return NextResponse.json(
        { error: 'Error fetching applications' },
        { status: 500 }
      );
    }

    // Debug log
    console.log('Query results:', applications?.length);

    return NextResponse.json({
      data: applications,
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    console.error('Error in GET /api/applications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Get current user session
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
      toast.error('You are not authorized to create an application');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: CreateApplicationDTO = await request.json();

    // Check if application with same name exists
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('name', body.name)
      .single();

    if (existingApp) {
      return NextResponse.json(
        { error: 'An application with this name already exists' },
        { status: 409 }
      );
    }

    // Validate base URL
    if (!body.url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'URL must start with https://' },
        { status: 400 }
      );
    }

    // Validate support contact if provided
    if (body.support_contact) {
      const { name, email, phone } = body.support_contact;
      if (!name || !email) {
        return NextResponse.json(
          { error: 'Support contact name and email are required' },
          { status: 400 }
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format for support contact' },
          { status: 400 }
        );
      }
    }

    // Validate API endpoints if provided
    if (body.api_endpoints?.length > 0) {
      for (const endpoint of body.api_endpoints) {
        if (!endpoint.name || endpoint.name.length < 2) {
          return NextResponse.json(
            { error: 'API endpoint name must be at least 2 characters' },
            { status: 400 }
          );
        }
        if (!endpoint.url.startsWith('https://')) {
          return NextResponse.json(
            { error: 'API endpoint URLs must start with https://' },
            { status: 400 }
          );
        }
        if (!['GET', 'POST', 'PUT', 'DELETE'].includes(endpoint.method)) {
          return NextResponse.json(
            { error: 'Invalid HTTP method for API endpoint' },
            { status: 400 }
          );
        }
      }
    }

    // Insert new application
    const { data, error } = await supabase
      .from('applications')
      .insert({
        ...body,
        created_by: session.user.id,
        api_endpoints: body.api_endpoints || [],
        support_contact: body.support_contact || null
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to create application' },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/applications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
