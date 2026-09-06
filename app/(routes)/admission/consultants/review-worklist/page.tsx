'use client';

// Referral Review Worklist.
//
// Three populations of agency credits that were found by audit and had nowhere
// to live in the UI. This screen exists to be LOOKED at before any referral rate
// is switched on, because the day a rate exists these rows stop being curiosities
// and become money.
//
// It was read-only until 2026-08-17. It now carries ONE action, on the first
// bucket only: releasing a walk-in credit into the payment run. The Director ruled
// that those credits stay out of the run until someone confirms each is genuine,
// and the generator now enforces that — so this screen is where the confirming
// happens. There is still no approve button, no rate field and no payment: a
// release records a decision, and money continues to need its own screens.
//
// The first bucket is deliberately framed as a data-capture question. Someone can
// walk in AND have been sent by an agency; the two facts are not in conflict. What
// the screen asks is whether the enquiry form is capturing the difference, not
// whether anyone did anything wrong. Releasing is the normal outcome, not the
// exception — the hold exists so the answer is recorded, not assumed.

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ShieldCheck, Link2Off, FileQuestion, Info, Lock, LockOpen, Loader2 } from 'lucide-react';
import {
  ReferralReviewService,
  type ReferralReviewRow,
  type ReferralReviewWorklist,
} from '@/lib/services/admission/referral-review-service';

const YEARS = [2025, 2026];

function yearLabel(y: number) {
  return `${y}–${String(y + 1).slice(2)}`;
}

