// app/api/bos/sop/[id]/versions/[versionNo]/restore/route.ts
// POST /api/bos/sop/[id]/versions/[versionNo]/restore — replace the document's
// content with the snapshot at versionNo. Records a NEW snapshot as the latest
// so the restore itself is undoable (the old "current" content is preserved).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionNo: string }> }
) {
  try {
    const { id, versionNo } = await params;
    const versionNoInt = parseInt(versionNo, 10);
    if (Number.isNaN(versionNoInt)) {
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    }

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
      .select('id, institutions_id, current_version')
      .eq('id', id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'SOP not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { data: snapshot } = await supabase
      .from('bos_sop_versions')
      .select('content')
      .eq('document_id', id)
      .eq('version_no', versionNoInt)
      .maybeSingle();
    if (!snapshot) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const newVersionNo = existing.current_version + 1;

    const { data: updated, error: updErr } = await supabase
      .from('bos_sop_documents')
      .update({
        content: snapshot.content,
        current_version: newVersionNo,
        updated_by: user.id,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (updErr) {
      console.error('[restore] update error:', updErr);
      return NextResponse.json({ error: 'Failed to restore version' }, { status: 500 });
    }

    await supabase.from('bos_sop_versions').insert({
      document_id: id,
      version_no: newVersionNo,
      content: snapshot.content,
      note: `Restored from v${versionNoInt}`,
      created_by: user.id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[POST restore] error:', error);
    return NextResponse.json({ error: 'Failed to restore version' }, { status: 500 });
  }
}
