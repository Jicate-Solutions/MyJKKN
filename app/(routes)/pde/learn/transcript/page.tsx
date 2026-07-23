/**
 * /pde/learn/transcript — Learner self-view of the PDE transcript.
 * ----------------------------------------------------------------------------
 * Server component. Resolves auth.uid() via SSR Supabase client and renders
 * the shared <TranscriptDocument> populated from PDETranscriptService.
 *
 * NAAC/NBA-ready format. Print to PDF via the browser (Ctrl/Cmd + P).
 *
 * Phase: PDE Tier 4 — T4.4 (2026-05-19).
 */

import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PDETranscriptService } from '@/lib/services/pde-transcript-service';
import { TranscriptDocument } from './_components/TranscriptDocument';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'My PDE Transcript',
  description: 'NAAC/NBA-ready record of your durable-value demonstrations.',
};

export default async function LearnerTranscriptPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login?next=/pde/learn/transcript');
  }

  const data = await PDETranscriptService.buildTranscriptData(
    user.id,
    supabase as any,
    user.id
  );

  if (!data) {
    return (
      <ContentLayout title="My PDE Transcript">
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="py-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-rose-800">Transcript unavailable</p>
              <p className="text-sm text-rose-700 mt-1">
                We couldn&apos;t find a learner profile linked to your account. If you believe this
                is an error, please contact your PDE coordinator.
              </p>
            </div>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return <TranscriptDocument data={data} />;
}
