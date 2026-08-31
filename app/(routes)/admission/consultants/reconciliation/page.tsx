'use client';

// Referral Reconciliation — the Registrar's independent check
//
// An agency referral credit is today created and then verified by the same
// person about 94% of the time. This page is the office that breaks that loop:
// the Registrar, a different desk from admission, meets each agency, types in
// the agency's OWN list, and the platform compares the two.
//
// The framing on the day is "submit your list so we can release your service
// charges faster" — nobody is accused, and the mismatch speaks for itself.
//
// Nothing on this page pays, generates or approves anything. Freezing a pair is
// an administrator action recorded with a reason; no payout path reads that flag
// yet. See supabase/migrations/20260818040000_referral_reconciliation_and_pair_scoring.sql

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Loader2, PlayCircle, Plus, Trash2, AlertTriangle, ShieldAlert,
  Lock, Unlock, CheckCircle2, HelpCircle, FileCheck2,
} from 'lucide-react';
import {
  ReferralReconciliationService as Svc,
  parsePastedClaims,
  type ReconciliationClaim,
  type ReconcileSummary,
  type EvidenceStatus,
  type PairRiskLevel,
} from '@/lib/services/admission/referral-reconciliation-service';

const YEARS = [2024, 2025, 2026];

const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  agency_confirmed: 'Agency confirmed',
  agency_does_not_recognise: 'Agency does not recognise',
  agency_has_dated_proof: 'Agency has dated proof',
};

const RISK_COPY: Record<PairRiskLevel, { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  watch: { label: 'Watch', className: 'bg-amber-100 text-amber-900 border-amber-300' },
  red: { label: 'Red', className: 'bg-red-100 text-red-900 border-red-300' },
};

