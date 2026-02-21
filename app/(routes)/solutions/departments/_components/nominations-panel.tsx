'use client';

import { useState } from 'react';
import { useNominations, type NominationStatus } from '@/hooks/use-department-tracker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NominationsPanel() {
  const [activeTab, setActiveTab] = useState<NominationStatus>('pending');
  const { nominations, loading, error, approve, reject } = useNominations(activeTab);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleApprove = async (nominationId: string) => {
    setProcessing(true);
    setActionError(null);
    try {
      await approve(nominationId, '', reviewNotes || undefined);
      setReviewingId(null);
      setReviewNotes('');
      setReviewAction(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (nominationId: string) => {
    if (!reviewNotes.trim()) {
      setActionError('Review notes are required when rejecting');
      return;
    }
    setProcessing(true);
    setActionError(null);
    try {
      await reject(nominationId, '', reviewNotes);
      setReviewingId(null);
      setReviewNotes('');
      setReviewAction(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  const startReview = (id: string, action: 'approve' | 'reject') => {
    setReviewingId(id);
    setReviewAction(action);
    setReviewNotes('');
    setActionError(null);
  };

  const cancelReview = () => {
    setReviewingId(null);
    setReviewAction(null);
    setReviewNotes('');
    setActionError(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Department Nominations</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as NominationStatus); cancelReview(); }}>
          <TabsList className="mb-4">
            <TabsTrigger value="pending" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Pending
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Rejected
            </TabsTrigger>
          </TabsList>

          {['pending', 'approved', 'rejected'].map((tab) => (
            <TabsContent key={tab} value={tab}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-4 w-48 mb-2" />
                        <Skeleton className="h-3 w-32 mb-3" />
                        <Skeleton className="h-12 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : error ? (
                <div className="flex items-center gap-2 text-sm text-destructive py-4">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              ) : nominations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No {tab} nominations.
                </p>
              ) : (
                <div className="space-y-3">
                  {nominations.map((nom) => (
                    <Card key={nom.id} className="border">
                      <CardContent className="p-4">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium text-sm">
                              {nom.department?.department_name || 'Unknown Department'}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {nom.institution?.name} &middot; {nom.department?.department_code} &middot; {formatDate(nom.created_at)}
                            </p>
                          </div>
                          {nom.status === 'approved' && (
                            <Badge className="bg-green-100 text-green-800 border-0">Approved</Badge>
                          )}
                          {nom.status === 'rejected' && (
                            <Badge className="bg-red-100 text-red-800 border-0">Rejected</Badge>
                          )}
                        </div>

                        {/* Reason */}
                        <p className="text-sm text-muted-foreground mb-2">
                          {nom.nomination_reason}
                        </p>

                        {/* Capabilities */}
                        {nom.suggested_capabilities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {nom.suggested_capabilities.map((cap) => (
                              <Badge key={cap} variant="secondary" className="text-xs">
                                {cap}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Review notes (for approved/rejected) */}
                        {nom.review_notes && (
                          <div className="bg-muted rounded-md p-2 text-xs text-muted-foreground mb-2">
                            <span className="font-medium">Review: </span>
                            {nom.review_notes}
                            {nom.reviewed_at && (
                              <span className="ml-1">({formatDate(nom.reviewed_at)})</span>
                            )}
                          </div>
                        )}

                        {/* Actions for pending */}
                        {nom.status === 'pending' && (
                          <>
                            {reviewingId === nom.id ? (
                              <div className="space-y-2 pt-2 border-t">
                                <Textarea
                                  placeholder={reviewAction === 'reject' ? 'Review notes (required for rejection)...' : 'Optional review notes...'}
                                  value={reviewNotes}
                                  onChange={(e) => setReviewNotes(e.target.value)}
                                  rows={2}
                                  className="text-sm"
                                />
                                {actionError && (
                                  <p className="text-xs text-destructive">{actionError}</p>
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant={reviewAction === 'approve' ? 'default' : 'destructive'}
                                    onClick={() => reviewAction === 'approve' ? handleApprove(nom.id) : handleReject(nom.id)}
                                    disabled={processing}
                                  >
                                    {processing && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                    {reviewAction === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={cancelReview} disabled={processing}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => startReview(nom.id, 'approve')}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => startReview(nom.id, 'reject')}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