function when(v: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function useWorklist(year: number) {
  return useQuery<ReferralReviewWorklist>({
    queryKey: ['referral-review-worklist', year],
    queryFn: () => ReferralReviewService.getWorklist(year),
  });
}

export default function ReferralReviewWorklistPage() {
  const [year, setYear] = useState<number>(2026);
  const { data, isLoading, error } = useWorklist(year);
  const queryClient = useQueryClient();

  // The row awaiting a release confirmation, and the note being typed for it.
  const [releasing, setReleasing] = useState<ReferralReviewRow | null>(null);
  const [releasingAtt, setReleasingAtt] = useState<ReferralReviewRow | null>(null);
  const [note, setNote] = useState('');

  const release = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      ReferralReviewService.clearWalkinCredit(id, text),
    onSuccess: (res) => {
      if (!res.ok) {
        // Write-once: someone else released this while the dialog was open.
        toast.error(
          res.reason === 'already_cleared'
            ? 'Already released by someone else — the list has been refreshed.'
            : 'That credit could not be found. It may have been removed.',
        );
      } else {
        toast.success('Released. It can now enter a payment run.');
      }
      setReleasing(null);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['referral-review-worklist', year] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not release this credit.'),
  });

  // Attendance holds release by learner + year, not by attribution id — a
  // different grain, so a separate call rather than an overloaded one.
  const releaseAttendance = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      ReferralReviewService.clearAttendanceHold(id, year, text),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(
          res.reason === 'already_cleared'
            ? 'Already released by someone else — the list has been refreshed.'
            : 'That learner could not be found.',
        );
      } else {
        toast.success('Released. It can now enter a payment run.');
      }
      setReleasingAtt(null);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['referral-review-worklist', year] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not release this referral.'),
  });

  const counts = data?.counts;
  const money = data?.money_position;
  const hold = data?.hold;

  // Read live rather than asserted, so the banner cannot outlive the fact.
  const nothingPayable =
    !!money && money.active_rate_count === 0 && money.commission_row_count === 0;

  return (
    <ContentLayout title="Referral Review Worklist">
      <PermissionGuard module="admission.leads" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Referral Review Worklist</h1>
            <p className="text-sm text-muted-foreground">
              Every {yearLabel(year)} agency credit that deserves a human look before any referral
              rate is switched on. Nothing on this page can be approved, changed or paid from here.
            </p>
          </div>

          {/* The money position — the single most important thing on the screen. */}
          <Card
            className={
              nothingPayable
                ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20'
                : 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20'
            }
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5" />
                {nothingPayable
                  ? 'Nothing here is payable yet'
                  : 'A rate or a commission now exists — read this list again'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : nothingPayable ? (
                <>
                  <p>
                    No referral rate is set for {yearLabel(year)} and no commission has ever been
                    generated, so no rupee is owed against any row below. This is a{' '}
                    <strong>review queue, not an approval queue</strong> — its whole purpose is to
                    be worked through <em>before</em> a rate turns these records into payments.
                  </p>
                  <p className="text-muted-foreground">
                    Rates and generation live on the{' '}
                    <Link href="/admission/consultants/referral-rates" className="text-primary underline">
                      Rates &amp; Generate
                    </Link>{' '}
                    page.
                  </p>
                </>
              ) : (
                <p>
                  {money?.active_rate_count ?? 0} active rate(s) for {yearLabel(year)} and{' '}
                  {money?.commission_row_count ?? 0} commission record(s) now exist. Rows below may
                  therefore already carry a value — settle them here before anything is approved on
                  the{' '}
                  <Link href="/admission/consultants/commissions" className="text-primary underline">
                    Commissions
                  </Link>{' '}
                  page.
                </p>
              )}
            </CardContent>
          </Card>

          {/* How much of the checking job is left. A count, not a promise. */}
          {!!hold && hold.total > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-5 w-5" />
                  {hold.held > 0
                    ? `${hold.held} walk-in credit${hold.held === 1 ? '' : 's'} still held`
                    : 'Every walk-in credit has been checked'}
                </CardTitle>
                <CardDescription>
                  {hold.held > 0 ? (
                    <>
                      A held credit is skipped by the commission generator, so it cannot be paid
                      even after a rate is set. Release each one below once you are satisfied the
                      agency really sent that learner.
                    </>
                  ) : (
                    <>
                      All {hold.total} have been released and will be included the next time
                      commissions are generated.
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${hold.total ? (hold.cleared / hold.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {hold.cleared} of {hold.total} released · {hold.held} to go
                </p>
              </CardContent>
            </Card>
          )}

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Academic year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{yearLabel(y)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-sm text-destructive">
                Could not load the worklist: {(error as Error).message}
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="walkin" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="walkin">
                Walk-in enquiries with an agency credited
                <CountChip n={counts?.walkin_credited} />
              </TabsTrigger>
              <TabsTrigger value="unlinked">
                Agency named but not linked
                <CountChip n={counts?.unlinked} />
              </TabsTrigger>
              <TabsTrigger value="orphan">
                Credits with no enquiry behind them
                <CountChip n={counts?.no_enquiry_trail} />
              </TabsTrigger>
              <TabsTrigger value="attendance">
                Not yet seen in session
                <CountChip n={counts?.attendance_held} />
              </TabsTrigger>
            </TabsList>

            {/* A — walk-in credited */}
            <TabsContent value="walkin">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    Walk-in enquiries with an agency credited
                  </CardTitle>
                  <CardDescription className="space-y-2">
                    <span className="block">
                      These enquiries are recorded as walk-ins, and an agency is also credited on
                      them. <strong>Both can be true at once</strong> — someone can walk through the
                      gate precisely because an agency sent them. So this is a question about how the
                      enquiry form captures the two facts, not a judgement about any agency or any
                      colleague.
                    </span>
                    <span className="block text-muted-foreground">
                      The “Attached” column is the useful signal: <strong>0 days</strong> means the
                      agency was entered when the enquiry was first created, not added to it
                      afterwards.
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RowTable
                    rows={data?.walkin_credited}
                    isLoading={isLoading}
                    showGap
                    showHold
                    onRelease={(r) => { setReleasing(r); setNote(''); }}
                    empty={`No walk-in enquiries carry an agency credit in ${yearLabel(year)}.`}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* B — unlinked */}
            <TabsContent value="unlinked">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2Off className="h-5 w-5 text-muted-foreground" />
                    Agency named but not linked
                  </CardTitle>
                  <CardDescription className="space-y-2">
                    <span className="block">
                      These learners are marked as agency-referred, but no agency record is attached
                      to them. The commission generator only considers referrals with a linked
                      agency, so it skips these without saying anything — which means whoever is
                      owed would never be recorded in the first place.
                    </span>
                    <span className="block">
                      Attaching the agency is done on the{' '}
                      <Link
                        href="/admission/consultants/unlinked-referrals"
                        className="text-primary underline"
                      >
                        unlinked referrals screen
                      </Link>
                      , which is live. This list stays read-only so the link is only ever recorded
                      in one place.
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RowTable
                    rows={data?.unlinked}
                    isLoading={isLoading}
                    agencyHeader="Name typed in"
                    empty={`Every agency-referred learner in ${yearLabel(year)} has an agency linked.`}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* C — no enquiry trail */}
            <TabsContent value="orphan">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileQuestion className="h-5 w-5 text-muted-foreground" />
                    Credits with no enquiry behind them
                  </CardTitle>
                  <CardDescription>
                    An agency is credited, but there is no enquiry record on the lead side to show
                    where the referral came from. These arrived through the learner record rather
                    than through an enquiry, so the usual trail — who first made contact, when, and
                    through which channel — does not exist for them. Confirming the referral with the
                    agency is the only way to close these.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RowTable
                    rows={data?.no_enquiry_trail}
                    isLoading={isLoading}
                    showSource
                    empty={`Every ${yearLabel(year)} agency credit has an enquiry behind it.`}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            {/* D — held: session attendance has never recorded them */}
            <TabsContent value="attendance">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    Enrolled, but not yet seen in session
                  </CardTitle>
                  <CardDescription className="space-y-2">
                    <span className="block">
                      These learners took the seat, an agency is credited, and their sessions{' '}
                      <strong>is</strong> being marked — but no register has recorded them present
                      since July. They are held out of the payment run until someone releases each.
                    </span>
                    <span className="block text-muted-foreground">
                      Only sessions that are actually being marked appear here. A learner whose sessions
                      nobody marks is never held and never listed — an empty register says nothing
                      about the learner, and holding them would measure whose attendance is being
                      taken rather than who is turning up.
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RowTable
                    rows={data?.attendance_held}
                    isLoading={isLoading}
                    showLifecycle
                    onRelease={(r) => { setReleasingAtt(r); setNote(''); }}
                    releaseKey="learner"
                    empty={`Every agency-referred learner with a marked session has been seen in ${yearLabel(year)}.`}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Releasing one credit. Deliberately one at a time and deliberately
              specific about the learner — a bulk "release all" would recreate the
              exact situation the Director's ruling exists to prevent. */}
          <Dialog
            open={!!releasing}
            onOpenChange={(o) => { if (!o) { setReleasing(null); setNote(''); } }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LockOpen className="h-5 w-5" /> Release this credit for payment?
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      You are confirming that{' '}
                      <strong>{releasing?.agency_name || 'this agency'}</strong> genuinely referred{' '}
                      <strong>{releasing?.learner_name || 'this learner'}</strong>, whose enquiry was
                      recorded as a walk-in.
                    </p>
                    <p>
                      Once released, this referral is included the next time commissions are
                      generated. It is <strong>not paid</strong> by this action — generation and the
                      four-stage approval both happen elsewhere. Your name and the date are recorded
                      against the release, and it cannot be undone from this screen.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="release-note">What did you check? (optional)</Label>
                <Textarea
                  id="release-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Confirmed with the agency on 17 Aug — they introduced the family in June."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setReleasing(null); setNote(''); }}
                  disabled={release.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (releasing?.attribution_id) {
                      release.mutate({ id: releasing.attribution_id, text: note });
                    }
                  }}
                  disabled={release.isPending || !releasing?.attribution_id}
                >
                  {release.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Yes, release it
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Releasing an attendance hold. Separate dialog because it asks a
              different question and calls a different RPC. */}
          <Dialog
            open={!!releasingAtt}
            onOpenChange={(o) => { if (!o) { setReleasingAtt(null); setNote(''); } }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LockOpen className="h-5 w-5" /> Release this referral for payment?
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>{releasingAtt?.learner_name || 'This learner'}</strong> has not been
                      recorded present in session since July, though their sessions are being marked.
                    </p>
                    <p>
                      Release only if you know they are genuinely attending — a transfer, a late
                      join, or a register that simply missed them. Once released, the referral is
                      included the next time commissions are generated. It is <strong>not paid</strong>{' '}
                      by this action. Your name and the date are recorded, and it cannot be undone
                      from this screen.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="att-note">What did you check? (optional)</Label>
                <Textarea
                  id="att-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Joined late in August — HOD confirmed she is attending."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setReleasingAtt(null); setNote(''); }}
                  disabled={releaseAttendance.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (releasingAtt?.learner_profile_id) {
                      releaseAttendance.mutate({ id: releasingAtt.learner_profile_id, text: note });
                    }
                  }}
                  disabled={releaseAttendance.isPending || !releasingAtt?.learner_profile_id}
                >
                  {releaseAttendance.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Yes, release it
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}

