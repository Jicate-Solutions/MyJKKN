'use client';

// My Proof — the learner's own Verified Skills Record.
// Spec: specs/verified-learner-transcript-spec-2026-07-14.md
//
// Every learner sees their OWN record (self-scoped, private), with a
// "this is wrong" button on every section (disputes must resolve before the
// record can ever be shared) and a share panel that stays honestly locked
// while the college sharing dial is off. Sections hidden by the college data
// health gate simply don't render — never a damning blank.

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Flag, Link2, ShieldOff, Copy, Eye } from 'lucide-react';
import {
  AttendanceSection,
  DurableSkillsSection,
  EngagementSection,
  MarksSection,
  RecordHeader,
  SelfClaimsSection,
} from '@/components/proof-record/record-sections';
import {
  useCreateShareToken,
  useOpenDispute,
  useProofRecord,
  useRevokeShareToken,
} from '@/hooks/proof-record/use-proof-record';
import type { ProofDisputeSection, ProofSharePanel } from '@/types/proof-record';

export default function MyProofPage() {
  const { data, isLoading, error } = useProofRecord();
  const [disputeFor, setDisputeFor] = useState<ProofDisputeSection | null>(null);

  if (isLoading) {
    return (
      <ContentLayout title="My Proof">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="My Proof">
        <div className="mx-auto max-w-3xl rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm">
          {String(error instanceof Error ? error.message : error)}
        </div>
      </ContentLayout>
    );
  }

  const record = data?.record ?? null;
  if (!record) {
    // Explicit state, never a silent redirect: this page is for learner
    // accounts; team members simply have no learner record to show.
    return (
      <ContentLayout title="My Proof">
        <div className="mx-auto max-w-3xl rounded-lg border p-6 text-sm text-muted-foreground">
          My Proof shows a learner&apos;s own evidence record. This account has
          no learner profile, so there is no record to show here.
        </div>
      </ContentLayout>
    );
  }

  const disputeButton = (section: ProofDisputeSection) => (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      onClick={() => setDisputeFor(section)}
    >
      <Flag className="mr-1 h-3.5 w-3.5" aria-hidden />
      This is wrong
    </Button>
  );

  const openDisputes = record.disputes.filter((d) => d.status === 'open');

  return (
    <ContentLayout title="My Proof">
      <div className="mx-auto max-w-3xl space-y-4">
        <RecordHeader learner={record.learner} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every line below is backed by a real, timestamped platform record.
          This page is private to you until you choose to share it. See
          something wrong? Use &ldquo;This is wrong&rdquo; on that section — a
          person reviews every report before your record can ever be shared.
        </p>

        {openDisputes.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
            {openDisputes.length === 1
              ? 'One correction you raised is under review.'
              : `${openDisputes.length} corrections you raised are under review.`}{' '}
            Sharing stays locked until every correction is resolved.
          </div>
        ) : null}

        {record.attendance ? (
          <AttendanceSection attendance={record.attendance} action={disputeButton('attendance')} />
        ) : null}
        {record.engagement ? (
          <EngagementSection engagement={record.engagement} action={disputeButton('engagement')} />
        ) : null}
        {data?.marks ? <MarksSection marks={data.marks} action={disputeButton('marks')} /> : null}
        <DurableSkillsSection />
        <SelfClaimsSection selfClaims={record.self_claims} />

        {data?.share ? <SharePanel share={data.share} /> : null}

        {record.disputes.length > 0 ? <DisputeHistory disputes={record.disputes} /> : null}
      </div>

      <DisputeDialog section={disputeFor} onClose={() => setDisputeFor(null)} />
    </ContentLayout>
  );
}

// ── Dispute dialog ───────────────────────────────────────────────────────────

const SECTION_LABEL: Record<ProofDisputeSection, string> = {
  attendance: 'Presence',
  engagement: 'Engagement & consistency',
  marks: 'Marks & academics',
  profile: 'My details',
  other: 'Something else',
};

