'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Upload, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useProductionProfile, useDeliverableForSubmission, useSubmitWork } from '@/hooks/solutions/use-production-portal';

export default function SubmitWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: deliverableId } = use(params);
  const router = useRouter();
  const [fileUrl, setFileUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');

  const { profile, isLoading: authLoading } = useAuth();

  // Get production learner profile
  const { data: productionProfile, isLoading: profileLoading } = useProductionProfile(profile?.id || '');
  const learnerId = productionProfile?.id;

  // Get deliverable details (requires both deliverableId and learnerId)
  const { data: submissionData, isLoading: deliverableLoading } = useDeliverableForSubmission(deliverableId, learnerId);
  const deliverable = submissionData?.deliverable;

  // Submit mutation
  const submitWork = useSubmitWork();

  const isLoading = authLoading || profileLoading || deliverableLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fileUrl.trim()) {
      toast.error('Please provide a file URL');
      return;
    }

    try {
      await submitWork.mutateAsync({
        deliverableId,
        fileUrl,
      });
      toast.success('Work submitted for review');
      router.push('/talent/production/my-work');
    } catch (error) {
      toast.error('Failed to submit work');
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!productionProfile) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
            <h2 className="text-lg font-semibold">Profile Not Found</h2>
            <p className="text-muted-foreground mt-2">
              Your production learner profile has not been set up yet.
            </p>
            <Button className="mt-4" onClick={() => router.push('/talent/production')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!deliverable) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold">Deliverable Not Found</h2>
            <p className="text-muted-foreground mt-2">
              The deliverable you are trying to submit does not exist.
            </p>
            <Button className="mt-4" onClick={() => router.push('/talent/production/my-work')}>
              Back to My Work
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if user can submit
  if (!submissionData?.canSubmit) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-yellow-600 mb-4" />
            <h2 className="text-lg font-semibold">Cannot Submit</h2>
            <p className="text-muted-foreground mt-2">
              {!submissionData?.isAssigned
                ? 'You are not assigned to this deliverable.'
                : 'This deliverable has already been approved.'}
            </p>
            <Button className="mt-4" onClick={() => router.push('/talent/production/my-work')}>
              Back to My Work
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Work</h1>
        <p className="text-muted-foreground">
          Upload your completed deliverable for review
        </p>
      </div>

      {/* Deliverable Info */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{deliverable.title}</CardTitle>
              <CardDescription>
                {(deliverable.order as Record<string, unknown>)?.title as string || 'Order'}
              </CardDescription>
            </div>
            {deliverable.revision_count > 0 && (
              <Badge variant="outline" className="text-orange-600">
                Revision #{deliverable.revision_count + 1}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {(deliverable.order as Record<string, unknown>)?.due_date
                ? `Due: ${new Date((deliverable.order as Record<string, unknown>).due_date as string).toLocaleDateString()}`
                : 'No deadline'}
            </span>
          </div>

          {(deliverable.order as Record<string, unknown>)?.notes && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Order Requirements:</p>
              <p className="text-sm text-muted-foreground">
                {(deliverable.order as Record<string, unknown>).notes as string}
              </p>
            </div>
          )}

          {deliverable.notes && deliverable.revision_count > 0 && (
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm font-medium text-orange-800 mb-1">Revision Feedback:</p>
              <p className="text-sm text-orange-700">
                {deliverable.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Submit Your Work
          </CardTitle>
          <CardDescription>
            Provide the URL to your completed work (Google Drive, Dropbox, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-url">File URL *</Label>
              <Input
                id="file-url"
                placeholder="https://drive.google.com/..."
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Share a link to your file (ensure sharing permissions are set)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about your submission..."
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/talent/production/my-work')}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitWork.isPending} className="flex-1">
                {submitWork.isPending ? 'Submitting...' : 'Submit for Review'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
