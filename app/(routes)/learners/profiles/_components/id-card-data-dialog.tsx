'use client';
// ============================================
// ID CARD DATA DIALOG
// ============================================
// Created: 2026-09-22
// Purpose: Bulk-edit the ID-card fields of active learners. Same download →
//   preview → validate → apply pipeline as Bulk Edit Active, reduced to the
//   18 ID-card columns (see lib/services/bulk-learner-id-card-template.ts).
// ============================================

import { BulkEditActiveDialog } from './bulk-edit-exited-dialog';

export function IdCardDataDialog({ onSuccess }: { onSuccess?: () => void }) {
  return <BulkEditActiveDialog variant="id_card" onSuccess={onSuccess} />;
}
