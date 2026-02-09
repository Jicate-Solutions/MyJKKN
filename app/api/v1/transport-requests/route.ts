/**
 * External TMS (Transport Management System) API
 *
 * Bearer token authenticated endpoint for external transport systems
 * to query approved transport service requests.
 *
 * GET /api/v1/transport-requests
 *   Headers: Authorization: Bearer <api_key>
 *   Query params: status, institution_id, from_date, to_date, updated_since, page, limit
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    // Validate Bearer token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const supabase = createServiceRoleClient() as any;

    // Look up the API key
    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', token)
      .eq('is_active', true)
      .maybeSingle();

    if (keyError || !apiKey) {
      return NextResponse.json(
        { error: 'Invalid or inactive API key' },
        { status: 401 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'approved';
    const institutionId = searchParams.get('institution_id');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const updatedSince = searchParams.get('updated_since');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get transport service type ID
    const { data: transportType } = await supabase
      .from('service_types')
      .select('id')
      .eq('slug', 'transport-request')
      .single();

    if (!transportType) {
      return NextResponse.json(
        { error: 'Transport service type not configured' },
        { status: 404 }
      );
    }

    // Build query
    let query = supabase
      .from('service_requests')
      .select(
        `*,
        requester:profiles!requester_id(id, full_name, email, avatar_url),
        institution:institutions(id, name)`,
        { count: 'exact' }
      )
      .eq('service_type_id', transportType.id);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (fromDate) {
      query = query.gte('created_at', fromDate);
    }

    if (toDate) {
      query = query.lte('created_at', toDate);
    }

    if (updatedSince) {
      query = query.gte('updated_at', updatedSince);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('[tms-api] Query error:', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // Format response for external consumption
    const formattedData = (data || []).map((req: any) => ({
      id: req.id,
      request_number: req.request_number,
      status: req.status,
      requester: {
        id: req.requester?.id,
        name: req.requester?.full_name,
        email: req.requester?.email,
        phone: req.requester_context?.phone || null,
        role: req.requester_context?.role || null,
      },
      academic_context: req.requester_context || {},
      transport_data: req.form_data || {},
      institution: req.institution
        ? { id: req.institution.id, name: req.institution.name }
        : null,
      submitted_at: req.submitted_at,
      approved_at: req.approved_at,
      fulfilled_at: req.fulfilled_at,
      validity_expires_at: req.validity_expires_at,
      created_at: req.created_at,
      updated_at: req.updated_at,
    }));

    return NextResponse.json({
      data: formattedData,
      metadata: {
        total: count || 0,
        page,
        limit,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[tms-api] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
