// app/(routes)/admission/counselors/voice-memos/page.tsx
// Voice Memo Monitor — director's view of the voice-memo pipeline.
// Read half. Write half lives at /admin/voice-memo-monitor (super-admin only).
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { AdmissionErrorBoundary } from '@/components/admission';
import { VoiceMemoMonitorView } from './_components/monitor-view';

export const navMeta = { label: 'Voice Memo Monitor', icon: 'Activity' } as const;

export default function VoiceMemoMonitorPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <AdmissionErrorBoundary>
        <ContentLayout title="Voice Memo Monitor">
          <VoiceMemoMonitorView />
        </ContentLayout>
      </AdmissionErrorBoundary>
    </PermissionGuard>
  );
}
