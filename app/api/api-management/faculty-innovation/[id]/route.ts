// app/api/api-management/faculty-innovation/[id]/route.ts
// Single-record API for a faculty initiative (GET / PATCH / soft-DELETE).

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

function scopedFilter(query: any, keyData: any) {
  const scopedInstitutionId =
    keyData.institution_id ?? keyData.organization_id ?? null;
  if (scopedInstitutionId) {
    return query.eq('institution_id', scopedInstitutionId);
  }
  return query;
}

// ============================================================================
// GET /faculty-innovation/[id]
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

    // Next.js 15: params may be a Promise; 14: plain object. Support both.
    const params: any = 'then' in (context.params as any)
      ? await (context.params as Promise<{ id: string }>)
      : (context.params as { id: string });
    const id = params.id;

    let query = (supabase as any)
      .from('faculty_initiatives')
      .select('*')
      .eq('id', id)
      .eq('is_active', true);
    query = scopedFilter(query, keyData);
    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    return NextResponse.json({ data }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[faculty-innovation:GET/:id]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================================================================
// PATCH /faculty-innovation/[id]
// ============================================================================
export async function PATCH(
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

    const params: any = 'then' in (context.params as any)
      ? await (context.params as Promise<{ id: string }>)
      : (context.params as { id: string });
    const id = params.id;
    const body = await request.json();

    // Whitelist of mutable columns (prevents accidental write to id/audit fields)
    const patch: Record<string, unknown> = {};
    const allowedFields = [
      'title',
      'abstract',
      'description',
      'category',
      'status',
      'approval_authority',
      'approval_sub_authority',
      'external_coinventors',
      'clinical_details',
      'research_details',
      'sh_publication_id',
      'attachment_urls',
      'current_approver_id',
      'source_note',
      'inventor_id',
    ];
    for (const f of allowedFields) {
      if (body[f] !== undefined) patch[f] = body[f];
    }

    let q = (supabase as any)
      .from('faculty_initiatives')
      .update(patch)
      .eq('id', id)
      .eq('is_active', true);
    q = scopedFilter(q, keyData);
    const { data, error } = await q.select('*').single();

    if (error) throw error;
    return NextResponse.json({ data }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[faculty-innovation:PATCH/:id]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================================================================
// DELETE (soft) /faculty-innovation/[id]
// ============================================================================
export async function DELETE(
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
    const params: any = 'then' in (context.params as any)
      ? await (context.params as Promise<{ id: string }>)
      : (context.params as { id: string });
    const id = params.id;

    let q = (supabase as any)
      .from('faculty_initiatives')
      .update({ is_active: false })
      .eq('id', id);
    q = scopedFilter(q, keyData);
    const { error } = await q;
    if (error) throw error;

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[faculty-innovation:DELETE/:id]', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
