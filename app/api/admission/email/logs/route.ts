// app/api/admission/email/logs/route.ts
// GET endpoint for email log listing with pagination
// Query: { institution_id, lead_id?, campaign_id?, status?, from?, to?, page?, limit? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const institution_id = searchParams.get('institution_id');
    const lead_id = searchParams.get('lead_id');
    const campaign_id = searchParams.get('campaign_id');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

    // institution_id is required
    if (!institution_id) {
      return NextResponse.json(
        { error: 'Missing required query parameter: institution_id' },
        { status: 400 }
      );
    }

    // Verify user has access to the institution
    const { data: access, error: accessError } = await supabase
      .from('user_institution_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('institution_id', institution_id)
      .maybeSingle();

    if (accessError || !access) {
      return NextResponse.json(
        { error: 'You do not have access to this institution' },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from('admission_email_logs')
      .select('*', { count: 'exact' })
      .eq('institution_id', institution_id)
      .order('created_at', { ascending: false });

    if (lead_id) {
      query = query.eq('lead_id', lead_id);
    }

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (from) {
      query = query.gte('created_at', from);
    }

    if (to) {
      query = query.lte('created_at', to);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[api/admission/email/logs] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch email logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[api/admission/email/logs] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
