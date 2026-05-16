// app/api/bos/sop/[id]/versions/route.ts
// GET /api/bos/sop/[id]/versions — list version snapshots (newest first).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
      .from('bos_sop_versions')
      .select('id, document_id, version_no, note, created_by, created_at')
      .eq('document_id', id)
      .order('version_no', { ascending: false });

    if (error) {
      console.error('[GET /api/bos/sop/[id]/versions] error:', error);
      return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('[GET /api/bos/sop/[id]/versions] error:', error);
    return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
  }
}
