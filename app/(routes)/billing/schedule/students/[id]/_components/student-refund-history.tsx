'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Undo2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefundWorkflowService } from '@/lib/services/billing/refunds/refund-workflow-service';
import type { RefundRequest } from '@/types/billing-refund-workflow';

interface StudentRefundHistoryProps {
  studentId: string;
}

// Task 12: read-only card summarizing this student's refund-workflow
// requests on the schedule page. Renders nothing when the student has no
// refund requests, so it stays invisible for the common case.
export function StudentRefundHistory({ studentId }: StudentRefundHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['refund-requests', 'by-student', studentId],
    queryFn: () => RefundWorkflowService.getRequests({ student_id: studentId }),
    enabled: !!studentId
  });

  const requests = data?.data ?? [];

  if (isLoading || requests.length === 0) return null;

  const getTypeBadge = (type: RefundRequest['refund_type']) => {
    if (type === 'withdrawal') {
      return (
        <Badge variant='outline' className='bg-orange-100 text-orange-800 border-orange-200'>
          Withdrawal
        </Badge>
      );
    }
    return (
      <Badge variant='outline' className='bg-gray-100 text-gray-800 border-gray-200'>
        Adjustment
      </Badge>
    );
  };

  const getStatusBadge = (status: RefundRequest['status']) => {
    switch (status) {
      case 'disbursed':
        return <Badge variant='success'>Disbursed</Badge>;
      case 'declined':
        return <Badge variant='destructive'>Declined</Badge>;
      case 'pending_disbursement':
        return (
          <Badge variant='outline' className='bg-blue-100 text-blue-800 border-blue-200'>
            Pending Disbursement
          </Badge>
        );
      case 'pending_review':
      default:
        return (
          <Badge variant='outline' className='bg-yellow-100 text-yellow-800 border-yellow-200'>
            Pending Review
          </Badge>
        );
    }
  };

  return (
    <Card className='overflow-hidden'>
      <CardHeader className='bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950'>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <Undo2 className='h-5 w-5' />
          Refund Requests
        </CardTitle>
      </CardHeader>
      <CardContent className='p-4 sm:p-6'>
        <div className='space-y-3'>
          {requests.map((request) => (
            <div
              key={request.id}
              className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'
            >
              <div className='space-y-1 min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                    {request.request_number}
                  </span>
                  {getTypeBadge(request.refund_type)}
                  {getStatusBadge(request.status)}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {request.initiated_at
                    ? format(new Date(request.initiated_at), 'PP')
                    : '—'}{' '}
                  · ₹{Number(request.total_refund_amount ?? 0).toLocaleString('en-IN')}
                </p>
              </div>
              <Button variant='outline' size='sm' asChild className='self-start sm:self-auto'>
                <Link href={`/billing/refunds/${request.id}`}>
                  <Eye className='mr-2 h-4 w-4' />
                  View
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
