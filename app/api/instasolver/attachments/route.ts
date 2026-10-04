// app/api/instasolver/attachments/route.ts
//
// InstaSolver photograph upload — issue photos, requirement photos and the
// photograph of finished work. Ported from the standalone product's
// /api/attachments/upload, with its checks kept (spec §9):
//
//   · signed in, and allowed to report (or on a maintenance team, for
//     resolution photos) — asked of the database via instasolver_my_access();
//   · at most MAX_PHOTO_BYTES, and the bytes must actually BE a JPEG / PNG /
//     WebP (magic-byte sniff; the declared content type is not trusted);
//   · a per-person hourly cap, so a script cannot fill the Shared Drive.
//
// The URL returned is an lh3.googleusercontent.com link. The database trigger
// instasolver_enforce_attachment_urls refuses any other host on the record, so
// a photo that did not come through here cannot be attached.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadInstaSolverAttachment, type InstaSolverAttachmentKind } from '@/lib/google/drive-upload';
import { MAX_PHOTO_BYTES } from '@/lib/instasolver/constants';

const HOURLY_CAP = 60;
const recent = new Map<string, number[]>();

function withinCap(userId: string): boolean {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const list = (recent.get(userId) ?? []).filter((t) => t > hourAgo);
  if (list.length >= HOURLY_CAP) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}

function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

const KINDS: InstaSolverAttachmentKind[] = ['issue', 'requirement', 'resolution'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to upload a photograph.' }, { status: 401 });
  }

  const { data: access, error: accessError } = await supabase.rpc('instasolver_my_access');
  if (accessError || !access) {
    return NextResponse.json({ error: 'Could not confirm your access. Try again.' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send the photograph as multipart form data.' }, { status: 400 });
  }

  const file = form.get('file');
  const kind = String(form.get('kind') ?? '') as InstaSolverAttachmentKind;
  const institutionId = String(form.get('institution_id') ?? '');

  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Unknown photograph kind.' }, { status: 400 });
  }
  const allowed =
    kind === 'resolution'
      ? access.is_maintenance === true || access.is_manager === true
      : access.can_report === true;
  if (!allowed) {
    return NextResponse.json({ error: 'You cannot upload this kind of photograph.' }, { status: 403 });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a photograph to upload.' }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `That photograph is larger than ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)} MB.` },
      { status: 413 }
    );
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImage(head);
  if (!sniffed) {
    return NextResponse.json({ error: 'Only JPEG, PNG or WebP photographs can be attached.' }, { status: 415 });
  }

  if (!withinCap(user.id)) {
    return NextResponse.json(
      { error: `You have uploaded ${HOURLY_CAP} photographs in the last hour. Try again later.` },
      { status: 429 }
    );
  }

  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'Photo storage is not configured. Tell the IT team.' }, { status: 503 });
  }

  let institutionName = 'Unspecified institution';
  if (institutionId) {
    const { data: inst } = await supabase.from('institutions').select('name').eq('id', institutionId).maybeSingle();
    if (inst?.name) institutionName = inst.name;
  }

  try {
    const typed = new File([await file.arrayBuffer()], file.name || `photo.${sniffed.split('/')[1]}`, {
      type: sniffed
    });
    const result = await uploadInstaSolverAttachment({ file: typed, kind, institutionName });
    return NextResponse.json({ url: result.url, name: result.name });
  } catch (err) {
    console.error('[instasolver/attachments] Drive upload failed', err);
    return NextResponse.json({ error: 'The photograph could not be stored. Try again.' }, { status: 502 });
  }
}
