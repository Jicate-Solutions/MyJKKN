'use client';

import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  FileText,
} from 'lucide-react';
import { ProfileChangeRequest } from '@/types/learner-profile-change';
import { InfoField } from '@/app/(routes)/learners/my-profile/_components/info-field';
import { formatFieldLabel } from '@/lib/validations/profile-change-request';
import { format } from 'date-fns';

interface RequestDetailViewProps {
  request: ProfileChangeRequest;
}

export function RequestDetailView({ request }: RequestDetailViewProps) {
  const router = useRouter();

  const isPending = request.request_status === 'pending';
  const isApproved = request.request_status === 'approved';
  const isRejected = request.request_status === 'rejected';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700">
            <Clock className="mr-1 h-3 w-3" />
            Pending Review
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => router.push('/learners/my-profile/status')}
          variant="outline"
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Status
        </Button>
      </div>

      {/* Status Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="space-y-3">
            <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span>Profile Change Request</span>
              {getStatusBadge(request.request_status)}
            </CardTitle>
            <CardDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span className="font-medium">Submitted:</span>
                {format(new Date(request.submitted_at), 'PPpp')}
              </span>
            </CardDescription>
          </div>
        </CardHeader>

        {/* Review Details (for approved/rejected) */}
        {request.reviewed_at && (
          <CardContent className="border-t pt-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Reviewed By
                    </p>
                    <p className="text-sm font-medium">{request.reviewer?.full_name || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Reviewed At
                    </p>
                    <p className="text-sm font-medium">
                      {format(new Date(request.reviewed_at), 'PPP')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(request.reviewed_at), 'p')}
                    </p>
                  </div>
                </div>
              </div>
              {request.review_comments && (
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Reviewer Comments
                    </p>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap italic">{request.review_comments}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Changes Comparison */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Changes Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* Current Data (Left/Top) */}
          <Card className="border-2 border-green-500 shadow-sm">
            <CardHeader className="bg-green-50 dark:bg-green-950/20 pb-3">
              <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100 text-base sm:text-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                {isApproved ? 'Previous Information' : 'Current Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 max-h-[500px] lg:max-h-[600px] overflow-y-auto">
              <div className="space-y-4">
                {Object.keys(request.changed_fields).map((fieldName) => (
                  <InfoField
                    key={fieldName}
                    label={formatFieldLabel(fieldName)}
                    value={request.changed_fields[fieldName].old}
                    fieldName={fieldName}
                    className="bg-white dark:bg-card p-3 rounded-md border"
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Requested Changes (Right/Bottom) */}
          <Card
            className={`border-2 shadow-sm ${
              isPending
                ? 'border-yellow-500'
                : isApproved
                ? 'border-blue-500'
                : 'border-red-500'
            }`}
          >
            <CardHeader
              className={`pb-3 ${
                isPending
                  ? 'bg-yellow-50 dark:bg-yellow-950/20'
                  : isApproved
                  ? 'bg-blue-50 dark:bg-blue-950/20'
                  : 'bg-red-50 dark:bg-red-950/20'
              }`}
            >
              <CardTitle
                className={`flex items-center gap-2 text-base sm:text-lg ${
                  isPending
                    ? 'text-yellow-900 dark:text-yellow-100'
                    : isApproved
                    ? 'text-blue-900 dark:text-blue-100'
                    : 'text-red-900 dark:text-red-100'
                }`}
              >
                {isPending ? (
                  <>
                    <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                    <span className="break-words">Requested Changes</span>
                  </>
                ) : isApproved ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <span className="break-words">Approved Changes</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                    <span className="break-words">Rejected Changes</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 max-h-[500px] lg:max-h-[600px] overflow-y-auto">
              <div className="space-y-4">
                {Object.entries(request.changed_fields).map(([fieldName, change]) => (
                  <InfoField
                    key={fieldName}
                    label={formatFieldLabel(fieldName)}
                    value={change.new}
                    fieldName={fieldName}
                    className={`p-3 rounded-md border ${
                      isPending
                        ? 'bg-yellow-50 dark:bg-yellow-950/10 border-yellow-200 dark:border-yellow-900'
                        : isApproved
                        ? 'bg-blue-50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900'
                        : 'bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-900'
                    }`}
                    isChanged={true}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
