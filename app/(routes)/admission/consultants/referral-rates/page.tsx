'use client';

// Referral Rates & Payout Generation
// F4 (rates) + the generate half of F6. Reads fn_generate_referral_commissions,
// which is DRY RUN by default and admin-gated — this page never moves money; it
// records who is owed (D20). The four-stage payout runs on the commissions page.

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Loader2, Plus, PlayCircle, AlertTriangle, IndianRupee } from 'lucide-react';
import {
  useReferralRates, useReferralRateMutations, useGenerateCommissions,
  useInstitutionOptions, useProgramOptions,
} from '@/hooks/admission/use-referral-rates';
import type { GenerateCommissionsResult } from '@/types/referral-rates';

const ALL = '__ALL__';
const YEARS = [2025, 2026];

function rupees(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
}

export default function ReferralRatesPage() {
  const [year, setYear] = useState<number>(2026);
  const { data: rates, isLoading } = useReferralRates(year);
  const { data: institutions } = useInstitutionOptions();
  const { data: programs } = useProgramOptions();
  const { createRate, setActive } = useReferralRateMutations();
  const generate = useGenerateCommissions();

  // Add-rate dialog state
  const [open, setOpen] = useState(false);
  const [fInstitution, setFInstitution] = useState<string>(ALL);
  const [fProgram, setFProgram] = useState<string>(ALL);
  const [fAmount, setFAmount] = useState<string>('');
  const [fTds, setFTds] = useState<string>('0');
  const [fNotes, setFNotes] = useState<string>('');

  // Generate/preview state
  const [preview, setPreview] = useState<GenerateCommissionsResult | null>(null);
  const [confirmGen, setConfirmGen] = useState(false);

  const programsForInstitution = useMemo(() => {
    if (!programs) return [];
    if (fInstitution === ALL) return programs;
    return programs.filter((p) => p.institution_id === fInstitution);
  }, [programs, fInstitution]);

  const resetForm = () => {
    setFInstitution(ALL); setFProgram(ALL); setFAmount(''); setFTds('0'); setFNotes('');
  };

  const submitRate = () => {
    const amount = parseFloat(fAmount);
    if (Number.isNaN(amount) || amount < 0) return;
    const tds = parseFloat(fTds) || 0;
    createRate.mutate(
      {
        academic_year: year,
        institution_id: fInstitution === ALL ? null : fInstitution,
        program_id: fProgram === ALL ? null : fProgram,
        flat_amount: amount,
        tds_percent: tds,
        notes: fNotes || null,
      },
      { onSuccess: () => { setOpen(false); resetForm(); } },
    );
  };

  const runPreview = () =>
    generate.mutate({ year, dryRun: true }, { onSuccess: (r) => setPreview(r) });

  const runGenerate = () =>
    generate.mutate({ year, dryRun: false }, {
      onSuccess: (r) => { setPreview(r); setConfirmGen(false); },
    });

  return (
    <ContentLayout title="Referral Rates & Payout Generation">
      <PermissionGuard module="admission.consultants.commissions" action="view">
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Referral Rates &amp; Payout Generation</h1>
            <p className="text-sm text-muted-foreground">
              Set the flat rate per admission, then generate pending commissions for agencies.
              Generating only records who is owed — it never pays anyone. Payment runs from the
              Commissions page after approval.
            </p>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Academic year</Label>
            <Select value={String(year)} onValueChange={(v) => { setYear(Number(v)); setPreview(null); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}–{String(y + 1).slice(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rates */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Rates for {year}–{String(year + 1).slice(2)}</CardTitle>
                <CardDescription>
                  A more specific rate wins: institution + programme beats institution, beats a global default.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add rate</Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !rates?.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No rates set for {year}–{String(year + 1).slice(2)} yet. Add one to begin.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Institution</TableHead>
                        <TableHead>Programme</TableHead>
                        <TableHead className="text-right">Flat amount</TableHead>
                        <TableHead className="text-right">TDS %</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rates.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.institution?.name || <span className="text-muted-foreground">All institutions</span>}</TableCell>
                          <TableCell>{r.program?.program_name || <span className="text-muted-foreground">All programmes</span>}</TableCell>
                          <TableCell className="text-right font-medium">{rupees(r.flat_amount)}</TableCell>
                          <TableCell className="text-right">{r.tds_percent}%</TableCell>
                          <TableCell>
                            <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm"
                              onClick={() => setActive.mutate({ id: r.id, isActive: !r.is_active })}>
                              {r.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generate */}
          <Card>
            <CardHeader>
              <CardTitle>Generate commissions</CardTitle>
              <CardDescription>
                Preview shows what would be created for every attributed agency referral in {year}–{String(year + 1).slice(2)}.
                Nothing is written until you press Generate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={runPreview} disabled={generate.isPending}>
                  {generate.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
                  Preview (no changes)
                </Button>
                <Button onClick={() => setConfirmGen(true)}
                  disabled={generate.isPending || !preview || (preview.eligible ?? preview.candidates) === 0}>
                  <IndianRupee className="h-4 w-4 mr-1" /> Generate pending commissions
                </Button>
              </div>

              {preview && (
                <div className="rounded-lg border p-4 space-y-3">
                  {preview.dry_run
                    ? <p className="text-xs text-muted-foreground">Preview only — nothing has been written.</p>
                    : <p className="text-xs text-green-700 font-medium">Generated {preview.rows_written} pending commission(s).</p>}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Stat label="Referrals found" value={String(preview.candidates)} />
                    <Stat label="Never enrolled" value={String(preview.blocked_not_enrolled ?? 0)} warn={(preview.blocked_not_enrolled ?? 0) > 0} />
                    <Stat label="Held for checking" value={String(preview.held_walkin ?? 0)} warn={(preview.held_walkin ?? 0) > 0} />
                    <Stat label="Held — not seen in session" value={String(preview.held_attendance ?? 0)} warn={(preview.held_attendance ?? 0) > 0} />
                    <Stat label="Payable now" value={String(preview.payable_now)} />
                    <Stat label="Blocked (no bank/PAN)" value={String(preview.blocked_no_bank)} warn={preview.blocked_no_bank > 0} />
                    <Stat label="Net total" value={rupees(preview.total_net)} />
                  </div>

                  {/* Never enrolled — a block, not a hold. There is nothing to review:
                      these people did not take the seat. */}
                  {(preview.blocked_not_enrolled ?? 0) > 0 && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
                      <p className="font-medium">
                        {preview.blocked_not_enrolled} referral{preview.blocked_not_enrolled === 1 ? '' : 's'} will
                        never be generated — worth {rupees(preview.blocked_not_enrolled_gross ?? 0)} at this rate.
                      </p>
                      <p className="text-muted-foreground">
                        Their learner never took the seat, or has since left — still an enquiry, rejected,
                        inactive or withdrawing. This is a block, not a hold: there is nothing to release,
                        because nobody joined. If a learner&apos;s status later becomes admitted or active,
                        the next run picks them up automatically.
                      </p>
                    </div>
                  )}

                  {/* Attendance hold — scoped to marked registers, and said so plainly. */}
                  {(preview.held_attendance ?? 0) > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                      <p className="font-medium">
                        {preview.held_attendance} more {preview.held_attendance === 1 ? 'is' : 'are'} held because
                        session attendance has never recorded them — worth {rupees(preview.held_attendance_gross ?? 0)}.
                      </p>
                      <p className="text-muted-foreground">
                        Only referrals whose sessions ARE being marked can be held this way. A learner whose sessions
                        nobody marks is never held — an empty register says nothing about the learner. Release
                        each on the{' '}
                        <Link href="/admission/consultants/review-worklist" className="text-primary underline">
                          Review Worklist
                        </Link>
                        .
                      </p>
                    </div>
                  )}

                  {/* The hold is the Director's, so it explains itself rather than
                      appearing as an unexplained shortfall in the numbers above. */}
                  {(preview.held_walkin ?? 0) > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                      <p className="font-medium">
                        {preview.held_walkin} referral{preview.held_walkin === 1 ? '' : 's'} will not be
                        generated — worth {rupees(preview.held_gross ?? 0)} at this rate.
                      </p>
                      <p className="text-muted-foreground">
                        Their enquiry was recorded as a walk-in and nobody has confirmed the agency
                        credit yet, so they stay out of the payment run. Release them one at a time on
                        the{' '}
                        <Link href="/admission/consultants/review-worklist" className="text-primary underline">
                          Review Worklist
                        </Link>
                        . Generating now writes {preview.eligible ?? preview.candidates} record(s), not{' '}
                        {preview.candidates}.
                      </p>
                    </div>
                  )}
                  {preview.by_agency?.length > 0 && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agency</TableHead>
                            <TableHead className="text-right">Referrals</TableHead>
                            <TableHead className="text-right">Held</TableHead>
                            <TableHead className="text-right">Not enrolled</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead>Payable</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.by_agency.map((a) => (
                            <TableRow key={a.agency}>
                              <TableCell>{a.agency}</TableCell>
                              <TableCell className="text-right">{a.referrals}</TableCell>
                              <TableCell className="text-right">
                                {a.held ? (
                                  <span className="text-amber-700 dark:text-amber-400">{a.held}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {a.not_enrolled ? (
                                  <span className="text-destructive">{a.not_enrolled}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">{rupees(a.net)}</TableCell>
                              <TableCell>
                                {a.payable
                                  ? <Badge variant="default">Yes</Badge>
                                  : <Badge variant="secondary">No bank/PAN</Badge>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {!preview.dry_run && (
                    <Link href="/admission/consultants/commissions" className="text-sm text-primary underline">
                      View the generated commissions →
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add-rate dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a rate for {year}–{String(year + 1).slice(2)}</DialogTitle>
              <DialogDescription>Leave institution or programme as “All” for a broader rate.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Institution</Label>
                <Select value={fInstitution} onValueChange={(v) => { setFInstitution(v); setFProgram(ALL); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All institutions</SelectItem>
                    {institutions?.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Programme</Label>
                <Select value={fProgram} onValueChange={setFProgram}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All programmes</SelectItem>
                    {programsForInstitution.map((p) => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Flat amount (₹)</Label>
                  <Input type="number" min="0" value={fAmount} onChange={(e) => setFAmount(e.target.value)} placeholder="5000" />
                </div>
                <div className="space-y-1">
                  <Label>TDS %</Label>
                  <Input type="number" min="0" max="100" value={fTds} onChange={(e) => setFTds(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submitRate} disabled={createRate.isPending || !fAmount}>
                {createRate.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save rate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm generate */}
        <Dialog open={confirmGen} onOpenChange={setConfirmGen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Generate pending commissions?
              </DialogTitle>
              <DialogDescription>
                This creates {preview?.eligible ?? preview?.candidates ?? 0} pending commission record(s) for{' '}
                {year}–{String(year + 1).slice(2)}.
                {((preview?.held_walkin ?? 0) + (preview?.held_attendance ?? 0) + (preview?.blocked_not_enrolled ?? 0)) > 0 && (
                  <>
                    {' '}The other{' '}
                    {(preview?.held_walkin ?? 0) + (preview?.held_attendance ?? 0) + (preview?.blocked_not_enrolled ?? 0)}{' '}
                    will <strong>not</strong> be created —{' '}
                    {preview?.blocked_not_enrolled ?? 0} never enrolled,{' '}
                    {preview?.held_walkin ?? 0} held for checking,{' '}
                    {preview?.held_attendance ?? 0} never seen in session.
                  </>
                )}{' '}
                They are <strong>not paid</strong> — they wait for the four-stage approval on the Commissions page.
                You can run this again later; already-recorded referrals are skipped.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmGen(false)}>Cancel</Button>
              <Button onClick={runGenerate} disabled={generate.isPending}>
                {generate.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Yes, generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PermissionGuard>
    </ContentLayout>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${warn ? 'text-amber-600' : ''}`}>{value}</div>
    </div>
  );
}
