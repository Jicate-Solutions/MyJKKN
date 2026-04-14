// components/layout/preview-banner.tsx
// ============================================================================
// Sticky red banner shown on EVERY page when a preview session is active.
// Rendered server-side in app/layout.tsx so it survives route navigation.
// Non-dismissible by design — users must always know they are impersonating.
// ============================================================================

import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { verifyPreviewToken, PREVIEW_COOKIE_NAME, type PreviewClaims } from '@/lib/auth/preview-session';
import { PreviewBannerClient } from './preview-banner-client';

async function resolveTargetLabel(targetUserId: string): Promise<{ name: string; email: string; role: string } | null> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data } = await sb
      .from('profiles')
      .select('full_name, email, role')
      .eq('id', targetUserId)
      .single();
    if (!data) return null;
    return {
      name: data.full_name || data.email || 'Unknown user',
      email: data.email || '',
      role: data.role || '—',
    };
  } catch {
    return null;
  }
}

export async function PreviewBanner() {
  const jar = await cookies();
  const token = jar.get(PREVIEW_COOKIE_NAME)?.value;
  if (!token) return null;

  const claims: PreviewClaims | null = await verifyPreviewToken(token);
  if (!claims) return null;

  const target = await resolveTargetLabel(claims.sub);
  if (!target) return null;

  // Unix millis expiry → string for client component (server/client boundary).
  const expiresAtMs = claims.exp * 1000;

  return (
    <PreviewBannerClient
      targetName={target.name}
      targetEmail={target.email}
      targetRole={target.role}
      mode={claims.mode}
      expiresAtMs={expiresAtMs}
    />
  );
}
