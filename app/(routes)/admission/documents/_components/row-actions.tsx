'use client';

import { Row } from '@tanstack/react-table';
import type { PendingDocument } from '@/lib/services/admission/document-service';

interface DocumentRowActionsProps {
  row: Row<PendingDocument>;
}

export function DocumentRowActions({ row }: DocumentRowActionsProps) {
  // TODO: implement document row actions (verify, reject, download)
  return null;
}
