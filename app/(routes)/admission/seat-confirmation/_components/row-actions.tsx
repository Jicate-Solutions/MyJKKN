'use client';

import { Row } from '@tanstack/react-table';
import type { AdmissionPaymentRow } from '@/lib/services/admission/seat-confirmation-service';

interface DataTableRowActionsProps {
  row: Row<AdmissionPaymentRow>;
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  // TODO: implement seat confirmation row actions (confirm, reject, refund)
  return null;
}
