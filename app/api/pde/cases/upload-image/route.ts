// app/api/pde/cases/upload-image/route.ts
// ============================================================================
// Senior-Learner-uploaded clinical teaching image → pde-clinical-images bucket.
//
// Complements the PMS bridge (import-from-pms), which can only surface images
// that already live in PMS. This route accepts a de-identified image held
// locally — the alternative was pasting a URL to an uncontrolled third-party
// host, which defeats the point of owning the bucket.
//
// De-identification, same two layers as the PMS path:
//   1. METADATA — the browser re-encodes through a canvas before upload (decode
//      → re-encode drops EXIF/GPS/IPTC/XMP by construction). This route then
//      RE-VERIFIES server-side and fails closed, so a crafted POST that skips
//      the browser cannot land an EXIF-bearing file in the bucket.
//   2. BURNED-IN PIXELS — not solvable server-side; the uploaded image returns
//      as an unconfirmed CANDIDATE and the builder's per-image confirmation gate
//      applies to it exactly as it does to PMS imports (default-deny).
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { scanJpegForMetadata, isJpegMagic, stripJpegMetadata } from '@/lib/services/pde/jpeg-metadata';
import { requireCaseAuthor } from '@/lib/services/pde/require-case-author';

const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
const MIN_BYTES = 1024; // below this it is not a real photograph

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  // Teaching staff only — an authenticated learner must not be able to push
  // bytes into the shared clinical-image store.
  const gate = await requireCaseAuthor(supabase);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No image was attached.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That image is larger than 10 MB.' }, { status: 413 });
  }
  if (file.size < MIN_BYTES) {
    return NextResponse.json({ error: 'That file is too small to be a clinical image.' }, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());

  // Sniff the bytes rather than trusting the declared content type.
  if (!isJpegMagic(buf)) {
    return NextResponse.json(
      { error: 'The image could not be read as a JPEG. Please re-select the file.' },
      { status: 400 },
    );
  }

  // Strip every metadata-bearing segment server-side. The browser canvas already
  // dropped EXIF, but it attaches its own ICC colour profile — and a crafted POST
  // may carry anything at all — so the container is rewritten here rather than
  // merely inspected.
  const cleaned = stripJpegMetadata(buf);
  if (!cleaned) {
    return NextResponse.json(
      { error: 'The image could not be read as a valid JPEG. Please re-select the file.' },
      { status: 400 },
    );
  }

  // FAIL CLOSED: verify the rewrite actually produced a clean file. If this ever
  // trips, something is wrong with the strip and nothing gets stored.
  const scan = scanJpegForMetadata(cleaned);
  if (!scan.ok) {
    return NextResponse.json(
      {
        error:
          'This image could not be cleaned of embedded camera and location data, so it was not saved.',
      },
      { status: 422 },
    );
  }

  const admin = createServiceRoleClient();
  const path = `manual/${gate.userId}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await admin.storage
    .from('pde-clinical-images')
    .upload(path, cleaned, { contentType: 'image/jpeg', upsert: false });
  if (upErr) {
    return NextResponse.json({ error: 'The image could not be saved. Please try again.' }, { status: 502 });
  }

  const { data: pub } = admin.storage.from('pde-clinical-images').getPublicUrl(path);

  // Returned as a CANDIDATE — the builder still requires per-image confirmation
  // that no identifier is burned into the pixels before it can be attached.
  return NextResponse.json({
    image: { url: pub.publicUrl, kind: 'uploaded', seq: 0 },
  });
}
