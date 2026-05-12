import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

type Params = { params: Promise<{ regulationId: string; code: string }> };

// ── GET /api/bos/taxonomy/[regulationId]/programmes/[code]/po-pso-mapping ──────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { regulationId, code } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('bos_po_pso_mapping')
      .select('po_code, pso_code')
      .eq('regulation_id', regulationId)
      .eq('programme_code', code.toUpperCase());

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET po-pso-mapping]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST /api/bos/taxonomy/[regulationId]/programmes/[code]/po-pso-mapping ─────
// Body: { mappings: { po_code: string; pso_code: string }[]; institutions_id: string }
// Replaces all existing mappings for this regulation + programme.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { regulationId, code } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);
    const body = await req.json() as {
      mappings: { po_code: string; pso_code: string }[];
      institutions_id: string;
    };

    const programmeCode = code.toUpperCase();

    // Delete existing mappings for this regulation + programme
    const { error: delError } = await supabase
      .from('bos_po_pso_mapping')
      .delete()
      .eq('regulation_id', regulationId)
      .eq('programme_code', programmeCode);

    if (delError) throw delError;

    // Insert new mappings (skip if empty)
    if (body.mappings.length > 0) {
      const rows = body.mappings.map((m) => ({
        regulation_id: regulationId,
        programme_code: programmeCode,
        institutions_id: body.institutions_id,
        po_code: m.po_code,
        pso_code: m.pso_code,
        created_by: user.id,
      }));

      const { error: insError } = await supabase
        .from('bos_po_pso_mapping')
        .insert(rows);

      if (insError) throw insError;
    }

    return NextResponse.json({ success: true, count: body.mappings.length });
  } catch (error) {
    console.error('[POST po-pso-mapping]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
