'use client';

/**
 * The learner's gate pass, shown on the request detail page once a Gate Pass
 * type request is approved. The QR encodes ONLY the opaque pass token
 * (hostel_gate_passes.qr_code) — never a name, number or email.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { QrCode, Clock, CheckCircle2, LogOut, LogIn, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export interface IssuedGatePass {
  id: string;
  pass_number: string | null;
  qr_code: string | null;
  status: string;
  valid_date: string | null;
  expected_exit: string | null;
  expected_return: string | null;
  out_time: string | null;
  actual_return: string | null;
  reason: string | null;
  destination: string | null;
  alternate_mobile: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
}

interface GatePassResponse {
  issued: boolean;
  kind?: 'learner' | 'staff';
  request_status: string;
  request_number: string;
  pass?: IssuedGatePass;
  error?: string;
}

export function useRequestGatePass(requestId: string | undefined, enabled: boolean) {
  return useQuery<GatePassResponse>({
    queryKey: ['service-requests', requestId, 'gate-pass'],
    enabled: !!requestId && enabled,
    queryFn: async () => {
      const res = await fetch(`/api/service-requests/${requestId}/gate-pass`);
      const json = (await res.json()) as GatePassResponse;
      if (!res.ok) throw new Error(json.error || 'Could not load the gate pass');
      return json;
    },
    refetchInterval: 30_000,
  });
}

function QrImage({ token }: { token: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(token, { width: 224, margin: 1, errorCorrectionLevel: 'M' })
      .then(setUrl)
      .catch(() => setUrl(''));
  }, [token]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Gate pass QR" className="h-56 w-56 rounded-lg border bg-white p-1" />
  ) : (
    <Skeleton className="h-56 w-56 rounded-lg" />
  );
}

const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '—';
const fmtDate = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function statusMeta(status: string): { label: string; className: string } {
  switch (status) {
    case 'open':
      return { label: 'Ready · not yet out', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' };
    case 'out':
      return { label: 'Outside campus', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' };
    case 'completed':
      return { label: 'Completed', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' };
    case 'issued':
      return { label: 'Approved · not yet out', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' };
    case 'active':
      return { label: 'Outside campus', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' };
    case 'overdue':
      return { label: 'Outside · overdue', className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' };
    case 'returned':
      return { label: 'Completed', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-slate-100 text-slate-600' };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-800' };
  }
}

export function GatePassCard({ requestId, requestStatus }: { requestId: string; requestStatus: string }) {
  // Learners get a pass on approval; team members get one on submit. The card
  // asks the server for anything past draft and hides itself on "not yet".
  const askable = ['submitted', 'in_review', 'approved', 'fulfilled', 'closed'].includes(requestStatus);
  const approvedLike = ['approved', 'fulfilled', 'closed'].includes(requestStatus);
  const { data, isLoading, error } = useRequestGatePass(requestId, askable);

  if (!askable) return null;
  if (!approvedLike && data && !data.issued) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-5 w-5" />
          Gate Pass
        </CardTitle>
        <CardDescription>Show this QR to security at the gate for OUT and IN.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-56 w-56 rounded-lg" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}
        {error && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            {(error as Error).message}
          </p>
        )}
        {data && !data.issued && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Approved — the pass is being issued. Refresh in a moment; if it does not appear,
            ask the office to open this request.
          </p>
        )}
        {data?.issued && data.pass && (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {data.pass.qr_code && !['cancelled', 'returned', 'completed'].includes(data.pass.status) ? (
              <QrImage token={data.pass.qr_code} />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-muted text-center text-sm text-muted-foreground">
                {data.pass.status === 'returned' || data.pass.status === 'completed' ? (
                  <span className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    Pass completed
                  </span>
                ) : (
                  'QR no longer valid'
                )}
              </div>
            )}
            <div className="w-full space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-bold">{data.pass.pass_number}</span>
                <Badge className={statusMeta(data.pass.status).className} variant="secondary">
                  {statusMeta(data.pass.status).label}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                {data.kind !== 'staff' && (
                  <>
                    <dt className="text-muted-foreground">Valid on</dt>
                    <dd>{fmtDate(data.pass.valid_date)}</dd>
                    <dt className="text-muted-foreground">Exit</dt>
                    <dd>{fmtTime(data.pass.expected_exit)}</dd>
                    <dt className="text-muted-foreground">Return by</dt>
                    <dd>{fmtTime(data.pass.expected_return)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{data.pass.reason || data.pass.destination || '—'}</dd>
                {data.kind === 'staff' ? (
                  <>
                    <dt className="text-muted-foreground">Issued on</dt>
                    <dd>{fmtDate(data.pass.approved_at)}</dd>
                    <dt className="text-muted-foreground">Approval</dt>
                    <dd>Not required for team members</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Approved by</dt>
                    <dd>{data.pass.approved_by_name || '—'}</dd>
                    <dt className="text-muted-foreground">Approved on</dt>
                    <dd>{fmtDate(data.pass.approved_at)}</dd>
                  </>
                )}
              </dl>
              {(data.pass.out_time || data.pass.actual_return) && (
                <div className="mt-2 rounded-md border p-2">
                  <p className="flex items-center gap-2">
                    <LogOut className="h-4 w-4 text-green-600" />
                    OUT {fmtTime(data.pass.out_time)}
                  </p>
                  <p className="flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-amber-600" />
                    IN {fmtTime(data.pass.actual_return)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
