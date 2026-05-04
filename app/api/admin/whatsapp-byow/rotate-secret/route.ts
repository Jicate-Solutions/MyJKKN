export const dynamic = 'force-dynamic';

// /api/admin/whatsapp-byow/rotate-secret
// BYOW Spec 3 Phase 2 Task 15 (5.1): Generates a new HMAC webhook secret for
// the BYOW WhatsApp service and returns it to the super_admin caller for
// manual deployment to Vercel + Railway env vars.
//
// SCOPE: This route ONLY generates and returns a fresh secret. It does NOT
// auto-rotate Vercel/Railway env vars — that's deferred to Spec 5+. Director
// must paste the new value into both surfaces and redeploy.
//
// Auth: super_admin only. 401 if unauthenticated, 403 if non-super_admin.
// Sentry: tag feature='byow_whatsapp', event='secret_rotation_initiated'.
// Spec: /Users/omm/PROJECTS/MyJKKN/specs/byow-platform-v2.md §5 Round 5.1, §8b item 13.

import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();

  // Auth gate
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Role gate — super_admin only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only super admins can rotate the BYOW webhook secret' },
      { status: 403 }
    );
  }

  // Generate new HMAC secret — 32 bytes hex = 64 chars.
  const newSecret = randomBytes(32).toString('hex');

  Sentry.captureMessage(
    'BYOW webhook secret rotation initiated by ' + authData.user.id,
    {
      level: 'info',
      tags: { feature: 'byow_whatsapp', event: 'secret_rotation_initiated' },
    }
  );

  return NextResponse.json({
    new_secret: newSecret,
    instructions:
      'Update WEBHOOK_SECRET in Vercel (jicate-solutions/my-jkkn) AND Railway (whatsapp-byow-service), then redeploy both.',
  });
}
