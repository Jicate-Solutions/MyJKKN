'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Users } from 'lucide-react';
import { useSF100PaidUsers } from '@/hooks/startup-studio';

interface SF100PaidUserListProps {
  enrollmentId: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  verified: {
    label: 'Verified',
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-700 border-red-200',
  },
  auto_verified: {
    label: 'Auto-verified',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
};

const GATEWAY_LABELS: Record<string, string> = {
  razorpay_jicate: 'Razorpay (JICATE)',
  razorpay_custom: 'Razorpay (Custom)',
  upi: 'UPI',
  stripe: 'Stripe',
  cash: 'Cash',
  other: 'Other',
};

function TableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {['User', 'Amount', 'Gateway', 'Date', 'Status', 'Active'].map((h) => (
              <TableHead key={h}>
                <Skeleton className="h-4 w-16" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 6 }).map((_, j) => (
                <TableCell key={j}>
                  <Skeleton className="h-4 w-full max-w-[100px]" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SF100PaidUserList({ enrollmentId }: SF100PaidUserListProps) {
  const { data: raw, isLoading, error } = useSF100PaidUsers(enrollmentId);
  const users: any[] = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];

  if (isLoading) return <TableSkeleton />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load paid users. Please try again.</AlertDescription>
      </Alert>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center border rounded-lg bg-muted/20">
        <Users className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">No paid users logged yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Use the Log User button to record your first paying customer.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Gateway</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user: any) => {
            const statusKey = user.verification_status ?? user.status ?? 'pending';
            const statusConfig = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;
            const date = user.transaction_date ?? user.created_at;
            const formattedDate = date
              ? new Date(date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '—';

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">
                      {user.user_name ?? user.user_identifier ?? '—'}
                    </p>
                    {user.user_name && user.user_identifier && (
                      <p className="text-xs text-muted-foreground">{user.user_identifier}</p>
                    )}
                    {user.is_internal && (
                      <Badge
                        variant="outline"
                        className="text-xs mt-0.5 bg-yellow-50 text-yellow-700 border-yellow-300"
                      >
                        Internal
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums font-medium">
                  {user.amount != null
                    ? `₹${Number(user.amount).toLocaleString('en-IN')}`
                    : '—'}
                  {user.is_recurring && (
                    <span className="ml-1 text-xs text-muted-foreground">/mo</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {GATEWAY_LABELS[user.payment_gateway] ?? user.payment_gateway ?? '—'}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{formattedDate}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium whitespace-nowrap ${statusConfig.className}`}
                  >
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      user.is_active === false ? 'bg-gray-300' : 'bg-green-500'
                    }`}
                    aria-label={user.is_active === false ? 'Inactive' : 'Active'}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
