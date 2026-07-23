// app/api/bos/sop/[id]/route.ts
// GET    /api/bos/sop/[id] — fetch a single SOP document.
// PUT    /api/bos/sop/[id] — patch fields. With { snapshot:true } also writes
//                            a row into bos_sop_versions and bumps current_version.
// DELETE /api/bos/sop/[id] — hard-delete the document. ON DELETE CASCADE
//                            clears versions + comments.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { UpdateBosSopDocumentDto } from '@/types/bos-sop';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bos_sop_documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/bos/sop/[id]] error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch SOP document' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json({ error: 'SOP document not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/bos/sop/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SOP document' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body = (await request.json()) as UpdateBosSopDocumentDto;

    const { data: existing } = await supabase
      .from('bos_sop_documents')
      .select('id, institutions_id, current_version')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'SOP document not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const patch: Record<string, unknown> = { updated_by: user.id };
    if (body.title !== undefined) patch.title = body.title.trim();
    if (body.category !== undefined) patch.category = body.category;
    if (body.description !== undefined) patch.description = body.description ?? null;
    if (body.language !== undefined) patch.language = body.language;
    if (body.status !== undefined) patch.status = body.status;
    if (body.content !== undefined) patch.content = body.content;
    if (body.page_settings !== undefined) patch.page_settings = body.page_settings;

    // If snapshot=true, bump current_version atomically and capture a snapshot row.
    let newVersionNo = existing.current_version;
    if (body.snapshot) {
      newVersionNo = existing.current_version + 1;
      patch.current_version = newVersionNo;
    }

    const { data: updated, error } = await supabase
      .from('bos_sop_documents')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[PUT /api/bos/sop/[id]] update error:', error);
      return NextResponse.json({ error: 'Failed to update SOP' }, { status: 500 });
    }

    if (body.snapshot) {
      const { error: vErr } = await supabase.from('bos_sop_versions').insert({
        document_id: id,
        version_no: newVersionNo,
        content: updated.content,
        note: body.snapshot_note ?? null,
        created_by: user.id,
      });
      if (vErr) {
        // Don't fail the whole update — the doc is saved. Log only.
        console.error('[PUT /api/bos/sop/[id]] version snapshot failed:', vErr);
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[PUT /api/bos/sop/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to update SOP document' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const { data: existing } = await supabase
      .from('bos_sop_documents')
      .select('id, institutions_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'SOP document not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { error } = await supabase.from('bos_sop_documents').delete().eq('id', id);
    if (error) {
      console.error('[DELETE /api/bos/sop/[id]] error:', error);
      return NextResponse.json({ error: 'Failed to delete SOP' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[DELETE /api/bos/sop/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete SOP document' },
      { status: 500 }
    );
  }
}