function CountChip({ n }: { n?: number }) {
  return (
    <Badge variant="secondary" className="ml-2">
      {n ?? '—'}
    </Badge>
  );
}

function RowTable({
  rows,
  isLoading,
  empty,
  showGap,
  showSource,
  showHold,
  showLifecycle,
  onRelease,
  releaseKey = 'attribution',
  agencyHeader = 'Agency',
}: {
  rows?: ReferralReviewRow[];
  isLoading: boolean;
  empty: string;
  showGap?: boolean;
  showSource?: boolean;
  /** Bucket A only — the payment hold does not apply to the other two. */
  showHold?: boolean;
  /** Bucket D — where the learner stands in the admission lifecycle. */
  showLifecycle?: boolean;
  onRelease?: (row: ReferralReviewRow) => void;
  /** Which id the release call needs: an attribution (bucket A) or a learner (D). */
  releaseKey?: 'attribution' | 'learner';
  agencyHeader?: string;
}) {
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Learner</TableHead>
            <TableHead>Programme</TableHead>
            <TableHead>Institution</TableHead>
            <TableHead>{agencyHeader}</TableHead>
            <TableHead>Credited on</TableHead>
            {showGap && <TableHead>Attached</TableHead>}
            {showSource && <TableHead>Recorded via</TableHead>}
            <TableHead>Verified</TableHead>
            {showLifecycle && <TableHead>Status</TableHead>}
            {showHold && <TableHead>Payment</TableHead>}
            {showLifecycle && <TableHead>Payment</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.attribution_id ?? r.learner_profile_id ?? i}>
              <TableCell className="font-medium">
                {r.learner_profile_id ? (
                  <Link
                    href={`/learners/profiles/${r.learner_profile_id}`}
                    className="text-primary hover:underline"
                  >
                    {r.learner_name || 'Name not recorded'}
                  </Link>
                ) : (
                  r.learner_name || <span className="text-muted-foreground">Name not recorded</span>
                )}
              </TableCell>
              <TableCell>
                {r.programme || <span className="text-muted-foreground">Not recorded</span>}
              </TableCell>
              <TableCell>
                {r.institution || <span className="text-muted-foreground">Not recorded</span>}
              </TableCell>
              <TableCell>
                {r.agency_name || <span className="text-muted-foreground">None on record</span>}
              </TableCell>
              <TableCell>{when(r.credit_created_at)}</TableCell>
              {showGap && (
                <TableCell>
                  {r.days_after_enquiry === null || r.days_after_enquiry === undefined ? (
                    <span className="text-muted-foreground">—</span>
                  ) : r.days_after_enquiry === 0 ? (
                    <Badge variant="secondary">At enquiry creation</Badge>
                  ) : (
                    <span>
                      {r.days_after_enquiry} day{r.days_after_enquiry === 1 ? '' : 's'} later
                    </span>
                  )}
                </TableCell>
              )}
              {showSource && (
                <TableCell className="text-muted-foreground">{r.referral_source || '—'}</TableCell>
              )}
              <TableCell>
                {r.is_verified === null || r.is_verified === undefined ? (
                  <span className="text-muted-foreground">Nothing to verify</span>
                ) : r.is_verified ? (
                  <span>
                    <Badge variant="default">Verified</Badge>
                    {r.verified_by_name && (
                      <span className="block text-xs text-muted-foreground mt-1">
                        by {r.verified_by_name}
                      </span>
                    )}
                  </span>
                ) : (
                  <Badge variant="secondary">Not verified</Badge>
                )}
              </TableCell>
              {showLifecycle && (
                <TableCell>
                  <Badge variant="secondary">{r.lifecycle_status || '—'}</Badge>
                </TableCell>
              )}
              {showLifecycle && (
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="secondary" className="gap-1">
                      <Lock className="h-3 w-3" /> Held
                    </Badge>
                    {onRelease && r.learner_profile_id && (
                      <Button size="sm" variant="outline" onClick={() => onRelease(r)}>
                        Release
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
              {showHold && (
                <TableCell>
                  {r.payout_cleared_at ? (
                    <span>
                      <Badge variant="default" className="gap-1">
                        <LockOpen className="h-3 w-3" /> Released
                      </Badge>
                      <span className="block text-xs text-muted-foreground mt-1">
                        {r.payout_cleared_by_name ? `by ${r.payout_cleared_by_name} · ` : ''}
                        {when(r.payout_cleared_at)}
                      </span>
                      {r.payout_cleared_note && (
                        <span className="block text-xs text-muted-foreground italic mt-0.5">
                          “{r.payout_cleared_note}”
                        </span>
                      )}
                    </span>
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" /> Held
                      </Badge>
                      {onRelease && r.attribution_id && (
                        <Button size="sm" variant="outline" onClick={() => onRelease(r)}>
                          Release
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
