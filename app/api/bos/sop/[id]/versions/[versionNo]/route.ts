// app/api/bos/sop/[id]/versions/[versionNo]/route.ts
// GET /api/bos/sop/[id]/versions/[versionNo] — fetch a specific snapshot's content.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
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

    const { data, error } = await supabase
      .from('bos_sop_versions')
      .select('*')
      .eq('document_id', id)
      .eq('version_no', versionNoInt)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/bos/sop/[id]/versions/[versionNo]] error:', error);
    return NextResponse.json({ error: 'Failed to fetch version' }, { status: 500 });
  }
}
