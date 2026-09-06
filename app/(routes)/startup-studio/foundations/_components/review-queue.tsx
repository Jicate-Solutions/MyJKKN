'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, ClipboardCheck, Inbox } from 'lucide-react';
import { WorksheetForm } from '@/components/startup-studio/worksheet-form';
import {
  useFoundationsReviewQueue,
  useReviewFoundationsResponse,
} from '@/hooks/startup-studio/use-foundations';
import type { FoundationsReviewItem } from '@/lib/services/startup-studio/foundations-service';

function QueueList({
  status,
  onReview,
}: {
  status: 'submitted' | 'reviewed';
  onReview: (item: FoundationsReviewItem) => void;
}) {
  const { data, isLoading } = useFoundationsReviewQueue({ status }) as {
    data?: { data: FoundationsReviewItem[] };
    isLoading: boolean;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const items = data?.data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">
          {status === 'submitted' ? 'Nothing waiting for review.' : 'No reviewed worksheets yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{item.worksheet?.title ?? 'Worksheet'}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.student?.full_name || item.student?.email || 'Learner'}
                {item.submitted_at && (
                  <> · {new Date(item.submitted_at).toLocaleDateString('en-IN')}</>
                )}
              </p>
            </div>
            {item.status === 'reviewed' && item.mentor_rating != null && (
              <Badge variant="secondary">{item.mentor_rating}/5</Badge>
            )}
            <Button size="sm" variant={status === 'submitted' ? 'default' : 'outline'} onClick={() => onReview(item)}>
              {status === 'submitted' ? 'Review' : 'View'}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReviewQueue() {
  const [active, setActive] = useState<FoundationsReviewItem | null>(null);
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<string>('');
  const review = useReviewFoundationsResponse();

  function openReview(item: FoundationsReviewItem) {
    setActive(item);
    setFeedback(item.mentor_feedback ?? '');
    setRating(item.mentor_rating != null ? String(item.mentor_rating) : '');
  }

  async function submitReview() {
    if (!active) return;
    await review.mutateAsync({
      responseId: active.id,
      mentor_feedback: feedback.trim() || undefined,
      mentor_rating: rating ? Number(rating) : undefined,
    });
    setActive(null);
  }

  return (
    <div className="space-y-6 mt-4">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold py-1">Review</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Read learner submissions and leave encouraging, specific feedback. Reviewing is a quality
          signal — it never blocks a learner&apos;s progress.
        </p>
      </div>

      <Tabs defaultValue="submitted">
        <TabsList>
          <TabsTrigger value="submitted">To review</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
        </TabsList>
        <TabsContent value="submitted" className="mt-4">
          <QueueList status="submitted" onReview={openReview} />
        </TabsContent>
        <TabsContent value="reviewed" className="mt-4">
          <QueueList status="reviewed" onReview={openReview} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.worksheet?.title ?? 'Worksheet'}</DialogTitle>
            <DialogDescription>
              {active?.student?.full_name || active?.student?.email || 'Learner'}
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="space-y-5">
              <WorksheetForm
                fields={active.fields_snapshot}
                initialData={active.response_data as Record<string, unknown>}
                readOnly
                onSubmit={() => {}}
              />

              <div className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rating">Rating (optional)</Label>
                  <Select value={rating} onValueChange={setRating}>
                    <SelectTrigger id="rating" className="w-32">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} / 5
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="feedback">Feedback</Label>
                  <Textarea
                    id="feedback"
                    rows={4}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="What did they do well? One thing to push further?"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)} disabled={review.isPending}>
              Cancel
            </Button>
            <Button onClick={submitReview} disabled={review.isPending}>
              {review.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
