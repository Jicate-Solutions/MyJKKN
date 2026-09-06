// app/api/mba/dept-artifacts/policy-file/route.ts
// GET ?area_id=<uuid>[&version_id=<uuid>] — a short-lived signed URL for an
// uploaded department policy document. Omit version_id for the live document.
//
// The bucket is PRIVATE and stays private: this is the only way in, and the only
// URL it ever hands out expires in five minutes.
//
// Authorization is proved by the read itself. The storage path is looked up
// through the CALLER'S OWN client, so mba_dept_artifacts / _versions RLS decides
// whether they may see it — the same board-people audience that already sees the
// organogram and SOP (decision 5: visibility is not widened). A client-supplied
// path is never accepted, so nobody can ask for another department's file.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { POLICY_BUCKET } from '@/lib/services/mba-dept-artifacts/types';

const SIGNED_URL_TTL_SECONDS = 300;

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
    const versionId = request.nextUrl.searchParams.get('version_id');
    if (!areaId) {
      return NextResponse.json({ error: 'area_id is required' }, { status: 400 });
    }

    let filePath: string | null = null;
    let fileName: string | null = null;

    if (versionId) {
      const { data, error } = await supabase
        .from('mba_dept_artifact_versions')
        .select('file_path, file_name')
        .eq('id', versionId)
        .eq('area_id', areaId)
        .eq('artifact_type', 'policy')
        .maybeSingle();
      if (error) {
        console.error('[GET /api/mba/dept-artifacts/policy-file] Version query:', error.message);
        return NextResponse.json({ error: 'Failed to look up that version' }, { status: 500 });
      }
      filePath = data?.file_path ?? null;
      fileName = data?.file_name ?? null;
    } else {
      const { data, error } = await supabase
        .from('mba_dept_artifacts')
        .select('file_path, file_name')
        .eq('area_id', areaId)
        .eq('artifact_type', 'policy')
        .maybeSingle();
      if (error) {
        console.error('[GET /api/mba/dept-artifacts/policy-file] Artifact query:', error.message);
        return NextResponse.json({ error: 'Failed to look up that policy' }, { status: 500 });
      }
      filePath = data?.file_path ?? null;
      fileName = data?.file_name ?? null;
    }

    // Either there is no document, or this person may not see it. Both are a 404
    // here on purpose — telling them which one would itself leak.
    if (!filePath) {
      return NextResponse.json({ error: 'No policy document on file' }, { status: 404 });
    }

    const admin = createServiceRoleClient();
    const { data: signed, error: signError } = await admin.storage
      .from(POLICY_BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS, {
        download: fileName ?? undefined,
      });
    if (signError || !signed?.signedUrl) {
      console.error(
        '[GET /api/mba/dept-artifacts/policy-file] Sign:',
        signError?.message ?? 'no url returned',
      );
      return NextResponse.json({ error: 'Could not open that document' }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      file_name: fileName,
      expires_in: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error('[GET /api/mba/dept-artifacts/policy-file] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
