// lib/services/mba-dept-artifacts/collect-drafts.ts
// Drains completed 'mba.draft_dept_artifact' jobs off the ₹0 Max lane and
// persists each parsed draft via the SECURITY DEFINER writer RPC. Called by the
// on-demand collect route (the UI polls it after clicking "Draft with AI") — no
// cron in v1. Idempotent: collectJobsLane claims each job exactly once.

import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { extractJsonObject } from './draft-prompt';
import { isArtifactType } from './types';

const JOB_TYPE = 'mba.draft_dept_artifact';

export interface CollectOutcome {
  collected: number;
  persisted: number;
  failed: number;
}

/** Pull the model's text out of the Message shape collectJobsLane returns. */
function messageText(message: unknown): string | null {
  const m = message as { content?: Array<{ type?: string; text?: string }> } | null;
  if (!m?.content) return null;
  const block = m.content.find((b) => b.type === 'text');
  return block?.text ?? null;
}

/**
 * Claim + persist every completed draft job. Returns counts; never throws on a
 * single bad row (a malformed draft is counted as failed and left for a re-draft).
 */
export async function collectAndPersistDrafts(
  admin: ReturnType<typeof createServiceRoleClient>,
): Promise<CollectOutcome> {
  const items = await collectJobsLane(admin, [JOB_TYPE]);
  let persisted = 0;
  let failed = 0;

  for (const item of items) {
    const ctx = item.context as { area_id?: string; artifact_type?: string; model?: string };
    const areaId = ctx.area_id;
    const artifactType = ctx.artifact_type;

    if (!areaId || !isArtifactType(artifactType)) {
      failed++;
      continue;
    }

    const content = extractJsonObject(messageText(item.message));
    if (!content) {
      // Model returned no parseable JSON — leave nothing persisted; the manager
      // can click "Draft with AI" again. (Mirrors the lesson-spine "no JSON" path.)
      failed++;
      continue;
    }

    const { error } = await admin.rpc('fn_mba_dept_artifact_ai_draft_upsert', {
      p_area_id: areaId,
      p_artifact_type: artifactType,
      p_content: content,
      p_ai_model: ctx.model ?? null,
      p_ai_prompt: null, // full prompt is on the ai_jobs row referenced by p_ai_job_id
      p_ai_job_id: item.jobId,
    });

    if (error) {
      console.error('[mba-dept-artifacts/collect] persist failed:', error.message);
      failed++;
    } else {
      persisted++;
    }
  }

  return { collected: items.length, persisted, failed };
}
