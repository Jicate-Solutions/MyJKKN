'use client';

import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Play, Pause, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { CallLog, CallStatus, CallDisposition } from '@/lib/services/telephony/telephony-service';
import { formatDuration } from '@/hooks/admission';

// Re-export type
export type { CallLog };

// ============================================================================
// BADGE HELPERS
// ============================================================================

export function getStatusBadge(status: CallStatus) {
  const map: Record<CallStatus, { label: string; className: string }> = {
    initiated:     { label: 'Initiated',   className: 'bg-blue-100 text-blue-800 border-blue-200' },
    ringing:       { label: 'Ringing',     className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    'in-progress': { label: 'In Progress', className: 'bg-green-100 text-green-800 border-green-200' },
    completed:     { label: 'Completed',   className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    busy:          { label: 'Busy',        className: 'bg-orange-100 text-orange-800 border-orange-200' },
    'no-answer':   { label: 'No Answer',   className: 'bg-red-100 text-red-700 border-red-200' },
    failed:        { label: 'Failed',      className: 'bg-red-100 text-red-800 border-red-200' },
    cancelled:     { label: 'Cancelled',   className: 'bg-gray-100 text-gray-800 border-gray-200' },
  };
  const cfg = map[status] || map.initiated;
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}

export function getDispositionBadge(disposition: CallDisposition | null) {
  if (!disposition)
    return <span className="text-xs text-muted-foreground italic">No disposition</span>;
  const map: Record<string, { label: string; className: string }> = {
    interested:     { label: 'Interested',     className: 'bg-green-100 text-green-800 border-green-200' },
    not_interested: { label: 'Not Interested', className: 'bg-red-100 text-red-800 border-red-200' },
    callback:       { label: 'Callback',       className: 'bg-blue-100 text-blue-800 border-blue-200' },
    wrong_number:   { label: 'Wrong Number',   className: 'bg-orange-100 text-orange-800 border-orange-200' },
    not_reachable:  { label: 'Not Reachable',  className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    switched_off:   { label: 'Switched Off',   className: 'bg-gray-100 text-gray-800 border-gray-200' },
    busy:           { label: 'Busy',           className: 'bg-orange-100 text-orange-700 border-orange-200' },
    other:          { label: 'Other',          className: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const cfg = map[disposition] || { label: disposition, className: 'bg-gray-100 text-gray-600' };
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}
