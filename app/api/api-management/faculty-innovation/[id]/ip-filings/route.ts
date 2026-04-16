// app/api/api-management/faculty-innovation/[id]/ip-filings/route.ts
// GET: List IP filings for a specific initiative.
// POST: Create a new IP filing linked to an initiative.
// B2A API key auth pattern (same as parent route.ts).

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
        set() {},
        remove() {},
      },
    }
  );
}

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'API key is required in Authorization header', status: 401 };
  }
  const apiKey = authHeader.substring(7);
  const hashedKey = createHash('sha256').update(apiKey).digest('hex');

  const supabase = getServiceClient();
  const { data: keyData, error: keyError } = await (supabase as any)
    .from('api_keys')
    .select('*')
    .eq('key_value', hashedKey)
    .eq('is_active', true)
    .single();

  if (keyError || !keyData) {
    return { error: 'Invalid API key', status: 401 };
  }
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { error: 'API key has expired', status: 401 };
  }

  return { supabase, keyData };
}

// ============================================================================
// GET: List IP filings for an initiative
// ============================================================================
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const auth = await authenticate(request);
    if ('error' in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status, headers: corsHeaders }
      );
    }
    const { supabase, keyData } = auth;

    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    const params: any =
      'then' in (context.params as any)
        ? await (context.params as Promise<{ id: string }>)
        : (context.params as { id: string });
    const initiativeId = params.id;

    const { data, error, count } = await (supabase as any)
      .from('ip_filings')
      .select('*', { count: 'exact' })
      .eq('initiative_id', initiativeId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(
      {
        data: data ?? [],
        metadata: { total: count ?? 0 },
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[faculty-innovation/ip-filings:GET]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================================================================
// POST: Create a new IP filing
// ============================================================================
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const auth = await authenticate(request);
    if ('error' in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status, headers: corsHeaders }
      );
    }
    const { supabase, keyData } = auth;

    if (!keyData.permissions?.write) {
      return NextResponse.json(
        { error: 'API key does not have write permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    const params: any =
      'then' in (context.params as any)
        ? await (context.params as Promise<{ id: string }>)
        : (context.params as { id: string });
    const initiativeId = params.id;

    const body = await request.json();

    const required = ['title', 'filing_type', 'inventor_id', 'institution_id'];
    for (const f of required) {
      if (!body[f]) {
        return NextResponse.json(
          { error: `Missing required field: ${f}` },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const insert = {
      initiative_id: initiativeId,
      institution_id: body.institution_id,
      inventor_id: body.inventor_id,
      filing_type: body.filing_type,
      filing_status: body.filing_status ?? 'draft',
      filing_number: body.filing_number ?? null,
      filing_date: body.filing_date ?? null,
      grant_date: body.grant_date ?? null,
      jurisdiction: body.jurisdiction ?? null,
      assignee: body.assignee ?? null,
      title: String(body.title).trim(),
      abstract: body.abstract ?? null,
      cost_currency: body.cost_currency ?? 'INR',
      cost_amount: body.cost_amount ?? null,
      naac_criteria: body.naac_criteria ?? null,
      naac_metric_code: body.naac_metric_code ?? null,
      naac_score_claim: body.naac_score_claim ?? null,
      coinventors: Array.isArray(body.coinventors) ? body.coinventors : [],
      attachment_urls: Array.isArray(body.attachment_urls)
        ? body.attachment_urls
        : [],
    };

    const { data, error } = await (supabase as any)
      .from('ip_filings')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201, headers: corsHeaders });
  } catch (err: any) {
    console.error('[faculty-innovation/ip-filings:POST]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
