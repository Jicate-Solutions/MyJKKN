'use client';

/**
 * The hostel gate pass raised by a leave / OD application, shown on the
 * learner's application detail. Renders nothing for day scholars and for types
 * that do not leave campus. The QR carries only the opaque pass token.
 */

import { useQuery } from '@tanstack/react-query';
import { QrCode, Clock, LogIn, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import { QrImage, statusMeta } from '@/components/service-requests/gate-pass-card';

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
    : '—';

export function LeaveGatePassCard({ applicationId }: { applicationId: string }) {
  const { data: pass } = useQuery({
    queryKey: ['leave-onduty', applicationId, 'gate-pass'],
    queryFn: () => GatePassService.getByLeaveApplication(applicationId),
    refetchInterval: 30_000,
  });

  if (!pass) return null;

  const meta = statusMeta(pass.status === 'requested' ? 'pending' : pass.status);
  const live = pass.status === 'issued' || pass.status === 'active' || pass.status === 'overdue';

  return (
    <div>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-medium sm:mb-4 sm:text-base">
        <QrCode className="h-4 w-4 text-primary" />
        Gate Pass
      </h4>
      <div className="flex flex-col items-center gap-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50 sm:flex-row sm:items-start sm:p-4">
        {live && pass.qr_code ? (
          <QrImage token={pass.qr_code} />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-lg border bg-muted p-3 text-center text-sm text-muted-foreground">
            {pass.status === 'requested'
              ? 'The pass is issued after the Chief Warden approves'
              : 'QR not available'}
          </div>
        )}
        <div className="w-full space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {pass.pass_number && <span className="font-mono text-base font-bold">{pass.pass_number}</span>}
            <Badge className={meta.className} variant="secondary">
              {pass.status === 'requested' ? 'Awaiting approval' : meta.label}
            </Badge>
          </div>
          {pass.valid_until && (
            <p className="flex items-start gap-2 text-muted-foreground">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Show this at the gate between <b>{fmt(pass.valid_from)}</b> and{' '}
                <b>{fmt(pass.valid_until)}</b>. After that the pass expires.
              </span>
            </p>
          )}
          <p className="text-muted-foreground">Due back by {fmt(pass.expected_return)}</p>
          {(pass.out_time || pass.actual_return) && (
            <div className="rounded-md border p-2">
              <p className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-green-600" />
                OUT {fmt(pass.out_time)}
              </p>
              <p className="flex items-center gap-2">
                <LogIn className="h-4 w-4 text-amber-600" />
                IN {fmt(pass.actual_return)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
