'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BeatLoader } from 'react-spinners';
import { Download, CreditCard } from 'lucide-react';
import { useRefundReport } from '@/hooks/billing/use-billing-reports';
import type { BillingReportFilters } from '@/types/billing-schedule';

interface RefundReportTabProps {
  filters: BillingReportFilters;
  canExport: boolean;
}

export function RefundReportTab({ filters, canExport }: RefundReportTabProps) {
  const { report, loading } = useRefundReport(filters);

  if (loading) {
    return (
      <div className='flex justify-center items-center p-8'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex justify-between items-center'>
          <CardTitle className='flex items-center gap-2'>
            <CreditCard className='h-5 w-5' />
            Refund Report
          </CardTitle>
          {canExport && (
            <Button variant='outline' size='sm'>
              <Download className='h-4 w-4 mr-2' />
              Export
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className='text-center py-16'>
          <CreditCard className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
          <h3 className='text-lg font-semibold mb-2'>Refund Report</h3>
          <p className='text-muted-foreground'>
            {report.length} refund records found
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
