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
// ============================================================================

export const navMeta = { label: 'AI Models', icon: 'Sparkles' } as const;

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { AiModelsDataTable } from './_components/ai-models-data-table';

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
        <AiModelsDataTable />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