export default function ReferralReconciliationPage() {
  const qc = useQueryClient();
  const { isSuperAdmin, userProfile } = usePermissions();

  // The database is the real gate on freezing (is_super_admin() OR is_admin()).
  // This only decides whether the control is worth showing; a refusal still
  // surfaces as an explicit message rather than a silent no-op.
  const canFreeze = isSuperAdmin
    || ['admin', 'super_admin', 'administrator'].includes(String(userProfile?.role ?? ''));

  const [consultantId, setConsultantId] = useState<string>('');
  const [year, setYear] = useState<number>(2025);
  const [sessionId, setSessionId] = useState<string>('');
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);

  // add-rows state
  const [rows, setRows] = useState<{ name: string; phone: string }[]>([{ name: '', phone: '' }]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // freeze dialog state
  const [freezeFor, setFreezeFor] = useState<{ teamMemberId: string; frozen: boolean; name: string } | null>(null);
  const [freezeReason, setFreezeReason] = useState('');

  const { data: consultants, isLoading: loadingConsultants } = useQuery({
    queryKey: ['recon-consultants'],
    queryFn: () => Svc.getConsultants(),
  });

  const { data: sessions } = useQuery({
    queryKey: ['recon-sessions', consultantId, year],
    queryFn: () => Svc.getSessions(consultantId || undefined, year),
    enabled: Boolean(consultantId),
  });

  const { data: claims, isLoading: loadingClaims } = useQuery({
    queryKey: ['recon-claims', sessionId],
    queryFn: () => Svc.getClaims(sessionId),
    enabled: Boolean(sessionId),
  });

  const { data: pairScores } = useQuery({
    queryKey: ['recon-pair-scores', consultantId],
    queryFn: () => Svc.getPairScores(consultantId || undefined),
    enabled: Boolean(consultantId),
  });

  const invalidateClaims = () => qc.invalidateQueries({ queryKey: ['recon-claims', sessionId] });
  const invalidateScores = () => qc.invalidateQueries({ queryKey: ['recon-pair-scores'] });

  const startSession = useMutation({
    mutationFn: () => Svc.createSession({ consultant_id: consultantId, academic_year: year }),
    onSuccess: (s) => {
      setSessionId(s.id);
      setSummary(null);
      qc.invalidateQueries({ queryKey: ['recon-sessions'] });
      toast.success('Reconciliation started');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not start the reconciliation'),
  });

  const addClaims = useMutation({
    mutationFn: (input: { name: string; phone: string }[]) =>
      Svc.addClaims(sessionId, input.map((r) => ({ claimed_name: r.name, claimed_phone: r.phone }))),
    onSuccess: (n) => {
      if (n === 0) { toast.error('Nothing to add — every row was blank'); return; }
      setRows([{ name: '', phone: '' }]);
      setPasteText('');
      setPasteOpen(false);
      invalidateClaims();
      toast.success(`Added ${n} name${n === 1 ? '' : 's'} from the agency's list`);
    },
    onError: (e: Error) => toast.error(e.message || 'Could not add the rows'),
  });

  const removeClaim = useMutation({
    mutationFn: (id: string) => Svc.deleteClaim(id),
    onSuccess: () => { invalidateClaims(); },
    onError: (e: Error) => toast.error(e.message || 'Could not remove the row'),
  });

  const reconcile = useMutation({
    mutationFn: () => Svc.reconcile(sessionId),
    onSuccess: (s) => {
      setSummary(s);
      invalidateClaims();
      toast.success('Reconciled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not reconcile'),
  });

  const setEvidence = useMutation({
    mutationFn: (v: { id: string; status: EvidenceStatus }) =>
      Svc.setEvidence(v.id, { evidence_status: v.status }),
    onSuccess: () => invalidateClaims(),
    onError: (e: Error) => toast.error(e.message || 'Could not record the evidence'),
  });

  const recompute = useMutation({
    mutationFn: (v: { teamMemberId: string }) => Svc.recomputePairScore(v.teamMemberId, consultantId),
    onSuccess: () => { invalidateScores(); toast.success('Pair score recomputed'); },
    onError: (e: Error) => toast.error(e.message || 'Could not recompute the score'),
  });

  const setFreeze = useMutation({
    mutationFn: (v: { teamMemberId: string; frozen: boolean; reason: string }) =>
      Svc.setPairFreeze(v.teamMemberId, consultantId, v.frozen, v.reason),
    onSuccess: (_r, v) => {
      invalidateScores();
      setFreezeFor(null);
      setFreezeReason('');
      toast.success(v.frozen ? 'Pair frozen' : 'Pair unfrozen');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not change the freeze'),
  });

  const buckets = useMemo(() => {
    const empty: Record<string, ReconciliationClaim[]> = {
      credited_not_claimed: [], claimed_not_credited: [], agreed: [], unbucketed: [],
    };
    (claims ?? []).forEach((c) => {
      const key = c.bucket ?? 'unbucketed';
      (empty[key] ??= []).push(c);
    });
    return empty;
  }, [claims]);

  const selectedConsultantName =
    consultants?.find((c) => c.id === consultantId)?.name ?? 'the agency';

  return (
    <ContentLayout title="Referral Reconciliation">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Referral Reconciliation</h1>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Enter the agency&apos;s own list of learners, then compare it against the credits the
              platform already holds. Nothing here pays or approves anything — it only shows where
              the two lists disagree.
            </p>
          </div>

          {/* ── 1. Pick the agency and the year ─────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>1. Choose the agency and intake year</CardTitle>
              <CardDescription>
                One reconciliation covers one agency for one intake year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-[240px]">
                  <Label>Agency</Label>
                  <Select
                    // `|| undefined`, never the raw empty string: Radix Select treats
                    // an empty-string value as a selection it cannot find an item
                    // for, and the dropdown breaks on first open. undefined is what
                    // shows the placeholder instead. The repo's CI audit only spots
                    // the hardcoded literal form of this, not the dynamic one, so
                    // this had to be caught by reading the guard rather than by it
                    // firing.
                    value={consultantId || undefined}
                    onValueChange={(v) => { setConsultantId(v); setSessionId(''); setSummary(null); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingConsultants ? 'Loading…' : 'Select an agency'} />
                    </SelectTrigger>
                    <SelectContent>
                      {consultants?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name || 'Unnamed agency'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Intake year</Label>
                  <Select
                    value={String(year)}
                    onValueChange={(v) => { setYear(Number(v)); setSessionId(''); setSummary(null); }}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}–{String(y + 1).slice(2)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => startSession.mutate()}
                  disabled={!consultantId || startSession.isPending}
                >
                  {startSession.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <Plus className="h-4 w-4 mr-1" />}
                  Start a reconciliation
                </Button>
              </div>

              {consultantId && sessions && sessions.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Or reopen an earlier one</Label>
                  <div className="flex flex-wrap gap-2">
                    {sessions.map((s) => (
                      <Button
                        key={s.id}
                        size="sm"
                        variant={s.id === sessionId ? 'default' : 'outline'}
                        onClick={() => { setSessionId(s.id); setSummary(null); }}
                      >
                        {new Date(s.conducted_at).toLocaleDateString('en-IN')}
                        <Badge variant="secondary" className="ml-2">{s.status}</Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 2. The agency's own list ────────────────────────────────── */}
          {sessionId && (
            <Card>
              <CardHeader>
                <CardTitle>2. Enter the agency&apos;s list</CardTitle>
                <CardDescription>
                  Type what {selectedConsultantName} says it referred. A phone number matches far
                  more reliably than a name — include it wherever the agency has one.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {rows.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1 flex-1 min-w-[180px]">
                      {i === 0 && <Label className="text-xs">Name</Label>}
                      <Input
                        value={r.name}
                        placeholder="Learner name"
                        onChange={(e) => setRows((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      />
                    </div>
                    <div className="space-y-1 w-48">
                      {i === 0 && <Label className="text-xs">Phone</Label>}
                      <Input
                        value={r.phone}
                        placeholder="10-digit mobile"
                        onChange={(e) => setRows((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove this row"
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm"
                    onClick={() => setRows((prev) => [...prev, { name: '', phone: '' }])}>
                    <Plus className="h-4 w-4 mr-1" /> Add a row
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
                    Paste a whole list
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => addClaims.mutate(rows)}
                    disabled={addClaims.isPending || rows.every((r) => !r.name.trim() && !r.phone.trim())}
                  >
                    {addClaims.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Save to the list
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── 3. Reconcile ────────────────────────────────────────────── */}
          {sessionId && (
            <Card>
              <CardHeader>
                <CardTitle>3. Compare the two lists</CardTitle>
                <CardDescription>
                  Safe to run as many times as you like. Re-running refreshes the comparison and
                  keeps every note already recorded.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
                  {reconcile.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <PlayCircle className="h-4 w-4 mr-1" />}
                  Reconcile
                </Button>

                {summary && (
                  <div className="grid gap-3 md:grid-cols-3">
                    {/* The finding that matters, deliberately loudest. */}
                    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 md:col-span-1">
                      <div className="flex items-center gap-2 text-red-900">
                        <ShieldAlert className="h-5 w-5" />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          Credited, not claimed
                        </span>
                      </div>
                      <div className="text-4xl font-bold text-red-900 mt-1">
                        {summary.credited_not_claimed}
                      </div>
                      <p className="text-xs text-red-900/80 mt-1">
                        The platform credits {selectedConsultantName} for these learners, but the
                        agency does not claim them. An agency has every reason to claim what it
                        actually referred.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Claimed, not credited
                      </div>
                      <div className="text-3xl font-semibold mt-1">{summary.claimed_not_credited}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        The agency claims these; the platform holds no credit. Usually a genuine miss.
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Agreed
                      </div>
                      <div className="text-3xl font-semibold mt-1">{summary.agreed}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        On both lists. {summary.credited_by_platform} credited by the platform,
                        {' '}{summary.claimed_by_agency} claimed by the agency.
                      </p>
                    </div>
                  </div>
                )}

                {loadingClaims ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <div className="space-y-6">
                    <BucketTable
                      title="Credited, not claimed"
                      tone="danger"
                      hint="Ask the agency about each of these. A credit the agency will not own is the finding."
                      rows={buckets.credited_not_claimed}
                      onEvidence={(id, status) => setEvidence.mutate({ id, status })}
                      onRemove={null}
                    />
                    <BucketTable
                      title="Claimed, not credited"
                      tone="muted"
                      hint="The agency named these but the platform holds no credit for them."
                      rows={buckets.claimed_not_credited}
                      onEvidence={(id, status) => setEvidence.mutate({ id, status })}
                      onRemove={(id) => removeClaim.mutate(id)}
                    />
                    <BucketTable
                      title="Agreed"
                      tone="muted"
                      hint="On both lists."
                      rows={buckets.agreed}
                      onEvidence={(id, status) => setEvidence.mutate({ id, status })}
                      onRemove={(id) => removeClaim.mutate(id)}
                    />
                    {buckets.unbucketed.length > 0 && (
                      <BucketTable
                        title="Not compared yet"
                        tone="muted"
                        hint="Added since the last comparison. Press Reconcile to place them."
                        rows={buckets.unbucketed}
                        onEvidence={(id, status) => setEvidence.mutate({ id, status })}
                        onRemove={(id) => removeClaim.mutate(id)}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── 4. Pair scores ──────────────────────────────────────────── */}
          {consultantId && (
            <Card>
              <CardHeader>
                <CardTitle>Pair scores for {selectedConsultantName}</CardTitle>
                <CardDescription>
                  Scored on the pair — a team member together with an agency — because one person
                  spreading credits thinly across several agencies looks clean on every single
                  agency row. Freezing is a decision a person makes; the score never freezes on
                  its own, and nothing is withheld automatically today.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!pairScores?.length ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No pair scores yet. Reconcile a list, then recompute from a row here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team member</TableHead>
                          <TableHead className="text-right">Credits</TableHead>
                          <TableHead className="text-right">Confirmed</TableHead>
                          <TableHead className="text-right">Disputed</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead>Frozen</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pairScores.map((p) => {
                          const risk = RISK_COPY[p.risk_level] ?? RISK_COPY.normal;
                          const who = p.team_member?.full_name || p.team_member?.email || p.team_member_id;
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{who}</TableCell>
                              <TableCell className="text-right">{p.credits_total}</TableCell>
                              <TableCell className="text-right">{p.credits_confirmed}</TableCell>
                              <TableCell className="text-right font-semibold">{p.credits_disputed}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${risk.className}`}>
                                  {risk.label}
                                </span>
                              </TableCell>
                              <TableCell>
                                {p.frozen ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-red-800">
                                    <Lock className="h-3 w-3" /> {p.frozen_reason || 'Frozen'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <Button variant="ghost" size="sm"
                                  onClick={() => recompute.mutate({ teamMemberId: p.team_member_id })}
                                  disabled={recompute.isPending}>
                                  Recompute
                                </Button>
                                {canFreeze && (
                                  <Button variant="ghost" size="sm"
                                    onClick={() => {
                                      setFreezeFor({ teamMemberId: p.team_member_id, frozen: !p.frozen, name: String(who) });
                                      setFreezeReason('');
                                    }}>
                                    {p.frozen
                                      ? <><Unlock className="h-4 w-4 mr-1" /> Unfreeze</>
                                      : <><Lock className="h-4 w-4 mr-1" /> Freeze</>}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Paste-many dialog */}
        <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Paste the agency&apos;s list</DialogTitle>
              <DialogDescription>
                One learner per line. &ldquo;Name, phone&rdquo; or a name on its own both work.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              rows={10}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Asha Kumar, 9876543210\nBala Raj, 9876543211'}
            />
            <p className="text-xs text-muted-foreground">
              {parsePastedClaims(pasteText).length} row(s) detected.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button>
              <Button
                onClick={() => addClaims.mutate(
                  parsePastedClaims(pasteText).map((r) => ({ name: r.claimed_name, phone: r.claimed_phone })))}
                disabled={addClaims.isPending || parsePastedClaims(pasteText).length === 0}
              >
                {addClaims.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Add these rows
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Freeze dialog — a reason is mandatory, enforced in the database too */}
        <Dialog open={Boolean(freezeFor)} onOpenChange={(o) => { if (!o) setFreezeFor(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                {freezeFor?.frozen ? 'Freeze' : 'Unfreeze'} {freezeFor?.name}
                {' '}with {selectedConsultantName}
              </DialogTitle>
              <DialogDescription>
                This records a decision against the pair, with your name and the reason. It does not
                stop, hold or release any payment on its own.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea
                rows={3}
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder="What was found, and what happens next"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFreezeFor(null)}>Cancel</Button>
              <Button
                onClick={() => freezeFor && setFreeze.mutate({
                  teamMemberId: freezeFor.teamMemberId,
                  frozen: freezeFor.frozen,
                  reason: freezeReason,
                })}
                disabled={setFreeze.isPending || !freezeReason.trim()}
              >
                {setFreeze.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {freezeFor?.frozen ? 'Freeze this pair' : 'Unfreeze this pair'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PermissionGuard>
    </ContentLayout>
  );
}

// ---------------------------------------------------------------------------

function BucketTable({
  title, hint, tone, rows, onEvidence, onRemove,
}: {
  title: string;
  hint: string;
  tone: 'danger' | 'muted';
  rows: ReconciliationClaim[];
  onEvidence: (id: string, status: EvidenceStatus) => void;
  onRemove: ((id: string) => void) | null;
}) {
  const danger = tone === 'danger';
  return (
    <div className={danger ? 'rounded-lg border-2 border-red-300 bg-red-50/40 p-4' : 'rounded-lg border p-4'}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className={`font-semibold ${danger ? 'text-red-900' : ''}`}>
          {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </h3>
      </div>
      <p className={`text-xs mt-0.5 ${danger ? 'text-red-900/80' : 'text-muted-foreground'}`}>{hint}</p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nothing in this group.</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Matched</TableHead>
                <TableHead>What the agency said</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.claimed_name || '—'}</TableCell>
                  <TableCell>{c.claimed_phone || '—'}</TableCell>
                  <TableCell>
                    {c.matched_learner_id
                      ? <Badge variant="secondary">by {c.match_confidence}</Badge>
                      : <Badge variant="outline">no match</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <EvidenceButton
                        active={c.evidence_status === 'agency_confirmed'}
                        onClick={() => onEvidence(c.id, 'agency_confirmed')}
                        icon={<CheckCircle2 className="h-3 w-3" />}
                        label={EVIDENCE_LABEL.agency_confirmed}
                      />
                      <EvidenceButton
                        active={c.evidence_status === 'agency_does_not_recognise'}
                        onClick={() => onEvidence(c.id, 'agency_does_not_recognise')}
                        icon={<HelpCircle className="h-3 w-3" />}
                        label={EVIDENCE_LABEL.agency_does_not_recognise}
                      />
                      <EvidenceButton
                        active={c.evidence_status === 'agency_has_dated_proof'}
                        onClick={() => onEvidence(c.id, 'agency_has_dated_proof')}
                        icon={<FileCheck2 className="h-3 w-3" />}
                        label={EVIDENCE_LABEL.agency_has_dated_proof}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {onRemove && c.source === 'agency' && (
                      <Button variant="ghost" size="icon" aria-label="Remove this row"
                        onClick={() => onRemove(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EvidenceButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-background hover:bg-muted text-muted-foreground'
      }`}
    >
      {icon}{label}
    </button>
  );
}