function DisputeDialog({
  section,
  onClose,
}: {
  section: ProofDisputeSection | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState('');
  const openDispute = useOpenDispute();

  const submit = () => {
    if (!section) return;
    openDispute.mutate(
      { section, detail },
      {
        onSuccess: () => {
          toast.success('Reported. A person will review this — you can see the status below.');
          setDetail('');
          onClose();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not send the report.'),
      },
    );
  };

  return (
    <Dialog open={section !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a problem{section ? ` — ${SECTION_LABEL[section]}` : ''}</DialogTitle>
          <DialogDescription>
            Say what&apos;s wrong and, if you can, when it happened. A person
            reviews every report; your record cannot be shared while a report
            is open.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Example: the session on 3 July shows me absent, but I was present."
          rows={4}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={openDispute.isPending || detail.trim().length === 0}>
            {openDispute.isPending ? 'Sending…' : 'Send report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Share panel ──────────────────────────────────────────────────────────────

function SharePanel({ share }: { share: ProofSharePanel }) {
  const [label, setLabel] = useState('');
  const createToken = useCreateShareToken();
  const revokeToken = useRevokeShareToken();

  const activeTokens = share.tokens.filter(
    (t) => !t.revoked_at && new Date(t.expires_at) > new Date(),
  );

  const create = () => {
    createToken.mutate(
      { label },
      {
        onSuccess: () => {
          toast.success('Live verify-link created.');
          setLabel('');
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : 'Could not create the link.'),
      },
    );
  };

  const copyLink = (token: string) => {
    navigator.clipboard
      .writeText(`${window.location.origin}/proof/${token}`)
      .then(() => toast.success('Link copied.'))
      .catch(() => toast.error('Could not copy — long-press the link instead.'));
  };

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Sharing — you stay in control
        </p>
        <h2 className="mt-0.5 text-base font-semibold">Live verify-links</h2>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        {!share.sharing_enabled ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Outward sharing is not yet switched on for your college, so your
              record stays private to you. When it opens, you&apos;ll be able to
              hand an employer a live link that always shows your current,
              verified record — and cut it off any time.
            </p>
          </div>
        ) : (
          <>
            {share.open_disputes > 0 ? (
              <p className="text-sm text-muted-foreground">
                Sharing is locked while a correction you raised is under review.
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Who is this link for? (e.g. Interview — Salem mill HR)"
                  className="sm:flex-1"
                />
                <Button onClick={create} disabled={createToken.isPending}>
                  <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
                  {createToken.isPending ? 'Creating…' : 'Create link'}
                </Button>
              </div>
            )}
          </>
        )}

        {activeTokens.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {activeTokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{t.label ?? 'Verify-link'}</span>
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" aria-hidden />
                    opened {t.view_count} {t.view_count === 1 ? 'time' : 'times'} · expires{' '}
                    {new Date(t.expires_at).toLocaleDateString()}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => copyLink(t.token)}>
                  <Copy className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Copy link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    revokeToken.mutate(
                      { tokenId: t.id },
                      {
                        onSuccess: () => toast.success('Link cut off. It stops working immediately.'),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : 'Could not cut off the link.'),
                      },
                    )
                  }
                >
                  Cut off
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

// ── Dispute history ──────────────────────────────────────────────────────────

function DisputeHistory({
  disputes,
}: {
  disputes: Array<{
    id: string;
    section: ProofDisputeSection;
    detail: string;
    status: string;
    created_at: string;
    resolution_note: string | null;
  }>;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">Corrections you raised</h2>
      </div>
      <ul className="divide-y px-4 sm:px-5">
        {disputes.map((d) => (
          <li key={d.id} className="flex flex-wrap items-start gap-2 py-3 text-sm">
            <Badge variant={d.status === 'open' ? 'secondary' : 'outline'} className="capitalize">
              {d.status}
            </Badge>
            <div className="min-w-0 flex-1">
              <p>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {SECTION_LABEL[d.section]} · {new Date(d.created_at).toLocaleDateString()}
                </span>
              </p>
              <p className="mt-0.5">{d.detail}</p>
              {d.resolution_note ? (
                <p className="mt-1 text-xs text-muted-foreground">Outcome: {d.resolution_note}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
