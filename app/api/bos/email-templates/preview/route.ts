import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { renderBosEmailTemplate, BOS_TEMPLATE_PREVIEW_VALUES } from '@/lib/services/bos-email-templates';

// ── POST /api/bos/email-templates/preview ────────────────────────────────────
// Render a template with mock placeholder values without persisting anything.
// Used by the live-preview pane in the editor — accepts the IN-FLIGHT subject
// and body so the preview reflects unsaved edits.

const previewSchema = z.object({
  subject: z.string().min(1),
  body_html: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { subject, body_html } = parsed.data;
    const rendered = renderBosEmailTemplate(
      { subject, body_html },
      BOS_TEMPLATE_PREVIEW_VALUES
    );

    return NextResponse.json({ data: rendered });
  } catch (error) {
    console.error('[bos/email-templates/preview] error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to render preview' },
      { status: 500 }
    );
  }
}
