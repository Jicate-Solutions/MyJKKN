'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Share2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAttendanceReportDetails } from '@/hooks/academic/use-attendance-analytics';
import { toast } from 'sonner';
import { AttendanceReportHeader } from './attendance-report-header';
import { AttendanceReportSummary } from './attendance-report-summary';
import { AttendanceReportStudentsList } from './attendance-report-students-list';

interface AttendanceReportDetailsWrapperProps {
  reportId: string;
}

export function AttendanceReportDetailsWrapper({
  reportId
}: AttendanceReportDetailsWrapperProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get period_id from URL parameters for consistent data display
  const urlPeriodId = searchParams.get('period_id');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>(
    urlPeriodId || undefined
  );

  const {
    data: reportDetails = [],
    isLoading,
    error,
    refetch,
    isFetching
  } = useAttendanceReportDetails(reportId, selectedPeriodId);

  const handleGoBack = () => {
    router.back();
  };

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center gap-4'>
          <Button variant='outline' onClick={handleGoBack}>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Reports
          </Button>
        </div>

        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            Failed to load attendance report details. Please try again.
            <Button
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              className='ml-2'
            >
              <RefreshCw className='h-4 w-4 mr-1' />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Get the first report details (all periods will have the same basic info)
  const primaryReport = reportDetails[0];

  // Debug logging for course code and other data
  console.log('🔍 Primary report data in wrapper:', {
    course_code: primaryReport?.course_code,
    course_name: primaryReport?.course_name,
    period_name: primaryReport?.period_name,
    selectedPeriodId: selectedPeriodId,
    urlPeriodId: urlPeriodId,
    all_keys: primaryReport ? Object.keys(primaryReport) : 'no data'
  });

  return (
    <div className='space-y-6'>
      {/* Header with navigation and actions */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <Button variant='outline' onClick={handleGoBack}>
            <ArrowLeft className='h-4 w-4 mr-2' />
            Back to Reports
          </Button>

          {/* Show period information for debugging and transparency */}
          {selectedPeriodId && (
            <Badge variant='secondary' className='text-xs'>
              Period: {selectedPeriodId}
              {urlPeriodId && (
                <span className='ml-1 text-green-600'>(from URL)</span>
              )}
            </Badge>
          )}
        </div>

        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Report Header */}
      <AttendanceReportHeader report={primaryReport} isLoading={isLoading} />

      {/* Report Summary */}
      <AttendanceReportSummary reports={reportDetails} isLoading={isLoading} />

      {/* Students List */}
      <AttendanceReportStudentsList
        reports={reportDetails}
        isLoading={isLoading}
      />
    </div>
  );
}
