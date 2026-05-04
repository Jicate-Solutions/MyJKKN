export const dynamic = 'force-dynamic';

// /api/cron/whatsapp-byow-monthly-audit
// Spec 3 Phase 2 Round 5.4 (T16): Monthly cron (1st of month, 04:00 UTC = 09:30 IST).
// For each ready BYOW connection, samples the 10 most-recent inbound messages
// from the last 30 days, inserts a pending audit row in wa_byow_monthly_audit_results,
// and emails the Director with a link to confirm/reject capture coverage.
//
// Auth: Bearer CRON_SECRET (Vercel-provided in production).
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md §8b item 14, §5 Round 5.4
//
// NOTE: The response form at /admin/whatsapp-byow/monthly-audit/{audit_month}/{dept_id}
// is NOT built in this task — only the email link is the T16 deliverable.
// The form scaffold is a follow-up task; the link in the email currently points
// to a route that does not yet exist (404 acceptable until follow-up ships).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { resend } from '@/lib/resend';

const DIRECTOR_EMAIL = 'director@jkkn.ac.in';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';
const SAMPLE_SIZE = 10;
const LOOKBACK_DAYS = 30;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function firstDayOfCurrentMonthUTC(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function buildAuditEmailHtml(args: {
  deptName: string;
  auditMonth: string;
  formUrl: string;
  samples: Array<{
    sender_name: string | null;
    sender_phone: string | null;
    message_preview: string | null;
    sent_at: string | null;
  }>;
}): string {
  const { deptName, auditMonth, formUrl, samples } = args;
  const rows = samples
    .map((s, i) => {
      const sender =
        s.sender_name ||
        s.sender_phone ||
        '(unknown sender)';
      const preview = (s.message_preview || '').slice(0, 200);
      const ts = s.sent_at
        ? new Date(s.sent_at).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
          })
        : '';
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#71717a;">${i + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#18181b;"><strong>${sender}</strong></td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#27272a;">${preview}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#71717a;white-space:nowrap;">${ts}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;max-width:640px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:#18181b;padding:24px 32px;text-align:center;">
<p style="margin:0;color:#71717a;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">JKKN BYOW WhatsApp</p>
<h1 style="margin:8px 0 0;color:#fff;font-size:18px;font-weight:600;">Monthly Audit — ${deptName}</h1>
<p style="margin:6px 0 0;color:#a1a1aa;font-size:12px;">Audit month: ${auditMonth}</p>
</td></tr>
<tr><td style="padding:28px 32px 12px;">
<p style="margin:0 0 16px;font-size:14px;color:#27272a;line-height:1.55;">Below are the 10 most-recent inbound WhatsApp messages captured for <strong>${deptName}</strong> in the last ${LOOKBACK_DAYS} days. Please confirm whether each message was actually received in the department's WhatsApp — this audits BYOW capture coverage.</p>
</td></tr>
<tr><td style="padding:0 32px;">
<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
<thead><tr style="background:#f4f4f5;">
<th style="padding:8px;text-align:left;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.04em;">#</th>
<th style="padding:8px;text-align:left;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.04em;">From</th>
<th style="padding:8px;text-align:left;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.04em;">Message</th>
<th style="padding:8px;text-align:left;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.04em;">When</th>
</tr></thead>
<tbody>${rows || '<tr><td colspan="4" style="padding:16px;text-align:center;font-size:13px;color:#71717a;">No inbound messages captured in window.</td></tr>'}</tbody>
</table>
</td></tr>
<tr><td style="padding:24px 32px 32px;text-align:center;">
<a href="${formUrl}" style="display:inline-block;padding:12px 24px;background:#0a3d2c;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Did you see this in your dept WhatsApp?</a>
<p style="margin:12px 0 0;font-size:11px;color:#71717a;">Click to open the audit response form.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const auditMonth = firstDayOfCurrentMonthUTC();

  try {
    const supabase = getServiceClient();

    // 1. Fetch ready connections + their dept names
    const { data: connections, error: connErr } = await supabase
      .from('wa_personal_connections')
      .select('id, department_id, departments!inner(id, department_name)')
      .eq('status', 'ready')
      .not('department_id', 'is', null);

    if (connErr) throw connErr;

    // De-dupe by department_id (a dept could in theory have multiple ready conns)
    const seenDeptIds = new Set<string>();
    const deptList: Array<{ deptId: string; deptName: string }> = [];
    for (const c of connections ?? []) {
      const did = (c as any).department_id as string | null;
      if (!did || seenDeptIds.has(did)) continue;
      seenDeptIds.add(did);
      const dept = (c as any).departments;
      const name = dept?.department_name ?? '(unnamed)';
      deptList.push({ deptId: did, deptName: name });
    }

    const cutoffIso = new Date(
      Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    let deptsAudited = 0;
    const errors: Array<{ deptId: string; error: string }> = [];

    for (const { deptId, deptName } of deptList) {
      try {
        // 2. Sample 10 most-recent inbound msgs in last 30 days
        const { data: samples } = await supabase
          .from('wa_personal_message_logs')
          .select(
            'sender_name, sender_phone, message_preview, sent_at'
          )
          .eq('department_id', deptId)
          .eq('direction', 'inbound')
          .gte('sent_at', cutoffIso)
          .order('sent_at', { ascending: false })
          .limit(SAMPLE_SIZE);

        const sampleArr = samples ?? [];

        // 3. Insert pending audit row (idempotent via unique idx month+dept)
        const { error: insErr } = await supabase
          .from('wa_byow_monthly_audit_results')
          .upsert(
            {
              audit_month: auditMonth,
              department_id: deptId,
              sample_size: sampleArr.length,
              emailed_at: new Date().toISOString(),
            },
            { onConflict: 'audit_month,department_id' }
          );
        if (insErr) throw insErr;

        // 4. Email Director
        const formUrl = APP_URL
          ? `${APP_URL}/admin/whatsapp-byow/monthly-audit/${auditMonth}/${deptId}`
          : `/admin/whatsapp-byow/monthly-audit/${auditMonth}/${deptId}`;

        if (process.env.RESEND_API_KEY) {
          const { error: emailErr } = await resend.emails.send(
            {
              from: FROM_EMAIL,
              to: DIRECTOR_EMAIL,
              subject: `BYOW Monthly Audit — ${deptName}`,
              html: buildAuditEmailHtml({
                deptName,
                auditMonth,
                formUrl,
                samples: sampleArr as any,
              }),
            },
            {
              headers: {
                'Idempotency-Key': `byow-monthly-audit-${auditMonth}-${deptId}`,
              },
            }
          );
          if (emailErr) {
            throw new Error(
              `Resend error: ${(emailErr as any)?.message ?? String(emailErr)}`
            );
          }
        }

        deptsAudited++;
      } catch (e) {
        errors.push({
          deptId,
          error: e instanceof Error ? e.message : 'unknown',
        });
        Sentry.captureException(e, {
          tags: { feature: 'byow_whatsapp', event: 'monthly_audit_dept_failure' },
          extra: { dept_id: deptId, audit_month: auditMonth },
        });
      }
    }

    Sentry.captureMessage('BYOW Monthly Audit ran', {
      level: 'info',
      tags: { feature: 'byow_whatsapp', event: 'monthly_audit_complete' },
      extra: {
        depts_audited: deptsAudited,
        depts_total: deptList.length,
        audit_month: auditMonth,
        errors: errors.length,
      },
    });

    return NextResponse.json({
      ok: true,
      audit_month: auditMonth,
      depts_audited: deptsAudited,
      depts_total: deptList.length,
      errors,
      elapsed_ms: Date.now() - start,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: {
        feature: 'byow_whatsapp',
        event: 'monthly_audit_cron_failure',
      },
      extra: { audit_month: auditMonth },
    });
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
