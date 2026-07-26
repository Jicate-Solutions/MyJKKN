// ============================================================================
// AI MODEL CONFIG (Super-Admin)
// ============================================================================
// Created: 2026-05-09
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
//
// This page lets super_admin manage which AI provider+model is used by each
// MyJKKN AI feature, set monthly spend caps, and see live usage / cost / success
// rate. Backed by:
//   - ai_model_config table (current selection per feature)
//   - ai_model_config_audit (change history with reason)
//   - ai_model_usage (per-invocation cost and success tracking)
//
// API:
//   GET /api/admin/ai-models                       — list features + usage stats
//   PATCH /api/admin/ai-models/[feature_key]       — change model selection
//   GET /api/admin/ai-models/[feature_key]/usage   — usage history + audit log
//
// AI Studio tab (added 2026-07-13): manage the ai_job_types registry — create /
// edit / enable / delete self-describing AI job types and run one on demand.
//   GET/POST /api/admin/ai-job-types, PATCH/DELETE /api/admin/ai-job-types/[job_type]
//   POST /api/ai-jobs/enqueue, GET /api/ai-jobs/status
// ============================================================================

export const navMeta = { label: 'AI Models', icon: 'Sparkles' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiModelsDataTable } from './_components/ai-models-data-table';
import { UsageByModelPanel } from './_components/usage-by-model-panel';
import { CapabilityGapLoopCard } from './_components/capability-gap-loop-card';
import { ModelSwitchWatchCard } from './_components/model-switch-watch-card';
import { PromptGraduationCard } from './_components/prompt-graduation-card';

export default function AiModelsPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="AI Models">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. AI model config drives
            cost and quality for every AI-powered feature on MyJKKN — locked tight
            to prevent accidental or unauthorized swaps.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="AI Models — Pick which AI runs each feature, set spend caps, see live usage">
        {/* UNIFICATION (2026-07-23): the "AI Models" + "AI Studio" tabs are
            collapsed into ONE registry-backed console (AiModelsDataTable now
            lists all 45 ai_job_types jobs grouped by lane, with authoring folded
            in behind each row's Advanced menu). ai_model_config stays as the
            silent resolver fallback with no independent tab. */}
        <Tabs defaultValue="jobs" className="space-y-4">
          <TabsList>
            <TabsTrigger value="jobs">AI Jobs</TabsTrigger>
            <TabsTrigger value="capability-gap-loop">Capability-Gap Loop</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="space-y-6">
            <ModelSwitchWatchCard />
            <PromptGraduationCard />
            <UsageByModelPanel />
            <AiModelsDataTable />
          </TabsContent>
          <TabsContent value="capability-gap-loop">
            <CapabilityGapLoopCard />
          </TabsContent>
        </Tabs>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
