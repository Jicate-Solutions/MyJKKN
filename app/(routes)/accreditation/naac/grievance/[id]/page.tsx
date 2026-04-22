// app/(routes)/accreditation/naac/grievance/[id]/page.tsx
// ============================================================================
// PR-A6a — Grievance detail.
//
// Shows: ticket header, SLA status, raised-by info, full description, comments
// thread, add-comment form, status transition action (resolve).
//
// On status="resolved" transition, the AFTER-UPDATE trigger (companion
// migration) emits quality_evidence_mappings rows for NAAC 7.7.1 + UGC
// grievance. No client code required for the emission itself.
// ============================================================================

'use client';

import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, MessageSquarePlus, ShieldAlert } from 'lucide-react';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import { useAuth } from '@/hooks/use-auth';

export default function GrievanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [commentDraft, setCommentDraft] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const ticketQ = useQuery({
    queryKey: ['grievance', 'detail', id],
    queryFn: () => GrievanceService.getTicket(id),
  });
  const commentsQ = useQuery({
    queryKey: ['grievance', 'comments', id],
    queryFn: () => GrievanceService.listComments(id),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['grievance', 'detail', id] });
    qc.invalidateQueries({ queryKey: ['grievance', 'comments', id] });
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (commentDraft.trim().length < 1) return;
    if (!profile) { toast.error('No profile loaded.'); return; }

    setBusy('comment');
    try {
      await GrievanceService.addComment({
        ticket_id: id,
        content: commentDraft.trim(),
        author_id: profile.id,
        author_name: profile.email ?? 'Staff',
        author_type: 'staff',
        is_internal: commentInternal,
      });
      setCommentDraft('');
      setCommentInternal(false);
      refresh();
      toast.success('Comment added.');
    } catch (err) {
      toast.error('Could not add comment. ' + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleResolve = async () => {
    if (resolution.trim().length < 10) {
      toast.error('Resolution note must be at least 10 characters.');
      return;
    }
    setBusy('resolve');
    try {
      await GrievanceService.updateStatus(id, {
        status: 'resolved',
        resolution: resolution.trim(),
        resolved_by: profile?.id,
      });
      toast.success('Ticket resolved. Evidence row emitted for NAAC 7.7.1 + UGC grievance.');
      setResolution('');
      refresh();
    } catch (err) {
      toast.error('Could not resolve ticket. ' + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const t = ticketQ.data;
  const comments = commentsQ.data ?? [];
  const loading = ticketQ.isLoading || commentsQ.isLoading;
  const err = ticketQ.error || commentsQ.error;

  return (
    <ContentLayout title="Grievance Detail">
      <PageBreadcrumb
        items={[
          { label: 'Accreditation', href: '/accreditation' },
          { label: 'NAAC', href: '/accreditation/naac' },
          { label: 'Grievance', href: '/accreditation/naac/grievance' },
          { label: t?.ticket_number ?? id.slice(0, 8) },
        ]}
      />

      {err && (
        <Card className="mb-4">
          <CardContent className="p-4 text-sm text-destructive">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            {(err as Error).message}
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      )}

      {t && !loading && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-orange-500" />
                    <CardTitle className="text-lg">{t.subject}</CardTitle>
                    {t.is_emergency && <Badge variant="destructive">EMERGENCY</Badge>}
                    {t.is_anonymous && <Badge variant="outline">ANONYMOUS</Badge>}
                    {t.is_icc_only && <Badge variant="outline">ICC-ONLY</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{t.ticket_number}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  Filed {t.created_at ? new Date(t.created_at).toLocaleString() : '-'}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Status</div><Badge>{t.status}</Badge></div>
                <div><div className="text-xs text-muted-foreground">Priority</div><Badge variant="outline">{t.priority ?? '-'}</Badge></div>
                <div><div className="text-xs text-muted-foreground">SLA</div><Badge variant={t.sla_status === 'breached' ? 'destructive' : 'outline'}>{t.sla_status ?? '-'}</Badge></div>
                <div><div className="text-xs text-muted-foreground">Escalation</div><Badge variant="outline">Level {t.escalation_level}</Badge></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Raised by</div>
                <p>{t.is_anonymous ? '(anonymous)' : `${t.raised_by_name ?? '-'} · ${t.raised_by_type}`}</p>
                {!t.is_anonymous && t.raised_by_email && <p className="text-xs text-muted-foreground">{t.raised_by_email} · {t.raised_by_phone ?? ''}</p>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Description</div>
                <p className="whitespace-pre-wrap">{t.description}</p>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">SLA deadline</div>
                <p>{new Date(t.sla_deadline).toLocaleString()}</p>
              </div>
              {t.resolved_at && (
                <div>
                  <div className="text-xs text-muted-foreground">Resolution</div>
                  <p className="whitespace-pre-wrap">{t.resolution ?? '-'}</p>
                  <p className="text-xs text-muted-foreground">Resolved {new Date(t.resolved_at).toLocaleString()}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {t.status !== 'resolved' && t.status !== 'closed' && (
            <Card className="mt-4">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Resolve</CardTitle></CardHeader>
              <CardContent>
                <Label>Resolution note *</Label>
                <Textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe the resolution (min 10 chars). This becomes NAAC 7.7.1 evidence." rows={3} />
                <Button className="mt-3" onClick={handleResolve} disabled={busy === 'resolve'}>
                  {busy === 'resolve' ? 'Resolving…' : 'Mark Resolved'}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
              {comments.map(c => (
                <div key={c.id} className="border-l-2 border-muted pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.author_name}</span>
                    <Badge variant="outline" className="text-[10px]">{c.author_type}</Badge>
                    {c.is_internal && <Badge variant="secondary" className="text-[10px]">internal</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.content}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquarePlus className="h-4 w-4" /> Add comment</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAddComment}>
                <Textarea
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  placeholder="Add a note, ask for information, or reply."
                  rows={3}
                />
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input id="is-internal" type="checkbox" checked={commentInternal} onChange={e => setCommentInternal(e.target.checked)} className="h-4 w-4" />
                    <Label htmlFor="is-internal" className="font-normal">Internal (hidden from filer)</Label>
                  </div>
                  <div className="flex-1" />
                  <Button type="submit" disabled={busy === 'comment' || commentDraft.trim().length === 0}>
                    {busy === 'comment' ? 'Posting…' : 'Post Comment'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </ContentLayout>
  );
}
