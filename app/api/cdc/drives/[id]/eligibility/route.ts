export const dynamic = 'force-dynamic';

// app/api/cdc/drives/[id]/eligibility/route.ts
//
// GET  — the drive's eligibility criteria (null when never set), plus how many
//        active learners those criteria currently match.
// PUT  — create or replace the criteria. Writes are gated by RLS
//        (`cdc_drive_eligibility_write` USING/WITH CHECK is_cdc_staff()), so a
//        non-CDC caller gets a Postgres RLS error surfaced as 400, not a silent
//        no-op.
//
// This is the writer the module never had — see lib/services/cdc/eligibility-service.ts
// for why three readers existed with no writer.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import { CdcEligibilityService } from '@/lib/services/cdc/eligibility-service';
import type { CdcDriveEligibilityInput } from '@/types/cdc';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await CdcEligibilityService.getEligibility(supabase, id);
    let matching_learners: number | null = null;
    if (data) {
      const drive = await CdcDriveService.getDrive(supabase, id);
      matching_learners = await CdcEligibilityService.countMatchingLearners(
        createServiceRoleClient(),
        data.program_ids,
        drive?.institutions ?? []
      );
    }

    return NextResponse.json({ data, matching_learners });
  } catch (err) {
    console.error('[cdc/drives/[id]/eligibility] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CdcDriveEligibilityInput;
    if (!Array.isArray(body.program_ids) || body.program_ids.length === 0) {
      return NextResponse.json(
        { error: 'Choose at least one program. Eligibility with no program reaches no learner.' },
        { status: 400 }
      );
    }

    const data = await CdcEligibilityService.upsertEligibility(supabase, id, body, user.id);
    const drive = await CdcDriveService.getDrive(supabase, id);
    const matching_learners = await CdcEligibilityService.countMatchingLearners(
      createServiceRoleClient(),
      data.program_ids,
      drive?.institutions ?? []
    );

    return NextResponse.json({ data, matching_learners });
  } catch (err) {
    console.error('[cdc/drives/[id]/eligibility] PUT error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
