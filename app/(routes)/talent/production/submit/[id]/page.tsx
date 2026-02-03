'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

interface Deliverable {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  revision_count: number;
  order?: {
    title: string;
    due_date: string | null;
    notes: string | null;
  };
}

export default function SubmitWorkPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');

  useEffect(() => {
    async function fetchDeliverable() {
      const supabase = createClient();

      const { data } = await (supabase as any).from('sh_content_deliverables')
        .select(`
          id, title, status, notes, revision_count,
          order:sh_content_orders(title, due_date, notes)
        `)
        .eq('id', params.id)
        .single();

      setDeliverable(data as Deliverable | null);
      setIsLoading(false);
    }

    fetchDeliverable();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fileUrl.trim()) {
      toast.error('Please provide a file URL');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const { error } = await (supabase as any).from('sh_content_deliverables')
      .update({
        file_url: fileUrl,
        notes: submissionNotes || deliverable?.notes,
        status: 'review',
      })
      .eq('id', params.id);

    if (error) {
      toast.error('Failed to submit work');
    } else {
      toast.success('Work submitted for review');
      router.push('/talent/production/my-work');
    }

    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
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
                {(deliverable.order as any)?.title || 'Order'}
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
              {(deliverable.order as any)?.due_date
                ? `Due: ${new Date((deliverable.order as any).due_date).toLocaleDateString()}`
                : 'No deadline'}
            </span>
          </div>

          {(deliverable.order as any)?.notes && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-1">Order Requirements:</p>
              <p className="text-sm text-muted-foreground">
                {(deliverable.order as any).notes}
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
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Submitting...' : 'Submit for Review'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
