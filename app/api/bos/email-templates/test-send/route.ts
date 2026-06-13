import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { renderBosEmailTemplate, BOS_TEMPLATE_PREVIEW_VALUES } from '@/lib/services/bos-email-templates';
import { resolveBosSmtpConfig, sendBosEmail } from '@/lib/services/bos-email-sender';
import { resolveBosBoardScope } from '@/lib/utils/bos/bos-access';

// ── POST /api/bos/email-templates/test-send ──────────────────────────────────
// Sends a single TEST email directly via the institution's saved SMTP config
// (no queue) and writes one row to bos_email_send_log. Subject is prefixed
// with [TEST] so it's unmistakable in the recipient's inbox.

const testSendSchema = z.object({
  recipient_email: z.string().email(),
  subject: z.string().min(1).max(500),
  body_html: z.string().min(10).max(100000),
  institutionsId: z.string().uuid().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission gate — same set that can edit templates.
    const scope = await resolveBosBoardScope(user.id);
    const allowed =
      scope.isSuperAdmin ||
      scope.isPrincipal ||
      scope.isChairmanIn.size > 0;
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden: only chairman/principal/super-admin can test-send' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = testSendSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.issues.map((iss) => {
        const path = iss.path.length > 0 ? iss.path.join('.') : '(root)';
        return `${path}: ${iss.message}`;
      });
      return NextResponse.json(
        { error: `Invalid payload — ${fieldErrors.join('; ')}`, issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const payload = parsed.data;

    // Render with mock data so {{placeholders}} resolve to readable values.
    const rendered = renderBosEmailTemplate(
      { subject: payload.subject, body_html: payload.body_html },
      BOS_TEMPLATE_PREVIEW_VALUES
    );

    const institutionsId = payload.institutionsId ?? scope.userInstitutionId;
    if (!institutionsId) {
      return NextResponse.json(
        { error: 'Cannot infer institution for test-send' },
        { status: 400 }
      );
    }

    // Resolve SMTP for this institution and send directly. No queue.
    const smtpConfig = await resolveBosSmtpConfig(supabase, institutionsId);
    if (!smtpConfig) {
      return NextResponse.json(
        {
          error:
            'No active SMTP configuration found for this institution. ' +
            'Configure SMTP at /bos/email-settings → SMTP Server tab before sending.',
        },
        { status: 400 }
      );
    }

    const subjectWithTag = `[TEST] ${rendered.subject}`;
    const result = await sendBosEmail(smtpConfig, {
      to: payload.recipient_email,
      subject: subjectWithTag,
      html: rendered.body_html,
    });

    // Always log the attempt — sent or failed — into the BoS audit table.
    const { error: logErr } = await supabase.from('bos_email_send_log').insert({
      institutions_id: institutionsId,
      meeting_id: null,
      member_id: null,
      template_code: 'meeting_invitation',
      recipient_email: payload.recipient_email,
      recipient_name: 'Template Test Recipient',
      subject: subjectWithTag,
      status: result.ok ? 'sent' : 'failed',
      message_id: result.messageId ?? null,
      error_message: result.ok ? null : (result.error ?? 'unknown'),
      sent_by: user.id,
    });
    if (logErr) {
      console.warn('[bos/email-templates/test-send] bos_email_send_log insert failed:', logErr);
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `SMTP send failed: ${result.error ?? 'unknown'}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${payload.recipient_email}.`,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('[bos/email-templates/test-send] error:', error);
    return NextResponse.json(
      { error: (error as Error).message ?? 'Failed to send test email' },
      { status: 500 }
    );
  }
}
