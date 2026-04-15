// app/api/api-management/faculty-innovation/route.ts
// B2A-friendly API endpoint for faculty_initiatives.
// Follows the pattern in app/api/api-management/organizations/institutions/route.ts:
//   - OPTIONS for CORS preflight
//   - Bearer API key required (SHA-256 hashed, matched against api_keys.key_value)
//   - Pagination + filters
//   - Service-role client to bypass RLS (API key is the auth boundary)

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
// GET: list faculty initiatives
// ============================================================================
export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const page = Math.max(parseInt(url.searchParams.get('page') || '1'), 1);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get('limit') || '20'), 1),
      100
    );
    const search = url.searchParams.get('search');
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const approvalAuthority = url.searchParams.get('approval_authority');
    const inventorId = url.searchParams.get('inventor_id');

    // Scope to API key's institution (if bound). NULL institution_id on the key =
    // super-key that can query any institution via ?institution_id= param.
    const institutionIdParam = url.searchParams.get('institution_id');
    const scopedInstitutionId =
      keyData.institution_id ??
      keyData.organization_id ??
      institutionIdParam ??
      null;

    let query = (supabase as any)
      .from('faculty_initiatives')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (scopedInstitutionId) {
      query = query.eq('institution_id', scopedInstitutionId);
    }
    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (approvalAuthority) query = query.eq('approval_authority', approvalAuthority);
    if (inventorId) {
      query = query.or(
        `inventor_id.eq.${inventorId},original_inventor_id.eq.${inventorId}`
      );
    }
    if (search) {
      const s = search.replace(/[%_]/g, '\\$&');
      query = query.or(`title.ilike.%${s}%,abstract.ilike.%${s}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query
      .range(from, to)
      .order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    // Touch last_used_at for the API key (audit trail)
    await (supabase as any)
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json(
      {
        data: data ?? [],
        metadata: {
          total: count ?? 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[faculty-innovation:GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================================================================
// POST: create a faculty initiative (B2A use — e.g. bulk import)
// ============================================================================
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const required = ['institution_id', 'inventor_id', 'title', 'abstract', 'category'];
    for (const f of required) {
      if (!body[f]) {
        return NextResponse.json(
          { error: `Missing required field: ${f}` },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // Scope to key's institution when set
    const scopedInstitutionId =
      keyData.institution_id ?? keyData.organization_id ?? body.institution_id;

    if (keyData.institution_id && body.institution_id !== keyData.institution_id) {
      return NextResponse.json(
        { error: 'API key is bound to a different institution' },
        { status: 403, headers: corsHeaders }
      );
    }

    const insert = {
      institution_id: scopedInstitutionId,
      original_inventor_id: body.inventor_id,
      inventor_id: body.inventor_id,
      title: String(body.title).trim(),
      abstract: String(body.abstract).trim(),
      description: body.description ?? null,
      category: body.category,
      status: body.status ?? 'draft',
      external_coinventors: Array.isArray(body.external_coinventors)
        ? body.external_coinventors
        : [],
      clinical_details: body.clinical_details ?? null,
      research_details: body.research_details ?? null,
      attachment_urls: Array.isArray(body.attachment_urls)
        ? body.attachment_urls
        : [],
      source: body.source ?? 'bulk_import',
      source_note: body.source_note ?? null,
    };

    const { data, error } = await (supabase as any)
      .from('faculty_initiatives')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;

    await (supabase as any)
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({ data }, { status: 201, headers: corsHeaders });
  } catch (err: any) {
    console.error('[faculty-innovation:POST] Error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
