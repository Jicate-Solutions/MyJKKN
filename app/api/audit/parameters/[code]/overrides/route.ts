export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Audit parameter per-institution overrides CRUD.
// Route: /api/audit/parameters/[code]/overrides
//
// Thrash T2 semantics: an override row shares the same `code` as a system
// parameter, has a non-null `institution_id`, and has `is_system=false`. The
// DB enforces (code, institution_id) uniqueness via a partial unique index
// for non-system rows, and RLS blocks editing system rows (`is_system=true`).
// We trust both — this route only sets/enforces the shape, not the auth.
//
// Endpoints:
//   GET    ?                    list overrides for the parameter code
//   POST   { institution_id, ... }  create a new override (upsert-style via service)
//   PATCH  { institution_id, ... }  update an existing override
//   DELETE ?institution_id=...       delete a specific override
//
// Error-mapping: unique-violation -> 409, permission-denied -> 403, otherwise 500.

import { NextResponse, connection } from 'next/server';
import { getAuthSession, createServerSupabaseClient } from '@/lib/supabase/server';
import { AuditParameterCatalogService } from '@/lib/services/audit';
import type {
  AuditParameterCatalogRow,
  EvidenceRequirementItem,
  FrameworkMapping,
} from '@/lib/types/audit';

interface OverrideBody {
  institution_id?: string;
  name?: string;
  description?: string | null;
  framework_mapping?: FrameworkMapping;
  default_owner_role?: string;
  escalation_role?: string | null;
  p1_sla_days?: number;
  p2_sla_days?: number;
  evidence_required?: EvidenceRequirementItem[];
  is_active?: boolean;
}

function mapErrorToStatus(message: string): number {
  const lowered = message.toLowerCase();
  if (
    lowered.includes('duplicate key') ||
    lowered.includes('unique constraint') ||
    lowered.includes('already exists')
  ) {
    return 409;
  }
  if (lowered.includes('permission denied') || lowered.includes('row-level security')) {
    return 403;
  }
  if (lowered.includes('not found')) {
    return 404;
  }
  return 500;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing parameter code' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await (supabase as any)
      .from('audit_parameter_catalog')
      .select('*')
      .eq('code', code)
      .not('institution_id', 'is', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as AuditParameterCatalogRow[];
    return NextResponse.json({
      data: rows,
      metadata: {
        parameter_code: code,
        count: rows.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('[audit/parameters/overrides] GET error:', error);
    return NextResponse.json({ error: message }, { status: mapErrorToStatus(message) });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing parameter code' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as OverrideBody;
    const institutionId = body.institution_id;
    if (!institutionId) {
      return NextResponse.json(
        { error: 'Missing required field: institution_id' },
        { status: 400 }
      );
    }

    // Block creation if override already exists — surface a friendly "edit it"
    // hint before the DB fires a unique-violation.
    const supabase = await createServerSupabaseClient();
    const { data: existing } = await (supabase as any)
      .from('audit_parameter_catalog')
      .select('id')
      .eq('code', code)
      .eq('institution_id', institutionId)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json(
        { error: 'Override already exists — edit it instead' },
        { status: 409 }
      );
    }

    const row = await AuditParameterCatalogService.upsertOverride(
      code,
      institutionId,
      {
        name: body.name,
        description: body.description ?? null,
        framework_mapping: body.framework_mapping,
        default_owner_role: body.default_owner_role,
        escalation_role: body.escalation_role ?? null,
        p1_sla_days: body.p1_sla_days,
        p2_sla_days: body.p2_sla_days,
        evidence_required: body.evidence_required,
      },
      { userId: session.user.id }
    );

    return NextResponse.json({
      data: row,
      metadata: { parameter_code: code, institution_id: institutionId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('[audit/parameters/overrides] POST error:', error);
    return NextResponse.json({ error: message }, { status: mapErrorToStatus(message) });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing parameter code' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as OverrideBody;
    const institutionId = body.institution_id;
    if (!institutionId) {
      return NextResponse.json(
        { error: 'Missing required field: institution_id' },
        { status: 400 }
      );
    }

    // upsertOverride handles both insert + update via onConflict.
    const row = await AuditParameterCatalogService.upsertOverride(
      code,
      institutionId,
      {
        name: body.name,
        description: body.description ?? null,
        framework_mapping: body.framework_mapping,
        default_owner_role: body.default_owner_role,
        escalation_role: body.escalation_role ?? null,
        p1_sla_days: body.p1_sla_days,
        p2_sla_days: body.p2_sla_days,
        evidence_required: body.evidence_required,
      },
      { userId: session.user.id }
    );

    // If caller flipped is_active, apply that as a follow-up update (service
    // doesn't accept it in the payload shape today).
    if (typeof body.is_active === 'boolean') {
      const supabase = await createServerSupabaseClient();
      await (supabase as any)
        .from('audit_parameter_catalog')
        .update({ is_active: body.is_active })
        .eq('id', row.id);
      row.is_active = body.is_active;
    }

    return NextResponse.json({
      data: row,
      metadata: { parameter_code: code, institution_id: institutionId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('[audit/parameters/overrides] PATCH error:', error);
    return NextResponse.json({ error: message }, { status: mapErrorToStatus(message) });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: 'Missing parameter code' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    if (!institutionId) {
      return NextResponse.json(
        { error: 'Missing required query param: institution_id' },
        { status: 400 }
      );
    }

    await AuditParameterCatalogService.deleteOverride(code, institutionId);

    return NextResponse.json({
      data: { ok: true },
      metadata: { parameter_code: code, institution_id: institutionId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('[audit/parameters/overrides] DELETE error:', error);
    return NextResponse.json({ error: message }, { status: mapErrorToStatus(message) });
  }
}
