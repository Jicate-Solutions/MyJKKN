// app/c/[token]/route.ts
// Campaign short-link redirect handler.
// Validates link + campaign + form, logs a click row + bumps counter,
// redirects 302 to /apply/{slug}?c={token} with UTM params and a
// 30-day sticky campaign-attribution cookie.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hashIp } from '@/lib/security/ip-hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[A-Za-z0-9_-]{4,16}$/;
const NOT_FOUND = new NextResponse('Not found', { status: 404 });

interface LookupRow {
  id: string;
  campaign_id: string;
  form_id: string;
  is_active: boolean;
  expires_at: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  campaign: {
    id: string;
    status: string;
    ends_at: string | null;
    institution_id: string;
  };
  form: {
    id: string;
    slug: string;
    status: string;
    is_active: boolean;
    expires_at: string | null;
  };
}

function parseDeviceType(
  ua: string,
): 'mobile' | 'tablet' | 'desktop' | 'bot' {
  if (/bot|crawler|spider|crawling/i.test(ua)) return 'bot';
  if (/mobile|iphone|android.*mobile/i.test(ua)) return 'mobile';
  if (/ipad|tablet|android(?!.*mobile)/i.test(ua)) return 'tablet';
  return 'desktop';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!TOKEN_RE.test(token)) return NOT_FOUND;

  const supabase = createServiceRoleClient();
  const { data: linkRaw, error } = await supabase
    .from('admission_campaign_links')
    .select(
      `id, campaign_id, form_id, is_active, expires_at,
       utm_source, utm_medium, utm_campaign, utm_content,
       campaign:admission_campaigns!inner(id, status, ends_at, institution_id),
       form:admission_forms!inner(id, slug, status, is_active, expires_at)`,
    )
    .eq('token', token)
    .maybeSingle();

  if (error || !linkRaw) return NOT_FOUND;

  // Supabase typings give nested `!inner` joins as arrays even when 1:1.
  const link = linkRaw as unknown as LookupRow;
  const campaign = Array.isArray(link.campaign)
    ? link.campaign[0]
    : link.campaign;
  const form = Array.isArray(link.form) ? link.form[0] : link.form;

  const now = new Date();
  const invalid =
    !link.is_active ||
    (link.expires_at && new Date(link.expires_at) < now) ||
    !campaign ||
    campaign.status !== 'active' ||
    (campaign.ends_at && new Date(campaign.ends_at) < now) ||
    !form ||
    form.status !== 'published' ||
    !form.is_active ||
    (form.expires_at && new Date(form.expires_at) < now);

  if (invalid) return NOT_FOUND;

  const ipHash = hashIp(req.headers.get('x-forwarded-for') ?? '');
  const userAgent = req.headers.get('user-agent') ?? '';
  const referrer = req.headers.get('referer') ?? null;
  const country = req.headers.get('x-vercel-ip-country') ?? null;
  const sessionId = crypto.randomUUID();

  // Fail-open: tracking errors must not block the redirect.
  try {
    await supabase.from('admission_campaign_link_clicks').insert({
      link_id: link.id,
      campaign_id: link.campaign_id,
      ip_hash: ipHash,
      user_agent: userAgent,
      referrer,
      device_type: parseDeviceType(userAgent),
      country,
      session_id: sessionId,
    });
    await supabase.rpc('increment_campaign_link_clicks', {
      p_link_id: link.id,
    });
  } catch (e) {
    console.error('[campaign-click] track failed', { token, error: e });
  }

  const target = new URL(`/apply/${form.slug}`, req.nextUrl.origin);
  target.searchParams.set('c', token);
  if (link.utm_source) target.searchParams.set('utm_source', link.utm_source);
  if (link.utm_medium) target.searchParams.set('utm_medium', link.utm_medium);
  if (link.utm_campaign)
    target.searchParams.set('utm_campaign', link.utm_campaign);
  if (link.utm_content)
    target.searchParams.set('utm_content', link.utm_content);

  const res = NextResponse.redirect(target, 302);
  res.cookies.set('mjk_campaign_token', token, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
