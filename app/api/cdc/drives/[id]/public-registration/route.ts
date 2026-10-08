export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * /api/cdc/drives/[id]/public-registration
 *
 *   GET  ?format=json (default) | xlsx
 *        Link state (enabled, token) + every public registration of the drive.
 *        Gate: cdc.drives.view OR cdc.drives.willingness.view.
 *   POST { enabled: boolean }
 *        Switch the public link on / off. The token is generated the first time
 *        and KEPT afterwards, so a QR that was already shared keeps working when
 *        the link is switched back on. Gate: cdc.drives.edit.
 *
 * Reads / writes run on the service-role client AFTER the gate — a campus
 * drive is multi-college, so the caller's own institution scope must not
 * silently drop rows.
 */

import { randomBytes } from 'crypto';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  PUBLIC_LINK_STATUSES,
  isPublicRegistrationOpen,
  type CdcDrivePublicRegistration,
} from '@/lib/services/cdc/drive-public-registration';
import type { CdcDrive } from '@/types/cdc';

type DriveRow = Pick<CdcDrive, 'id' | 'title' | 'status' | 'public_registration_enabled' | 'public_token'>;

const MIGRATION_HINT =
  'Public registration is not set up in the database yet — apply migration 20261003100000_cdc_drive_public_registration.sql.';

function safeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'drive';
}

/** 42703 = undefined column, 42P01 = undefined table, PGRST204/205 = not in schema cache. */
function isMissingSchema(err: { code?: string } | null): boolean {
  return !!err && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(err.code ?? '');
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [{ data: canView }, { data: canTrack }] = await Promise.all([
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.view' }),
      supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.willingness.view' }),
    ]);
    if (canView !== true && canTrack !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.view required' }, { status: 403 });
    }

    const service = createServiceRoleClient();
    const { data: driveData, error: driveErr } = await service
      .from('cdc_drives')
      .select('id, title, status, public_registration_enabled, public_token')
      .eq('id', id)
      .maybeSingle();
    if (isMissingSchema(driveErr)) {
      return NextResponse.json({ available: false, error: MIGRATION_HINT, enabled: false, token: null, open: false, registrations: [] });
    }
    if (driveErr) throw driveErr;
    if (!driveData) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    const drive = driveData as unknown as DriveRow;

    const { data: rows, error: regErr } = await service
      .from('cdc_drive_public_registrations')
      .select('*')
      .eq('drive_id', id)
      .order('created_at', { ascending: false })
      .limit(10000);
    if (isMissingSchema(regErr)) {
      return NextResponse.json({ available: false, error: MIGRATION_HINT, enabled: false, token: null, open: false, registrations: [] });
    }
    if (regErr) throw regErr;
    const registrations = (rows ?? []) as CdcDrivePublicRegistration[];

    if (new URL(request.url).searchParams.get('format') === 'xlsx') {
      const sheet = XLSX.utils.json_to_sheet(
        registrations.map((r, i) => ({
          'S.No': i + 1,
          Name: r.full_name,
          Gender: r.gender,
          Mobile: r.mobile,
          Email: r.email,
          'Register number': r.register_number ?? '',
          Institution: r.institution_name,
          Program: r.program_name,
          Semester: r.semester ?? '',
          CGPA: r.cgpa ?? '',
          Arrears: r.arrears ?? '',
          'JKKN learner match': r.learner_id ? 'Yes' : 'No',
          'In drive audience': r.in_audience == null ? '' : r.in_audience ? 'Yes' : 'No',
          'Registered at (IST)': new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        }))
      );
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Registrations');
      const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${safeFilename(drive.title)}_public_registrations.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({
      available: true,
      enabled: drive.public_registration_enabled === true,
      token: drive.public_token ?? null,
      open: isPublicRegistrationOpen(drive),
      can_enable: PUBLIC_LINK_STATUSES.includes(drive.status),
      status: drive.status,
      registrations,
    });
  } catch (err) {
    console.error('[cdc/drives/[id]/public-registration] GET error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: canEdit } = await supabase.rpc('user_has_permission', { permission_name: 'cdc.drives.edit' });
    if (canEdit !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
    }

    const service = createServiceRoleClient();
    const { data: driveData, error: driveErr } = await service
      .from('cdc_drives')
      .select('id, title, status, public_registration_enabled, public_token')
      .eq('id', id)
      .maybeSingle();
    if (isMissingSchema(driveErr)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 409 });
    if (driveErr) throw driveErr;
    if (!driveData) return NextResponse.json({ error: 'Drive not found' }, { status: 404 });
    const drive = driveData as unknown as DriveRow;

    if (body.enabled && !PUBLIC_LINK_STATUSES.includes(drive.status)) {
      return NextResponse.json(
        { error: 'Announce the drive first — a public link is available only after the drive is active.' },
        { status: 409 }
      );
    }

    const token = drive.public_token ?? (body.enabled ? randomBytes(9).toString('base64url') : null);
    const { data: updated, error: updErr } = await service
      .from('cdc_drives')
      .update({ public_registration_enabled: body.enabled, public_token: token, updated_by: user.id })
      .eq('id', id)
      .select('id, title, status, public_registration_enabled, public_token')
      .single();
    if (updErr) throw updErr;
    const next = updated as unknown as DriveRow;

    return NextResponse.json({
      enabled: next.public_registration_enabled === true,
      token: next.public_token ?? null,
      open: isPublicRegistrationOpen(next),
    });
  } catch (err) {
    console.error('[cdc/drives/[id]/public-registration] POST error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
