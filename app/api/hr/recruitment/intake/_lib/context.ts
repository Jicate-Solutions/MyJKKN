/**
 * Shared gate and wiring for /api/hr/recruitment/intake/**.
 *
 * Gate: hr.recruitment.create (or super admin / admin), checked with the
 * caller's own session — the same RPCs the RLS policies use, so the route and
 * the database agree on who is in. Scope is then enforced by RLS on every
 * intake table and on hr_recruitment_jobs: the session client only READS;
 * every write is the service's, after that read (see intake-service.ts).
 * The actor's name comes from profiles here, on the server.
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { deleteDriveFile, uploadResumeToJobFolder } from '@/lib/google/drive-upload';
import type { ResumeExtractor } from '@/types/hr-intake';
import { IntakeError, type IntakeActor, type IntakeDeps } from '@/lib/services/hr/intake/intake-service';
import { UploadLimitError } from '@/lib/services/hr/intake/expand-upload';

export type IntakeContext = { deps: IntakeDeps; actor: IntakeActor };

/** The caller's context, or the refusal to send back. Check with `instanceof NextResponse`. */
export async function intakeContext(
  extractor: ResumeExtractor | null = null,
): Promise<IntakeContext | NextResponse> {
  const session = await createClient();
  const { data: { user }, error: authErr } = await session.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const [superAdmin, admin, canCreate] = await Promise.all([
    session.rpc('is_super_admin'),
    session.rpc('is_admin'),
    session.rpc('user_has_permission', { permission_name: 'hr.recruitment.create' }),
  ]);
  if (superAdmin.data !== true && admin.data !== true && canCreate.data !== true) {
    return NextResponse.json(
      { error: 'You do not have access to the HR intake helper. It needs the recruitment "create" permission.' },
      { status: 403 },
    );
  }

  const { data: profile, error: profileErr } = await session
    .from('profiles')
    .select('full_name, institution_id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ error: `Could not read your profile: ${profileErr.message}` }, { status: 500 });
  }

  let serviceClient;
  try {
    serviceClient = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'The server is missing its storage credentials.' }, { status: 500 });
  }

  return {
    actor: {
      id: user.id,
      name: (profile?.full_name as string | null | undefined) ?? null,
      institution_id: (profile?.institution_id as string | null | undefined) ?? null,
      is_super_admin: superAdmin.data === true,
    },
    deps: { db: session, admin: serviceClient, upload: uploadResumeToJobFolder, deleteFile: deleteDriveFile, extractor },
  };
}

/** Every refusal as { error } with a real status code (rule #27). */
export function intakeErrorResponse(where: string, err: unknown): NextResponse {
  if (err instanceof IntakeError) {
    return NextResponse.json({ ...(err.details ?? {}), error: err.message }, { status: err.status });
  }
  if (err instanceof UploadLimitError) return NextResponse.json({ error: err.message }, { status: 413 });
  console.error(`[hr/recruitment/intake] ${where}`, err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Something went wrong on the server.' },
    { status: 500 },
  );
}

/** JSON body, or null when there is none. A malformed body is a 400, not a crash. */
export async function readJson<T>(request: Request): Promise<T | null> {
  const text = await request.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IntakeError('The request body is not valid JSON.', 400);
  }
}
