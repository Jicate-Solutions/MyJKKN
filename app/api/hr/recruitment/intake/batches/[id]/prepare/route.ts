export const dynamic = 'force-dynamic';
// Reading up to 60 resumes, three at a time, can take minutes.
export const maxDuration = 300;

// POST /api/hr/recruitment/intake/batches/:id/prepare
//   PrepareRequest { uploaded: { name, path }[] } → { batch, rows }
// Expands any .zip, pairs files with the export's rows, reads the resumes,
// proposes one action per row and marks the batch 'ready'. Calling it again on
// a ready batch returns the same batch and rows.

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { PrepareRequest, ResumeExtractor } from '@/types/hr-intake';
import { prepareBatch } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse, readJson } from '../../../_lib/context';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const extractor: ResumeExtractor | null = null; // INTEGRATOR: wire lane B's createResumeExtractor()
    const gate = await intakeContext(extractor);
    if (gate instanceof NextResponse) return gate;
    const body = await readJson<Partial<PrepareRequest>>(request);
    return NextResponse.json(await prepareBatch(gate.deps, gate.actor, id, body));
  } catch (err) {
    return intakeErrorResponse('POST prepare', err);
  }
}
