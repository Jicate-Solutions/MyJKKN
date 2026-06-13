/**
 * Local types for the Documents & Decisions components.
 * Kept in this file so the components don't repeat type annotations.
 * Re-exports the service-layer insert/filter shapes for convenience.
 */

export type {
  AttachmentInsert,
  AttachmentFilters,
  DecisionEntryInsert,
  DecisionFilters,
} from '@/lib/services/projects/document-service';
