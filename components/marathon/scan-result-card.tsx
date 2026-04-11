'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OpsScanResult } from '@/types/events-marathon';

interface ScanResultCardProps {
  result: OpsScanResult | null;
  className?: string;
}

export function ScanResultCard({ result, className }: ScanResultCardProps) {
  if (!result) return null;

  const isSuccess = result.success && !result.already_done;
  const isAlreadyDone = result.success && result.already_done;

  const Icon = isSuccess ? CheckCircle2 : isAlreadyDone ? AlertTriangle : XCircle;

  const containerStyles = isSuccess
    ? 'bg-green-50 border-green-200'
    : isAlreadyDone
      ? 'bg-yellow-50 border-yellow-200'
      : 'bg-red-50 border-red-200';

  const iconStyles = isSuccess
    ? 'text-green-600'
    : isAlreadyDone
      ? 'text-yellow-600'
      : 'text-red-600';

  const reg = result.registration;
  const customData = reg?.custom_data as Record<string, unknown> | undefined;

  return (
    <div
      className={cn(
        'animate-in fade-in flex gap-4 rounded-lg border p-4',
        containerStyles,
        className
      )}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 pt-1">
        <Icon className={cn('h-8 w-8', iconStyles)} />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1">
        {/* Row 1: BIB + Category */}
        {reg && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold">{reg.bib_number}</span>
            <Badge variant="secondary">{reg.category_code}</Badge>
          </div>
        )}

        {/* Row 2: Participant name */}
        {reg && (
          <p className="text-lg font-semibold">{reg.participant_name}</p>
        )}

        {/* Row 3: Message */}
        <p className="text-sm text-muted-foreground">{result.message}</p>

        {/* Action-specific section */}
        {reg && result.action === 'check_in' && reg.stall && (
          <div className="mt-3 rounded-md border border-white/60 bg-white p-3">
            <p className="text-xs font-medium text-muted-foreground">Assigned Stall</p>
            <p className="text-3xl font-bold text-primary">{reg.stall.stall_name}</p>
            {reg.stall.location_note && (
              <p className="text-sm text-muted-foreground">{reg.stall.location_note}</p>
            )}
          </div>
        )}

        {result.action === 'tshirt' && reg && (
          <div className="mt-3 space-y-2">
            {customData?.tshirt_size && (
              <Badge className="text-lg px-4 py-1">
                {customData.tshirt_size as string}
              </Badge>
            )}
            {!reg.stall && (
              <p className="text-sm font-medium text-yellow-700">
                Warning: Participant has not checked in yet
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
