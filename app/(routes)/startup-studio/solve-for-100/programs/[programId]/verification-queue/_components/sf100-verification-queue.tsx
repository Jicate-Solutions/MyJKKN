'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSF100VerificationQueue, useVerifySF100PaidUser } from '@/hooks/startup-studio';

interface SF100VerificationQueueProps {
  programId: string;
}

const GATEWAY_LABELS: Record<string, string> = {
  razorpay_jicate: 'Razorpay (JICATE)',
  razorpay_custom: 'Razorpay (Custom)',
  upi: 'UPI',
  stripe: 'Stripe',
  cash: 'Cash',
  other: 'Other',
};

function QueueSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-32" />
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VerificationCard({ item, onVerify, onReject, isPending }: {
  item: any;
  onVerify: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  isPending: boolean;
}) {
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason.');
      return;
    }
    onReject(item.id, rejectReason.trim());
    setShowReject(false);
    setRejectReason('');
  };

  const date = item.transaction_date ?? item.created_at;
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{item.team_name ?? 'Unknown Team'}</CardTitle>
          <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-xs shrink-0">
            Pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">User: </span>
            <span className="font-medium">{item.user_name ?? item.user_identifier ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Amount: </span>
            <span className="font-medium">
              {item.amount != null ? `₹${Number(item.amount).toLocaleString('en-IN')}` : '—'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Gateway: </span>
            <span>{GATEWAY_LABELS[item.payment_gateway] ?? item.payment_gateway ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Date: </span>
            <span>{formattedDate}</span>
          </div>
          {item.transaction_id && (
            <div className="col-span-full">
              <span className="text-muted-foreground">Transaction ID: </span>
              <span className="font-mono text-xs">{item.transaction_id}</span>
            </div>
          )}
          {item.is_internal && (
            <div className="col-span-full">
              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                Internal User
              </Badge>
            </div>
          )}
        </div>

        {/* Proof link */}
        {item.proof_url && (
          <a
            href={item.proof_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View proof
          </a>
        )}

        {item.proof_description && (
          <p className="text-sm text-muted-foreground bg-muted/40 rounded p-2 leading-relaxed">
            {item.proof_description}
          </p>
        )}

        {/* Reject reason input */}
        {showReject && (
          <div className="space-y-2">
            <Textarea
              placeholder="Enter rejection reason (required)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="resize-none h-20 text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Confirm Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowReject(false);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!showReject && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-1.5"
              onClick={() => onVerify(item.id)}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Verify
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1.5"
              onClick={() => setShowReject(true)}
              disabled={isPending}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SF100VerificationQueue({ programId }: SF100VerificationQueueProps) {
  const { data: raw, isLoading, error } = useSF100VerificationQueue(programId);
  const queue: any[] = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];

  const { mutate: verify, isPending } = useVerifySF100PaidUser();

  const handleVerify = (paidUserId: string) => {
    verify(
      { paidUserId, status: 'verified' },
      {
        onSuccess: () => toast.success('Paid user verified successfully.'),
        onError: () => toast.error('Failed to verify. Please try again.'),
      }
    );
  };

  const handleReject = (paidUserId: string, rejection_reason: string) => {
    verify(
      { paidUserId, status: 'rejected', rejection_reason },
      {
        onSuccess: () => toast.success('Submission rejected.'),
        onError: () => toast.error('Failed to reject. Please try again.'),
      }
    );
  };

  if (isLoading) return <QueueSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load verification queue. Please try again.</AlertDescription>
      </Alert>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/30">
        <ShieldCheck className="h-10 w-10 text-green-500 mb-3" />
        <p className="text-lg font-medium">All clear</p>
        <p className="text-sm text-muted-foreground mt-1">
          No pending paid user verifications at this time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {queue.length} submission{queue.length !== 1 ? 's' : ''} awaiting review
      </p>
      {queue.map((item: any) => (
        <VerificationCard
          key={item.id}
          item={item}
          onVerify={handleVerify}
          onReject={handleReject}
          isPending={isPending}
        />
      ))}
    </div>
  );
}
