export const dynamic = 'force-dynamic';

// app/api/integrations/google-read/connect/route.ts
//
// Starts "Let the assistant read my Gmail and Drive": incremental authorization
// on the same Google OAuth client as the calendar connection, asking only for
// gmail.readonly + drive.readonly (include_granted_scopes=true).
//
// The person connects THEIR OWN account — the id comes from the session, never
// from the request. Every refusal lands back on the card with a banner that says
// why (rule #27: never a silent bounce).

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { canUseAssistant } from '@/lib/services/integrations/google-read/auth';
import {
  isGoogleReadConfigured,
  isGoogleReadEnabled,
} from '@/lib/services/integrations/google-read/connection';
import { buildGoogleReadAuthUrl } from '@/lib/services/integrations/google-read/oauth';
import { GOOGLE_READ_CARD_PATH } from '@/lib/services/integrations/google-read/constants';

function back(flag: string): NextResponse {
  const app = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.jkkn.ai').replace(/\/$/, '');
  return NextResponse.redirect(`${app}${GOOGLE_READ_CARD_PATH}?google_read=${flag}`);
}

export async function GET() {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  }
  if (!(await isGoogleReadEnabled(supabase))) return back('off');
  if (!isGoogleReadConfigured()) return back('not_configured');
  if (!(await canUseAssistant(supabase))) return back('forbidden');

  return NextResponse.redirect(buildGoogleReadAuthUrl(user.id));
}
