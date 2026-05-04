// Created: 2026-05-04 — AI Pulse module v3 (Wave B.6 Policy Admin UI)
// Director's STANDING RULE — every policy decision = config-table row + super_admin UI.
//
// Spec: specs/myjkkn-ai-pulse-spec.md v3 §4.3 (22 policy rows)
// Service: lib/services/ai-pulse/policies-service.ts
// Substrate: PR #644 (ai_pulse_policies table)
// RLS:       PR #715 (super_admin write; authenticated read)
//
// Champion = Krishnaveni; Co-Champion = Ranjith (Ranjith@jkkn.ac.in)
// (They use this surface to tune the program without redeploying code.)

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { AiPulsePoliciesEditor } from './_components/ai-pulse-policies-editor';

export default function AiPulsePoliciesPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title='AI Pulse Policies'>
          <div className='rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground'>
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='AI Pulse Policies'>
        <AiPulsePoliciesEditor />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
