import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireProcurement } from '@/lib/utils/procurement-auth';
import {
  MAX_REQUEST_FILE_BYTES,
  kindOf,
  readRequestItems,
} from '@/lib/procurement/request-items-reader';

export const runtime = 'nodejs';
// A Haiku read of a list normally finishes in 5-30s.
export const maxDuration = 60;

/**
 * POST /api/procurement/requests/read-items   multipart: file
 *
 * Reads a shared item list (Excel, CSV, PDF, photo, Word, text) into request
 * lines. Nothing is saved — the page shows the lines for the requester to check
 * before they are added to the request.
 *
 * Returns { lines, note } | { error }.
 */
export async function POST(req: NextRequest) {
  const user = await requireProcurement('procurement.request_create');
  if (!user) return NextResponse.json({ error: 'You do not have permission to raise requests.' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was attached.' }, { status: 400 });
  if (file.size > MAX_REQUEST_FILE_BYTES) {
    return NextResponse.json({ error: 'The file is larger than 10 MB — split it or use a smaller photo.' }, { status: 400 });
  }
  if (!kindOf(file.name, file.type)) {
    return NextResponse.json(
      { error: 'This file type cannot be read. Use Excel, CSV, PDF, Word (.docx), a photo, or a text file.' },
      { status: 400 }
    );
  }

  try {
    const result = await readRequestItems({
      name: file.name,
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[procurement read-items] failed:', err);
    const message =
      err instanceof Anthropic.RateLimitError
        ? 'The AI reader is busy — please try again in a minute.'
        : err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError
          ? 'AI reading is not available right now — please add the items by hand.'
          : err instanceof Anthropic.BadRequestError
            ? 'The AI could not open this file — try saving it as PDF or Excel.'
            : err instanceof Error && !(err instanceof Anthropic.APIError)
              ? err.message
              : 'The file could not be read — please add the items by hand.';
    return NextResponse.json({ error: message });
  }
}
