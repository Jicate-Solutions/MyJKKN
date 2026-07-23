// ============================================================================
// AI ROUTINES CONTROL (Super-Admin)
// ============================================================================
// Created: 2026-07-01
// One operator surface for every AI/LLM-powered routine in MyJKKN — the SCF
// session-feedback loop, feedback intake adapters, AI Pulse, admission AI, AI
// query, induction AI, and the rest. Shows each routine's schedule, what it
// does, its config knobs, and its side-effects, and lets a super_admin fire the
// safe ones on demand ("Run now") via /api/admin/ai-routines/trigger.
//
// V1 = see + run. Editing schedules/thresholds from here (config-as-rows, per
// the Director rule that backs /admin/ai-models) is the tracked phase 2.
//
// Registry: lib/ai-routines/* (one curated file per category).
// ============================================================================

export const navMeta = { label: 'AI Routines', icon: 'Bot' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { AiRoutinesControl } from './_components/ai-routines-control';

export default function AiRoutinesPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="AI Routines">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. It can trigger
            production AI jobs across every module, so it is locked tight to
            prevent accidental or unauthorized runs.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="AI Routines — every AI job in MyJKKN, in one place to see and run">
        <AiRoutinesControl />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
