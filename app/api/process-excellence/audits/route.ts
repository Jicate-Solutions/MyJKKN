import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthSession } from '@/lib/supabase/server';
import {
  createProcessAuditSchema,
  processAuditFiltersSchema
} from '@/lib/validations/process-excellence';
import type { ProcessAuditFilters } from '@/types/process-excellence';

export async function GET(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Validate required institution_id
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json({ error: 'institution_id is required' }, { status: 400 });
    }

    // Parse and validate query parameters
    const queryParams = {
      search: searchParams.get('search') || undefined,
      institution_id: institutionId,
      process_id: searchParams.get('process_id') || undefined,
      auditor_id: searchParams.get('auditor_id') || undefined,
      abcd_rating: searchParams.get('abcd_rating') || undefined,
      status: searchParams.get('status') || undefined,
      period_from: searchParams.get('period_from') || undefined,
      period_to: searchParams.get('period_to') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit')
        ? parseInt(searchParams.get('limit')!)
        : 10,
      sortBy: searchParams.get('sortBy') || undefined,
      sortDirection: searchParams.get('sortDirection') as 'asc' | 'desc' | undefined
    };

    const validatedFilters = processAuditFiltersSchema.parse(queryParams) as ProcessAuditFilters;

    const supabase = await createClient();

    let query = supabase
      .from('process_audits')
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email),
        institution:institutions(id, name)
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (validatedFilters.institution_id) {
      query = query.eq('institution_id', validatedFilters.institution_id);
    }

    if (validatedFilters.process_id) {
      query = query.eq('process_id', validatedFilters.process_id);
    }

    if (validatedFilters.auditor_id) {
      query = query.eq('auditor_id', validatedFilters.auditor_id);
    }

    if (validatedFilters.abcd_rating) {
      query = query.eq('abcd_rating', validatedFilters.abcd_rating);
    }

    if (validatedFilters.status) {
      query = query.eq('status', validatedFilters.status);
    }

    if (validatedFilters.period_from) {
      query = query.gte('audit_period_start', validatedFilters.period_from);
    }

    if (validatedFilters.period_to) {
      query = query.lte('audit_period_end', validatedFilters.period_to);
    }

    // Apply sorting
    const sortBy = validatedFilters.sortBy || 'created_at';
    const sortDirection = validatedFilters.sortDirection || 'desc';
    query = query.order(sortBy, { ascending: sortDirection === 'asc' });

    // Apply pagination
    const page = validatedFilters.page || 1;
    const limit = validatedFilters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      console.error('[process-excellence/audits] Error:', error);
      throw new Error(`Failed to fetch process audits: ${error.message}`);
    }

    return NextResponse.json({
      data: data || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('[process-excellence/audits] GET Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await request.json();
    const validatedData = createProcessAuditSchema.parse(json);

    const supabase = await createClient();

    // Try to generate audit metrics using database function
    let metrics = {
      total_instances: 0,
      avg_cycle_hours: null,
      avg_value_add_ratio: null,
      sla_compliance_rate: null,
      waste_breakdown: {}
    };

    try {
      const { data: metricsResult, error: metricsError } = await supabase
        .rpc('generate_process_audit_metrics', {
          p_institution_id: validatedData.institution_id,
          p_process_id: validatedData.process_id,
          p_period_start: validatedData.audit_period_start,
          p_period_end: validatedData.audit_period_end
        });

      if (!metricsError && metricsResult) {
        metrics = metricsResult;
      }
    } catch (e) {
      console.warn('[process-excellence/audits] Could not generate metrics:', e);
    }

    const { data, error } = await supabase
      .from('process_audits')
      .insert({
        ...validatedData,
        auditor_id: validatedData.auditor_id || session.user.id,
        total_instances: metrics.total_instances,
        avg_cycle_hours: metrics.avg_cycle_hours,
        avg_value_add_ratio: metrics.avg_value_add_ratio,
        sla_compliance_rate: metrics.sla_compliance_rate,
        waste_breakdown: metrics.waste_breakdown,
        status: 'draft'
      })
      .select(
        `
        *,
        process:process_definitions(id, name, category),
        auditor:profiles!process_audits_auditor_id_fkey(id, full_name, email),
        institution:institutions(id, name)
      `
      )
      .single();

    if (error) {
      console.error('[process-excellence/audits] Create error:', error);
      throw new Error(`Failed to create process audit: ${error.message}`);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[process-excellence/audits] POST Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
