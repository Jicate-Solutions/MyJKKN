// app/api/parent-portal/profile/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createParentProfileSchema,
  parentProfileFiltersSchema,
} from '@/lib/validations/parent-portal';
import { z } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Parse and validate filters
    const filters = parentProfileFiltersSchema.parse({
      institution_id: searchParams.get('institution_id') || undefined,
      search: searchParams.get('search') || undefined,
      is_verified: searchParams.get('is_verified')
        ? searchParams.get('is_verified') === 'true'
        : undefined,
      relationship: searchParams.get('relationship') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    });

    const { page, limit } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('parent_profiles')
      .select(
        `
        *,
        institution:institutions(id, name, logo_url)
      `,
        { count: 'exact' }
      );

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    if (filters.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
      );
    }

    if (filters.is_verified !== undefined) {
      query = query.eq('is_verified', filters.is_verified);
    }

    if (filters.relationship) {
      query = query.eq('relationship', filters.relationship);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/profile] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parent profiles' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const validated = createParentProfileSchema.parse(body);

    const { data, error } = await supabase
      .from('parent_profiles')
      .insert(validated)
      .select(
        `
        *,
        institution:institutions(id, name, logo_url)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error('[parent-portal/profile] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create parent profile' },
      { status: 500 }
    );
  }
}
