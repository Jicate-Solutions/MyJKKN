'use client';

import { useEffect, useState } from 'react';
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
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  ChevronRight,
  Calendar,
  User,
  FileText,
  TrendingUp,
  History,
} from 'lucide-react';
import { ProfileChangeRequest } from '@/types/learner-profile-change';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ProfileStatusClientProps {
  learnerId: string;
}

export function ProfileStatusClient({ learnerId }: ProfileStatusClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/learners/change-requests/history/${learnerId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to fetch requests');
        }

        setRequests(data.data);
      } catch (err: any) {
        console.error('[profile-status-client] Error fetching requests:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [learnerId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-10 w-10 text-yellow-600" />;
      case 'approved':
        return <CheckCircle2 className="h-10 w-10 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-10 w-10 text-red-600" />;
      default:
        return <FileText className="h-10 w-10 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Summary Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* List Skeleton */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Error Loading Requests</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.back()} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="h-8 w-8 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Request History</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track and manage your profile change requests
          </p>
        </div>
        <Button
          onClick={() => router.push('/learners/my-profile')}
          variant="outline"
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Profile
        </Button>
      </div>

      {/* Summary Cards */}
      {requests.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-yellow-500 hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                  <p className="text-3xl font-bold text-yellow-600">
                    {requests.filter((r) => r.request_status === 'pending').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Awaiting approval</p>
                </div>
                <div className="h-14 w-14 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Clock className="h-7 w-7 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Approved</p>
                  <p className="text-3xl font-bold text-green-600">
                    {requests.filter((r) => r.request_status === 'approved').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Successfully updated</p>
                </div>
                <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 hover:shadow-lg transition-shadow sm:col-span-2 lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Rejected</p>
                  <p className="text-3xl font-bold text-red-600">
                    {requests.filter((r) => r.request_status === 'rejected').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Needs revision</p>
                </div>
                <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="h-7 w-7 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Requests List */}
      <div className="space-y-4">
        {requests.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Requests Yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                You haven't submitted any profile change requests. Make changes to your profile to submit your first request.
              </p>
              <Button
                onClick={() => router.push('/learners/my-profile')}
                variant="default"
                size="lg"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go to My Profile
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                All Requests ({requests.length})
              </h2>
            </div>
            {requests.map((request, index) => (
              <Card
                key={request.id}
                className={cn(
                  'hover:shadow-lg transition-all cursor-pointer border-l-4',
                  request.request_status === 'pending' && 'border-l-yellow-500 hover:border-l-yellow-600',
                  request.request_status === 'approved' && 'border-l-green-500 hover:border-l-green-600',
                  request.request_status === 'rejected' && 'border-l-red-500 hover:border-l-red-600'
                )}
                onClick={() => router.push(`/learners/my-profile/status/${request.id}`)}
              >
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5 hidden sm:block">
                        {getStatusIcon(request.request_status)}
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <CardTitle className="text-base sm:text-lg">
                            Request #{requests.length - index}
                          </CardTitle>
                          {getStatusBadge(request.request_status)}
                        </div>
                        <CardDescription className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(request.submitted_at), 'PPP')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(request.submitted_at), 'p')}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Fields Changed */}
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {request.fields_summary?.length || 0} Field{request.fields_summary?.length !== 1 ? 's' : ''} Modified:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {request.fields_summary?.slice(0, 6).map((field) => (
                          <Badge key={field} variant="secondary" className="text-xs">
                            {field.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                        {request.fields_summary && request.fields_summary.length > 6 && (
                          <Badge variant="secondary" className="text-xs">
                            +{request.fields_summary.length - 6} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Review Info (if approved/rejected) */}
                    {request.reviewed_at && (
                      <div className="pt-3 border-t space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="h-3.5 w-3.5" />
                            <span className="font-medium">Reviewed by:</span> {request.reviewer?.full_name || 'N/A'}
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(request.reviewed_at), 'PPP')}
                          </span>
                        </div>
                        {request.review_comments && (
                          <div className={cn(
                            'p-3 rounded-lg text-sm',
                            request.request_status === 'approved' && 'bg-green-50 border border-green-200',
                            request.request_status === 'rejected' && 'bg-red-50 border border-red-200'
                          )}>
                            <p className="font-medium text-xs uppercase tracking-wide mb-1 text-muted-foreground">
                              Reviewer Comments:
                            </p>
                            <p className="italic">{request.review_comments}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Click to view hint */}
                    <div className="pt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="sm:hidden">Tap to view details</span>
                      <span className="hidden sm:inline">Click to view full details</span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
