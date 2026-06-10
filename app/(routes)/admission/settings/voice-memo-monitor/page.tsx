// ============================================================================
// VOICE MEMO MONITOR CONFIG (Super-Admin)
// ============================================================================
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every threshold/mapping/flag in the voice-memo monitor surface = a row in
// platform_policies. This page is the WRITE half; /admission/counselors/voice-memos
// is the READ half (Phase 2 consumer).
//
// Director's vision (locked 2026-05-09 voice-memo pipeline architecture):
//   "Tweak the threshold? Edit a number in the UI."
//   "Re-map CEO's digest categories? Click checkboxes."
//   "Turn on real-time? Toggle a flag."
// No deploy needed for any of these tweaks.
// ============================================================================

export const navMeta = { label: 'Voice Memo Monitor', icon: 'Mic' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PolicyForm } from './_components/policy-form';

export default function VoiceMemoMonitorConfigPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Voice Memo Monitor — Config">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Voice memo monitor
            settings drive the alerts and digests the Director sees daily — it is
            locked tight to prevent accidental changes.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Voice Memo Monitor — Tune thresholds, alerts, and digest mapping (no deploy needed)">
        <PolicyForm />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
