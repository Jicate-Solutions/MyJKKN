// app/api/mba/dept-artifacts/history/route.ts
// GET ?area_id=<uuid>&artifact_type=<type> — the version history for one artifact,
// newest first. RLS-scoped (same read authority as the artifacts).
//
// For a POLICY this is also the document trail: every uploaded file is recorded
// here, and the one that is still live has superseded_at = null. The person who
// replaced a version is resolved to a name so the history reads as "replaced by X
// on <date>" rather than a bare id.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface VersionRow {
  id: string;
  version: number;
  content: Record<string, unknown>;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string | null;
  source: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  uploaded_at: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const areaId = request.nextUrl.searchParams.get('area_id');
    const artifactType = request.nextUrl.searchParams.get('artifact_type');
    if (!areaId || !artifactType) {
      return NextResponse.json(
        { error: 'area_id and artifact_type are required' },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('mba_dept_artifact_versions')
      .select(
        'id, version, content, approved_by, approved_at, created_at, source, file_name, file_size, file_mime, uploaded_at, superseded_at, superseded_by',
      )
      .eq('area_id', areaId)
      .eq('artifact_type', artifactType)
      .order('version', { ascending: false });

    if (error) {
      console.error('[GET /api/mba/dept-artifacts/history] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    const rows = (data ?? []) as VersionRow[];

    // Resolve only the ids that actually appear (never a bulk directory read).
    const ids = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.approved_by, r.superseded_by])
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const admin = createServiceRoleClient();
      const { data: people, error: peopleError } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      if (peopleError) {
        // Not fatal — the history is still readable without names.
        console.error('[GET /api/mba/dept-artifacts/history] Name lookup:', peopleError.message);
      }
      for (const p of (people ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>) {
        const label = (p.full_name ?? '').trim() || p.email || '';
        if (label) nameById.set(p.id, label);
      }
    }

    return NextResponse.json({
      versions: rows.map((r) => ({
        ...r,
        approved_by_name: r.approved_by ? (nameById.get(r.approved_by) ?? null) : null,
        superseded_by_name: r.superseded_by ? (nameById.get(r.superseded_by) ?? null) : null,
      })),
    });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts/history] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
