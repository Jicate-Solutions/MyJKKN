// lib/services/mba-dept-artifacts/types.ts
// Shared types for MBA department playbooks (organogram / SOP / workflow / policy).
// One artifact per (area_id, artifact_type). AI drafts -> a human manager approves.
// 'policy' is the exception: it can EITHER be AI-drafted (then signed off by an
// officer) OR satisfied by uploading the real document, which always wins.

export const ARTIFACT_TYPES = ['organogram', 'sop', 'workflow', 'policy'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ['ai_drafted', 'approved', 'needs_changes'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export function isArtifactType(v: unknown): v is ArtifactType {
  return typeof v === 'string' && (ARTIFACT_TYPES as readonly string[]).includes(v);
}

/** Where the live content came from. An 'upload' can never be overwritten by AI. */
export const ARTIFACT_SOURCES = ['ai_draft', 'upload'] as const;
export type ArtifactSource = (typeof ARTIFACT_SOURCES)[number];

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
  /** 'upload' means a real document is on file and it IS the artifact. */
  source: ArtifactSource;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  uploaded_at: string | null;
}

/** Human-readable label per artifact type (UI + prompt). */
export const ARTIFACT_LABEL: Record<ArtifactType, string> = {
  organogram: 'Organogram',
  sop: 'Standard Operating Procedure',
  workflow: 'Workflow',
  policy: 'Department Policy',
};

/** Permission key that gates uploading / signing off a department policy. */
export const POLICY_APPROVE_PERMISSION = 'improvement.area_policy.approve';

/** Private bucket holding uploaded policy documents (signed URLs only). */
export const POLICY_BUCKET = 'dept-policies';

/** Document types an officer may upload as a department policy. */
export const POLICY_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const POLICY_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
