// lib/services/mba-dept-artifacts/types.ts
// Shared types for MBA department playbooks (organogram / SOP / workflow).
// One artifact per (area_id, artifact_type). AI drafts -> a human manager approves.

export const ARTIFACT_TYPES = ['organogram', 'sop', 'workflow'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ['ai_drafted', 'approved', 'needs_changes'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export function isArtifactType(v: unknown): v is ArtifactType {
  return typeof v === 'string' && (ARTIFACT_TYPES as readonly string[]).includes(v);
}

/** A row of public.mba_dept_artifacts as read by the UI (RLS-scoped). */
export interface MbaDeptArtifact {
  id: string;
  area_id: string;
  artifact_type: ArtifactType;
  content: Record<string, unknown>;
  status: ArtifactStatus;
  version: number;
  ai_model: string | null;
  ai_drafted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  updated_at: string | null;
}

/** Human-readable label per artifact type (UI + prompt). */
export const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
};
