'use client';

// Item change requests — the super admin's queue.
//
// A POS store manager can open the item form and change what they think is wrong,
// but Save raises a request instead of writing to the item. This is where those
// land. Approving APPLIES the change; there is no second step to forget.
//
// The screen is built around the diff, because that is the whole decision: what
// the field says now, and what it would say. Everything else is context.

import { useState } from 'react';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsItemChangeRequests,
  useReviewImsItemChangeRequest,
} from '@/hooks/ims/use-ims-item-change-requests';
import { ITEM_FIELD_LABELS } from '@/lib/services/ims/item-change-request-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ArrowRight, Check, X, ShieldAlert, Inbox } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { useRouter } from 'next/navigation';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';

type QueueTab = 'pending' | 'approved' | 'rejected';

/** Render a stored value the way the form showed it. */
function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ItemApprovalsPage() {
  return (
    <ImsPageGuard module="ims.inventory" action="view">
      <ItemApprovalsPageInner />
    </ImsPageGuard>
  );
}

function ItemApprovalsPageInner() {
  const router = useRouter();
  const { institutionId } = useImsStoreContext();
  const { isSuperAdmin } = usePermissions();

  const [tab, setTab] = useState<QueueTab>('pending');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const { data: requests, isLoading } = useImsItemChangeRequests({
    status: tab,
    institutionId,
  });
  const review = useReviewImsItemChangeRequest();

  const decide = (id: string, approve: boolean) => {
    review.mutate(
      { id, approve, note: note.trim() || null },
      { onSettled: () => { setNoteFor(null); setNote(''); } },
    );
  };

  return (
    <ContentLayout title="Item Change Requests">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/ims/inventory/items')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to items
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Item Change Requests</h2>
            <p className="text-muted-foreground">
              Edits proposed by counter staff. Approving applies the change straight away.
            </p>
          </div>
        </div>

        {/* Say plainly who can act, rather than letting a non-admin press Approve
            and meet a database error they cannot interpret. */}
        {!isSuperAdmin && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              You can see these requests, but only a super admin can approve or reject them.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
          <TabsList>
            <TabsTrigger value="pending">Waiting</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <BeatLoader color="hsl(var(--primary))" size={10} />
          </div>
        ) : !requests || requests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Inbox className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {tab === 'pending' ? 'Nothing waiting for approval' : `No ${tab} requests`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => {
              const fields = Object.keys(req.proposed_changes ?? {});
              return (
                <Card key={req.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {req.item?.name ?? 'Item'}{' '}
                          <span className="font-mono text-xs text-muted-foreground">
                            {req.item?.code}
                          </span>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          Requested by {req.requester?.full_name ?? 'Unknown'} ·{' '}
                          {format(new Date(req.requested_at), 'dd MMM yyyy, hh:mm a')}
                        </p>
                      </div>
                      <Badge
                        variant={
                          req.status === 'approved'
                            ? 'default'
                            : req.status === 'rejected'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {req.status === 'pending' ? 'Waiting' : req.status}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {req.reason && (
                      <p className="text-sm text-muted-foreground italic">“{req.reason}”</p>
                    )}

                    {/* The diff — the actual decision. */}
                    <div className="rounded-lg border divide-y">
                      {fields.map((field) => (
                        <div
                          key={field}
                          className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 p-3"
                        >
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {ITEM_FIELD_LABELS[field] ?? field}
                            </p>
                            <p className="text-sm line-through text-muted-foreground break-all">
                              {display(req.current_values?.[field])}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                          <div className="sm:text-right">
                            <p className="text-xs text-muted-foreground sm:hidden">changes to</p>
                            <p className="text-sm font-medium break-all">
                              {display(req.proposed_changes?.[field])}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {req.status === 'pending' && isSuperAdmin && (
                      <div className="space-y-2">
                        {noteFor === req.id && (
                          <Textarea
                            placeholder="Optional note for whoever asked (why you approved or rejected)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                          />
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => decide(req.id, true)}
                            disabled={review.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve &amp; apply
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => decide(req.id, false)}
                            disabled={review.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                          {noteFor !== req.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setNoteFor(req.id); setNote(''); }}
                            >
                              Add a note
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {req.status !== 'pending' && (
                      <p className="text-xs text-muted-foreground">
                        {req.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                        {req.reviewer?.full_name ?? 'Unknown'}
                        {req.reviewed_at &&
                          ` · ${format(new Date(req.reviewed_at), 'dd MMM yyyy, hh:mm a')}`}
                        {req.review_note && ` · “${req.review_note}”`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
