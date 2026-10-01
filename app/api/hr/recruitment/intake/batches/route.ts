export const dynamic = 'force-dynamic';

// GET  /api/hr/recruitment/intake/batches — the batches this person can see, newest first.
// POST /api/hr/recruitment/intake/batches — multipart `export` (one .csv/.tsv/.txt/.xlsx/.xls),
//      plus an optional `institution_id`: any college this person's access reaches
//      (Director ruling, 1 Oct); without it, their home college. A college they
//      cannot reach -> 403, and someone with no home college who sends none -> 400,
//      both with { needs_institution: true, institutions } (the colleges they may
//      choose); an id of no college -> 400 "That college does not exist".
//      Parses it now and holds the rows; resumes follow through upload-urls,
//      then prepare proposes. → 201 { batch } with status 'preparing'.

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createBatch, listBatches } from '@/lib/services/hr/intake/intake-service';
import { LIMITS_TEXT, MAX_EXPORT_BYTES } from '@/lib/hr/intake/limits';
import { intakeContext, intakeErrorResponse } from '../_lib/context';

export async function GET() {
  await connection();
  try {
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    const batches = await listBatches(gate.deps);
    return NextResponse.json({ batches });
  } catch (err) {
    return intakeErrorResponse('GET batches', err);
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Send the export as a multipart form with an "export" file.' }, { status: 400 });
    }
    const file = form.get('export');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Attach the CVViZ export as "export".' }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: 'The export file is empty.' }, { status: 400 });
    if (file.size > MAX_EXPORT_BYTES) {
      return NextResponse.json(
        { error: `The export is larger than ${LIMITS_TEXT.export}. Export fewer candidates at a time.` },
        { status: 413 },
      );
    }

    const chosen = form.get('institution_id');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { batch } = await createBatch(
      gate.deps,
      gate.actor,
      { name: file.name || 'export.csv', bytes },
      typeof chosen === 'string' ? chosen : null,
    );
    return NextResponse.json({ batch }, { status: 201 });
  } catch (err) {
    return intakeErrorResponse('POST batches', err);
  }
}
