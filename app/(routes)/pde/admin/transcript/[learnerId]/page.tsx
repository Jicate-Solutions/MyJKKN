/**
 * /pde/admin/transcript/[learnerId] — Admin/super-admin view of any
 * learner's PDE transcript. Same renderer as the learner self-view; the
 * difference is the role gate + URL param.
 *
 * Phase: PDE Tier 4 — T4.4 (2026-05-19).
 */

import { redirect, notFound } from 'next/navigation';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { PDETranscriptService } from '@/lib/services/pde-transcript-service';
import { TranscriptDocument } from '../../../../pde/learn/transcript/_components/TranscriptDocument';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'PDE Transcript (admin view)',
};

const PRIVILEGED_ROLES = new Set(['super_admin', 'administrator']);

export default async function AdminTranscriptPage({
  params,
}: {
  params: Promise<{ learnerId: string }>;
}) {
  const { learnerId } = await params;

  if (!learnerId) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/pde/admin/transcript/${learnerId}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as string | undefined) ?? '';
  if (!PRIVILEGED_ROLES.has(role)) {
    // Non-privileged users can still view their OWN transcript via the admin
    // URL — anything else is forbidden.
    if (user.id !== learnerId) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Access denied</h1>
          <p>You don&apos;t have permission to view another learner&apos;s PDE transcript.</p>
        </div>
      );
    }
  }

  // Service-role read once we&apos;ve passed the auth gate.
  const reader = createServiceRoleClient();
  const data = await PDETranscriptService.buildTranscriptData(
    learnerId,
    reader as any,
    user.id
  );

  if (!data) {
    notFound();
  }

  return <TranscriptDocument data={data} />;
}
