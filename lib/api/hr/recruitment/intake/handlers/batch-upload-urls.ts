// POST /api/hr/recruitment/intake/op?op=batch-upload-urls&id=:id
//   UploadUrlRequest { files: { name, size, type }[] }  (≤ 100, each ≤ 10 MB; pdf/doc/docx/jpg/png/zip)
//   → UploadUrlResponse { uploads: { name, path, signed_url, token, content_type }[] }
// Each resume then goes straight to the private 'hr-intake' bucket with
// uploadToSignedUrl(path, token, file, { contentType: content_type }), never
// through this route (Vercel caps request bodies near 4.5 MB).

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { UploadUrlRequest } from '@/types/hr-intake';
import { createUploadUrls } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse, readJson } from '@/app/api/hr/recruitment/intake/_lib/context';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    const body = await readJson<Partial<UploadUrlRequest>>(request);
    return NextResponse.json(await createUploadUrls(gate.deps, id, body));
  } catch (err) {
    return intakeErrorResponse('POST upload-urls', err);
  }
}
