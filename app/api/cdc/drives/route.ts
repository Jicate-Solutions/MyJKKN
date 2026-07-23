export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';
import type { CdcDriveStatus } from '@/types/cdc';

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

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const statuses = url.searchParams.getAll('status') as CdcDriveStatus[];
    const result = await CdcDriveService.listDrives(supabase, {
      status: statuses.length > 0 ? statuses : undefined,
      recruiter_id: url.searchParams.get('recruiter_id') ?? undefined,
      drive_type_id: url.searchParams.get('drive_type_id') ?? undefined,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      page: url.searchParams.get('page') ? parseInt(url.searchParams.get('page')!, 10) : 1,
      pageSize: url.searchParams.get('pageSize')
        ? parseInt(url.searchParams.get('pageSize')!, 10)
        : 50,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cdc/drives] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.title || !body.recruiter_id || !body.drive_type_id) {
      return NextResponse.json(
        { error: 'title, recruiter_id, and drive_type_id are required' },
        { status: 400 }
      );
    }

    const created = await CdcDriveService.createDrive(supabase, body, user.id);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    console.error('[cdc/drives] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
