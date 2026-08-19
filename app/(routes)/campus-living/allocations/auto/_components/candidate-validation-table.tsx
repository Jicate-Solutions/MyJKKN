'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Check,
  X,
  Minus,
  Users,
  BedDouble,
  AlertTriangle,
  Filter,
  RotateCcw,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { AllocationCandidate, BillState } from '@/types/allocation-batch';
import { BILL_STATE_LABEL } from './candidate-display';

// Shows the fee the Category-Eligibility band was matched against, and which
// academic year it was read from. 'matched' = the learner's admission year (the
// intended anchor); 'different_year' = no admission-year bill, so their earliest
// billed year was used. Both are usable — only the red states are skipped.
function BillBadge({ c }: { c: AllocationCandidate }) {
  const fee = c.band_fee != null ? `₹${Number(c.band_fee).toLocaleString('en-IN')}` : '—';
  const map: Record<BillState, { label: string; cls: string }> = {
    matched: {
      label: `${fee} · ${c.band_academic_year_name ?? 'admission yr'}`,
      cls: 'bg-green-100 text-green-800',
    },
    different_year: {
      label: `${fee} · ${c.band_academic_year_name ?? 'fallback yr'}`,
      cls: 'bg-amber-100 text-amber-800',
    },
    untagged: { label: 'No usable bill', cls: 'bg-red-100 text-red-700' },
    none: { label: 'No bill', cls: 'bg-red-100 text-red-700' },
  };
  const m = map[c.bill_state];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${m.cls}`}>{m.label}</span>;
}

function YesNo({ ok, na }: { ok: boolean; na?: boolean }) {
  if (na) return <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;
  return ok ? (
    <Check className="mx-auto h-4 w-4 text-green-600" />
  ) : (
    <X className="mx-auto h-4 w-4 text-red-600" />
  );
}

function Stat({
  icon,
  label,
  value,
  muted,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${muted ? 'opacity-70' : ''}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

const ALL = '__all__';

// Distinct, sorted, non-null values of a candidate field — drives a filter dropdown.
function distinct(
  candidates: AllocationCandidate[],
  pick: (c: AllocationCandidate) => string | null
): string[] {
  return [...new Set(candidates.map(pick).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b)
  );
}

// A labelled Select used in the filter bar; first option is always "All".
function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CandidateValidationTable({
  candidates,
  availableBeds,
  hostelType,
  strict,
  allowOverflow = true,
  scope = [],
}: {
  candidates: AllocationCandidate[];
  availableBeds: number;
  /** 'boys' | 'girls' — stamped into the export header. */
  hostelType: string;
  /** The page's Strict physical rules toggle — stamped into the export header. */
  strict: boolean;
  /** The page's overflow toggle — stamped into the export header. */
  allowOverflow?: boolean;
  /** Page-level cohort selection, pre-labelled. [] => no narrowing. */
  scope?: string[];
}) {
  // Summary stats reflect the FULL candidate set (filters only narrow the table).
  const eligible = candidates.filter((c) => c.verdict === 'in').length;
  const excluded = candidates.length - eligible;
  // A learner with no band_fee resolves no category and is skipped, whatever
  // else is true of them — surfaced separately because it is fixed in Billing,
  // not in Campus Living.
  const feeResolved = candidates.filter((c) => c.band_fee != null).length;
  const noFee = candidates.length - feeResolved;
  // Identical to `eligible` by construction: verdict 'in' now means the shared
  // planner (the one Generate runs) actually assigned this learner a bed, with
  // beds consumed as it goes. It used to be min(eligible, availableBeds), which
  // was wrong in both directions — `eligible` was a per-learner reachability
  // test that let a whole cohort claim the same free bed, and `availableBeds`
  // is a cross-category whole-hostel-type total that counts Deluxe beds a
  // Classic-band learner can never occupy. Kept as its own stat because "will
  // place" is the number the operator acts on.
  const willPlace = eligible;
  // How many of the eligible are only placeable because overflow is on — i.e.
  // every room reserved for their cohort was full. Worth surfacing: it is the
  // number a warden would otherwise have had to place by hand.
  const overflowPlaced = candidates.filter((c) => c.placement_tier === 'overflow').length;

  // ── Advanced filters ──────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [verdict, setVerdict] = useState(ALL);
  const [institution, setInstitution] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [semester, setSemester] = useState(ALL);
  const [roomCat, setRoomCat] = useState(ALL);
  const [messCat, setMessCat] = useState(ALL);
  const [billState, setBillState] = useState(ALL);
  const [gender, setGender] = useState(ALL);
  // The operator no longer picks a block, so let them slice the result by the
  // block the rules are sending each learner to.
  const [targetBlock, setTargetBlock] = useState(ALL);

  // Institution → Program → Semester cascade. The block can serve several
  // institutions (hostel_block_institutions); picking one narrows the program
  // list to that institution's cohort, and picking a program narrows semesters.
  const institutionOpts = useMemo(
    () => distinct(candidates, (c) => c.institution_name),
    [candidates]
  );
  const programOpts = useMemo(
    () =>
      distinct(
        candidates.filter((c) => institution === ALL || c.institution_name === institution),
        (c) => c.program_name
      ),
    [candidates, institution]
  );
  const semesterOpts = useMemo(
    () =>
      distinct(
        candidates.filter(
          (c) =>
            (institution === ALL || c.institution_name === institution) &&
            (program === ALL || c.program_name === program)
        ),
        (c) => c.semester_name
      ),
    [candidates, institution, program]
  );
  const roomCatOpts = useMemo(
    () => distinct(candidates, (c) => c.resolved_room_category_name),
    [candidates]
  );
  const messCatOpts = useMemo(
    () => distinct(candidates, (c) => c.resolved_mess_category_name),
    [candidates]
  );
  const genderOpts = useMemo(() => distinct(candidates, (c) => c.gender), [candidates]);
  const targetBlockOpts = useMemo(
    () => distinct(candidates, (c) => c.target_block_name),
    [candidates]
  );
  const billStateOpts = useMemo(
    () => distinct(candidates, (c) => c.bill_state) as BillState[],
    [candidates]
  );

  // Cascade resets: changing institution clears program+semester; changing
  // program clears semester — so a stale child selection can't hide all rows.
  const onInstitutionChange = (v: string) => {
    setInstitution(v);
    setProgram(ALL);
    setSemester(ALL);
  };
  const onProgramChange = (v: string) => {
    setProgram(v);
    setSemester(ALL);
  };

  const filtersActive =
    !!search ||
    [verdict, institution, program, semester, roomCat, messCat, billState, gender, targetBlock].some(
      (v) => v !== ALL
    );

  const resetFilters = () => {
    setSearch('');
    setVerdict(ALL);
    setInstitution(ALL);
    setProgram(ALL);
    setSemester(ALL);
    setRoomCat(ALL);
    setMessCat(ALL);
    setBillState(ALL);
    setGender(ALL);
    setTargetBlock(ALL);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (q) {
        const hay =
          `${c.full_name} ${c.roll_number ?? ''} ${c.email ?? ''} ${c.program_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (verdict !== ALL && c.verdict !== verdict) return false;
      if (institution !== ALL && c.institution_name !== institution) return false;
      if (program !== ALL && c.program_name !== program) return false;
      if (semester !== ALL && c.semester_name !== semester) return false;
      if (roomCat !== ALL && c.resolved_room_category_name !== roomCat) return false;
      if (messCat !== ALL && c.resolved_mess_category_name !== messCat) return false;
      if (billState !== ALL && c.bill_state !== billState) return false;
      if (gender !== ALL && c.gender !== gender) return false;
      if (targetBlock !== ALL && c.target_block_name !== targetBlock) return false;
      return true;
    });
  }, [candidates, search, verdict, institution, program, semester, roomCat, messCat, billState, gender, targetBlock]);

  // ── Export ────────────────────────────────────────────────────────────
  // Human-readable form of whatever is currently narrowing the table. Stamped
  // into both files so an exported subset can't be read as the full cohort.
  const activeFilterLabels = useMemo(() => {
    const out: string[] = [];
    const q = search.trim();
    if (q) out.push(`Search: "${q}"`);
    if (verdict !== ALL) out.push(`Verdict: ${verdict === 'in' ? 'In (eligible)' : 'Out (excluded)'}`);
    if (institution !== ALL) out.push(`Institution: ${institution}`);
    if (program !== ALL) out.push(`Program: ${program}`);
    if (semester !== ALL) out.push(`Semester: ${semester}`);
    if (targetBlock !== ALL) out.push(`Goes to block: ${targetBlock}`);
    if (roomCat !== ALL) out.push(`Room category: ${roomCat}`);
    if (messCat !== ALL) out.push(`Mess category: ${messCat}`);
    if (billState !== ALL) out.push(`Bill status: ${BILL_STATE_LABEL[billState as BillState] ?? billState}`);
    if (gender !== ALL) out.push(`Gender: ${gender}`);
    return out;
  }, [search, verdict, institution, program, semester, targetBlock, roomCat, messCat, billState, gender]);

  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (filtered.length === 0) {
      toast.error('No rows to export — clear the filters and try again.');
      return;
    }
    setExporting(kind);
    try {
      // Dynamic import keeps xlsx + jsPDF out of the Auto-Allocate page bundle.
      const mod = await import('./candidates-export');
      const ctx = {
        hostelType,
        strict,
        allowOverflow,
        scope,
        filters: activeFilterLabels,
        totalCandidates: candidates.length,
        totalEligible: eligible,
        availableBeds,
      };
      if (kind === 'excel') mod.exportCandidatesExcel(filtered, ctx);
      else mod.exportCandidatesPdf(filtered, ctx);
      toast.success(
        `Exported ${filtered.length} row${filtered.length === 1 ? '' : 's'} to ${kind === 'excel' ? 'Excel' : 'PDF'}`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export the preview');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<Users className="h-4 w-4" />} label="Eligible" value={eligible} />
        <Stat icon={<BedDouble className="h-4 w-4" />} label="Available beds" value={availableBeds} />
        <Stat label="Will place" value={willPlace} />
        <Stat label="Excluded" value={excluded} muted />
        <Stat label="Fee resolved" value={feeResolved} muted />
        <Stat label="Via overflow" value={overflowPlaced} muted />
      </div>

      {noFee > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {noFee} of {candidates.length} students have no usable academic fee
          </AlertTitle>
          <AlertDescription>
            Category Eligibility bands are matched against the fee billed for the academic year
            the student was <strong>admitted</strong> in — falling back to their earliest billed
            year if there is no admission-year bill. A student with no academic bill, or whose
            bills for every year total ₹0, resolves no room category and is skipped. Generate
            real academic bills under{' '}
            <Link
              href="/campus-living/residents?tab=generate"
              className="font-medium underline underline-offset-2"
            >
              Campus Living → Residents → Generate
            </Link>{' '}
            for these students, then re-run this preview.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Per-student validation
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Showing {filtered.length} of {candidates.length}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset filters
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={exporting !== null || filtered.length === 0}
                  >
                    {exporting ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Export
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ({filtered.length})
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => runExport('excel')}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runExport('pdf')}>
                    <FileText className="mr-2 h-4 w-4" /> PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Advanced filters — one control per meaningful column */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filters
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, roll no, email or program"
                  className="h-9"
                />
              </div>
              <FilterSelect
                label="Verdict"
                value={verdict}
                onChange={setVerdict}
                allLabel="All verdicts"
                options={[
                  { value: 'in', label: 'In (eligible)' },
                  { value: 'out', label: 'Out (excluded)' },
                ]}
              />
              <FilterSelect
                label="Institution"
                value={institution}
                onChange={onInstitutionChange}
                allLabel="All institutions"
                options={institutionOpts.map((i) => ({ value: i, label: i }))}
              />
              <FilterSelect
                label="Program"
                value={program}
                onChange={onProgramChange}
                allLabel="All programs"
                options={programOpts.map((p) => ({ value: p, label: p }))}
              />
              <FilterSelect
                label="Semester"
                value={semester}
                onChange={setSemester}
                allLabel="All semesters"
                options={semesterOpts.map((s) => ({ value: s, label: s }))}
              />
              <FilterSelect
                label="Goes to block"
                value={targetBlock}
                onChange={setTargetBlock}
                allLabel="All blocks"
                options={targetBlockOpts.map((b) => ({ value: b, label: b }))}
              />
              <FilterSelect
                label="Room category"
                value={roomCat}
                onChange={setRoomCat}
                allLabel="All room categories"
                options={roomCatOpts.map((r) => ({ value: r, label: r }))}
              />
              <FilterSelect
                label="Mess category"
                value={messCat}
                onChange={setMessCat}
                allLabel="All mess categories"
                options={messCatOpts.map((m) => ({ value: m, label: m }))}
              />
              <FilterSelect
                label="Bill status"
                value={billState}
                onChange={setBillState}
                allLabel="All bill states"
                options={billStateOpts.map((b) => ({ value: b, label: BILL_STATE_LABEL[b] }))}
              />
              <FilterSelect
                label="Gender"
                value={gender}
                onChange={setGender}
                allLabel="All genders"
                options={genderOpts.map((g) => ({
                  value: g,
                  label: g.charAt(0).toUpperCase() + g.slice(1),
                }))}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Student</th>
                <th className="px-2">Semester</th>
                <th className="px-2">Admitted</th>
                <th className="px-2 text-center">Fee basis</th>
                <th className="px-2 text-center">Profile</th>
                <th className="px-2 text-center">Gender</th>
                <th className="px-2 text-center">Not alloc.</th>
                <th className="px-2 text-center">Phys. access</th>
                <th className="px-2">Goes to</th>
                <th className="px-2">Room cat.</th>
                <th className="px-2">Mess cat.</th>
                <th className="px-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const prereqFail = c.stage === 'prerequisite';
                return (
                  <tr key={c.learner_id} className="border-b align-middle last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{c.full_name}</div>
                      {/* Names collide and get re-typed across bulk uploads — the roll
                          number is the key a warden reconciles this preview against. */}
                      <div className="font-mono text-xs text-foreground/70">
                        {c.roll_number ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.program_name ?? '—'}</div>
                      {c.institution_name && (
                        <div className="text-xs text-muted-foreground/80">{c.institution_name}</div>
                      )}
                    </td>
                    <td className="px-2">
                      {c.semester_name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2">
                      {c.admission_academic_year_name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 text-center">
                      <BillBadge c={c} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.has_profile} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.gender_ok} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.not_allocated} na={prereqFail} />
                    </td>
                    <td className="px-2 text-center">
                      <YesNo ok={c.physical_rule_ok} na={prereqFail} />
                    </td>
                    <td className="px-2 text-xs">
                      {c.target_block_name ? (
                        <div className="flex flex-col gap-0.5">
                          <span>{c.target_block_name}</span>
                          {c.placement_tier === 'overflow' && (
                            <span
                              className="w-fit rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800"
                              title="Every room reserved for this cohort was full — placed in an unreserved room of the same category"
                            >
                              overflow
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 text-xs">{c.resolved_room_category_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 text-xs">{c.resolved_mess_category_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2">
                      {c.verdict === 'in' ? (
                        <Badge className="bg-green-600 hover:bg-green-600">In</Badge>
                      ) : (
                        <span className="text-xs text-red-600">{c.exclusion_reason}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-6 text-center text-sm text-muted-foreground">
                    {candidates.length === 0
                      ? 'No candidates found for this block.'
                      : 'No students match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
