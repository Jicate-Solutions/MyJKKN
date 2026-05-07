export const dynamic = 'force-dynamic';

// GET /api/id-cards/templates/:id/render?student_id=<uuid>
// Phase 1C — STUB. Real renderer (template + student → composited PNG) ships
// in a follow-up PR. This route exists so consumer UIs and the agent station
// can wire against the URL contract today.
//
// Auth: super_admin / registrar / admission_admin (user session) OR agent-token.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireUserOrAgent, isAuthFailure } from '@/lib/id-cards/auth';
import { TEMPLATE_RENDER_ROLES } from '@/lib/id-cards/types';

const paramsSchema = z.string().uuid();
const querySchema = z.object({ student_id: z.string().uuid() });

// 1x1 transparent PNG, base64 — placeholder until the real renderer lands.
const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const auth = await requireUserOrAgent(request, TEMPLATE_RENDER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const { id } = await params;
    const parsedId = paramsSchema.safeParse(id);
    if (!parsedId.success) {
      return jsonError('Template id must be a valid uuid', 'bad_request', 400);
    }

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      student_id: url.searchParams.get('student_id')
    });
    if (!parsedQuery.success) {
      return jsonError(
        `Invalid query: ${parsedQuery.error.issues.map((i) => i.message).join('; ')}`,
        'bad_request',
        400
      );
    }

    // STUB — real implementation will:
    //   1. Fetch the template config (background, fields, layout) from id_card_templates.
    //   2. Fetch the student row (name, photo, dept, batch) and resolve photo via id_card.photo_fallback.
    //   3. Composite a 1014x638 PNG (CR80 @ 300dpi) using a server-side canvas/sharp pipeline.
    //   4. Return base64 of the PNG.
    return jsonOk({
      png_base64: PLACEHOLDER_PNG_BASE64,
      stub: true,
      template_id: parsedId.data,
      student_id: parsedQuery.data.student_id,
      message: 'Phase 1C placeholder — real rendering ships in a follow-up PR.'
    });
  } catch (err) {
    console.error('[id-cards/templates/render] unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}
