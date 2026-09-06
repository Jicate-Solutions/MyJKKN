// app/api/bos/sop/route.ts
// GET  /api/bos/sop  — list SOP documents (paginated, filtered).
// POST /api/bos/sop  — create a new SOP document.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { counsellingCodeFor } from '@/lib/utils/bos/institution-scope';
import {
  BosSopDocumentSummary,
  BosSopFilters,
  CreateBosSopDocumentDto,
  SOP_CATEGORIES,
  SOP_LANGUAGES,
  SOP_STATUSES,
  SopDocContent,
} from '@/types/bos-sop';
import { getSopTemplateContent } from '@/lib/sop/templates';

const EMPTY_DOC: SopDocContent = { type: 'doc', content: [] };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const { searchParams } = new URL(request.url);

    const filters: BosSopFilters = {
      institutionsId: scope.isSuperAdmin
        ? searchParams.get('institutionsId') ?? undefined
        : scope.institutionsId ?? undefined,
      status: (searchParams.get('status') as BosSopFilters['status']) ?? undefined,
      category: (searchParams.get('category') as BosSopFilters['category']) ?? undefined,
      language: (searchParams.get('language') as BosSopFilters['language']) ?? undefined,
      search: searchParams.get('search') ?? undefined,
      page: searchParams.has('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.has('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: (searchParams.get('sortBy') as BosSopFilters['sortBy']) ?? 'updated_at',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'desc',
    };

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    // List view omits the heavy `content` and `plain_text` columns.
    let query = supabase
      .from('bos_sop_documents')
      .select(
        'id, institutions_id, title, category, description, language, status, current_version, created_at, updated_at',
        { count: 'exact' }
      );

    if (filters.institutionsId) {
      // CAS-aware via the denormalized counselling_code: list SOP documents from
      // both Aided + Self-Financing UUIDs of a CAS college.
      const code = await counsellingCodeFor(supabase, filters.institutionsId);
      query = code
        ? query.eq('counselling_code', code)
        : query.eq('institutions_id', filters.institutionsId);
    }
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.language) query = query.eq('language', filters.language);
    if (filters.search) {
      // Search title/description first; the GIN index on plain_text is used
      // by an explicit full-text query (added later) — this proxy keeps the
      // common case fast and correct.
      query = query.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    query = query
      .order(filters.sortBy ?? 'updated_at', { ascending: filters.sortOrder !== 'desc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: (data ?? []) as BosSopDocumentSummary[],
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/bos/sop] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SOP documents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body = (await request.json()) as CreateBosSopDocumentDto;

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    let institutionsId =
      body.institutions_id ?? scope.institutionsId ?? scope.userInstitutionId ?? undefined;
    // Last-resort fallback for super_admin whose Supabase profile has institution_id = null:
    // decode the COE access_token cookie (no sig verification — used only to pick a default).
    if (!institutionsId) {
      const coeToken = request.cookies.get('access_token')?.value ?? '';
      try {
        const payload = JSON.parse(atob(coeToken.split('.')[1] ?? ''));
        if (typeof payload?.institution_id === 'string') institutionsId = payload.institution_id;
      } catch { /* ignore — malformed token */ }
    }
    if (!institutionsId) {
      return NextResponse.json(
        { error: 'institutions_id is required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, institutionsId);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Resolve content from template if requested; fallback to empty doc.
    let content: SopDocContent = body.content ?? EMPTY_DOC;
    if (body.template_id) {
      const tplContent = getSopTemplateContent(body.template_id);
      if (tplContent) content = tplContent;
    }

    const category = body.category && SOP_CATEGORIES.includes(body.category)
      ? body.category
      : 'general';
    const language = body.language && SOP_LANGUAGES.includes(body.language)
      ? body.language
      : 'en';

    const { data: created, error } = await supabase
      .from('bos_sop_documents')
      .insert({
        institutions_id: institutionsId,
        title: body.title.trim(),
        category,
        description: body.description ?? null,
        language,
        status: 'draft',
        content,
        page_settings: body.page_settings ?? {},
        created_by: user.id,
        updated_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[POST /api/bos/sop] insert error:', error);
      return NextResponse.json({ error: 'Failed to create SOP document' }, { status: 500 });
    }

    // Capture the initial version snapshot so version history begins at v1.
    await supabase.from('bos_sop_versions').insert({
      document_id: created.id,
      version_no: 1,
      content,
      note: 'Initial version',
      created_by: user.id,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/sop] error:', error);
    return NextResponse.json(
      { error: 'Failed to create SOP document' },
      { status: 500 }
    );
  }
}

// Re-export status/lang/category arrays as a convenience for any clients
// importing from the route file directly.
export { SOP_STATUSES, SOP_LANGUAGES, SOP_CATEGORIES };
