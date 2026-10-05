'use client';

/**
 * The fee attached to a request's fee step (e.g. the ID Card Fee before a
 * duplicate card is printed), shown on the request detail page.
 *
 * Loading it also reconciles it on the server: the bill is raised if missing,
 * and a paid bill moves the request to its next step. So the card doubles as
 * the thing that advances the flow after a payment — it polls while the fee is
 * outstanding and refreshes the request the moment the server reports it moved.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, HandCoins, IndianRupee, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { serviceRequestKeys } from '@/hooks/service-requests/use-service-requests';
import type { ServiceRequestFeeState } from '@/lib/services/service-requests/service-request-fee-service';

const LEARNER_BILLS_PATH = '/learners/my-bills';

const formatRupees = (value: number | null | undefined) =>
  `Rs. ${Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

interface RequestFeeCardProps {
  requestId: string;
  /** The viewer filed this request — offered the online payment route. */
  isRequester: boolean;
  /** The viewer may write receipts — offered the cash counter. */
  canCollect: boolean;
}

export function RequestFeeCard({ requestId, isRequester, canCollect }: RequestFeeCardProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ServiceRequestFeeState>({
    queryKey: [...serviceRequestKeys.detail(requestId), 'fee'],
    queryFn: async () => {
      const res = await fetch(`/api/service-requests/${requestId}/fee`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the fee for this request');
      return json as ServiceRequestFeeState;
    },
    // Keep asking only while a payment is awaited.
    refetchInterval: (query) => (query.state.data?.on_fee_step ? 30_000 : false),
    refetchOnWindowFocus: true,
  });

  // The server just moved the request past its fee step — refresh the page's
  // request (status, stepper, timeline) and the inbox counts.
  const advanced = data?.advanced === true;
  useEffect(() => {
    if (advanced) {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
    }
  }, [advanced, queryClient]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-5">
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {(error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data?.applicable) return null;

  const isPaid = data.bill_status === 'paid';
  const notRaised = data.bill_status === 'not_raised';
  const isVoid = data.bill_status === 'cancelled' || data.bill_status === 'superseded';
  const feeName = data.category_name || 'Fee';

  return (
    <Card className={isPaid ? 'border-green-300 dark:border-green-900' : 'border-amber-300 dark:border-amber-900'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <IndianRupee className="h-5 w-5" />
          {feeName}
          <span className="font-mono">{formatRupees(data.amount)}</span>
          {isPaid ? (
            <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
              <CheckCircle2 className="h-3 w-3" />
              Paid
            </Badge>
          ) : notRaised || isVoid ? (
            <Badge variant="secondary" className="gap-1 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
              <AlertTriangle className="h-3 w-3" />
              {notRaised ? 'Bill not raised' : 'Bill cancelled'}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              <Clock className="h-3 w-3" />
              Payment pending
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {isPaid
            ? `Payment received${formatDate(data.paid_at) ? ` on ${formatDate(data.paid_at)}` : ''}.`
            : notRaised
              ? 'The bill could not be raised because no learner record is linked to the requester. Please contact the accounts section.'
              : isVoid
                ? 'The bill for this request was cancelled in billing. Please contact the accounts section.'
                : 'This request moves to the next step as soon as the fee is paid — online, or in cash at the accounts section.'}
        </CardDescription>
      </CardHeader>

      {!isPaid && !notRaised && !isVoid && (isRequester || canCollect) && (
        <CardContent className="flex flex-wrap items-center gap-2 pt-0">
          {isRequester && (
            <Button asChild size="sm" className="gap-2">
              <Link href={LEARNER_BILLS_PATH}>
                <Wallet className="h-4 w-4" />
                Pay online
              </Link>
            </Button>
          )}
          {canCollect && data.bill_id && (
            <Button asChild size="sm" variant={isRequester ? 'outline' : 'default'} className="gap-2">
              <Link
                href={`/billing/receipts/new?bill_id=${data.bill_id}&returnTo=${encodeURIComponent(
                  `/service-requests/${requestId}`
                )}`}
              >
                <HandCoins className="h-4 w-4" />
                Collect payment
              </Link>
            </Button>
          )}
          {Number(data.balance ?? 0) > 0 && Number(data.balance) !== Number(data.amount) && (
            <span className="text-xs text-muted-foreground">
              Balance {formatRupees(data.balance)}
            </span>
          )}
        </CardContent>
      )}
    </Card>
  );
}
