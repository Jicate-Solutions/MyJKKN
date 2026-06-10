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
import { Check, X, Minus, Users, BedDouble, AlertTriangle, Filter, RotateCcw } from 'lucide-react';
import type { AllocationCandidate, BillState } from '@/types/allocation-batch';

const BILL_STATE_LABEL: Record<BillState, string> = {
  matched: 'Matched',
  different_year: 'Different year',
  untagged: 'Untagged',
  none: 'None',
};

function BillBadge({ c }: { c: AllocationCandidate }) {
  const fee =
    c.current_year_fee != null ? ` (₹${Number(c.current_year_fee).toLocaleString('en-IN')})` : '';
  const map: Record<BillState, { label: string; cls: string }> = {
    matched: { label: `Matched${fee}`, cls: 'bg-green-100 text-green-800' },
    different_year: {
      label: `Diff. year${c.bill_other_year_name ? ` (${c.bill_other_year_name})` : ''}`,
      cls: 'bg-amber-100 text-amber-800',
    },
    untagged: { label: 'Untagged', cls: 'bg-amber-100 text-amber-800' },
    none: { label: 'None', cls: 'bg-red-100 text-red-700' },
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
}: {
  candidates: AllocationCandidate[];
  availableBeds: number;
}) {
  // Summary stats reflect the FULL candidate set (filters only narrow the table).
  const eligible = candidates.filter((c) => c.verdict === 'in').length;
  const excluded = candidates.length - eligible;
  const billReady = candidates.filter((c) => c.current_year_bill_count > 0).length;
  const willPlace = Math.min(eligible, availableBeds);

  // ── Advanced filters ──────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [verdict, setVerdict] = useState(ALL);
  const [semester, setSemester] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [roomCat, setRoomCat] = useState(ALL);
  const [messCat, setMessCat] = useState(ALL);
  const [billState, setBillState] = useState(ALL);
  const [gender, setGender] = useState(ALL);

  const semesterOpts = useMemo(() => distinct(candidates, (c) => c.semester_name), [candidates]);
  const programOpts = useMemo(() => distinct(candidates, (c) => c.program_name), [candidates]);
  const roomCatOpts = useMemo(
    () => distinct(candidates, (c) => c.resolved_room_category_name),
    [candidates]
  );
  const messCatOpts = useMemo(
    () => distinct(candidates, (c) => c.resolved_mess_category_name),
    [candidates]
  );
  const genderOpts = useMemo(() => distinct(candidates, (c) => c.gender), [candidates]);
  const billStateOpts = useMemo(
    () => distinct(candidates, (c) => c.bill_state) as BillState[],
    [candidates]
  );

  const filtersActive =
    !!search ||
    [verdict, semester, program, roomCat, messCat, billState, gender].some((v) => v !== ALL);

  const resetFilters = () => {
    setSearch('');
    setVerdict(ALL);
    setSemester(ALL);
    setProgram(ALL);
    setRoomCat(ALL);
    setMessCat(ALL);
    setBillState(ALL);
    setGender(ALL);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (q) {
        const hay = `${c.full_name} ${c.email ?? ''} ${c.program_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (verdict !== ALL && c.verdict !== verdict) return false;
      if (semester !== ALL && c.semester_name !== semester) return false;
      if (program !== ALL && c.program_name !== program) return false;
      if (roomCat !== ALL && c.resolved_room_category_name !== roomCat) return false;
      if (messCat !== ALL && c.resolved_mess_category_name !== messCat) return false;
      if (billState !== ALL && c.bill_state !== billState) return false;
      if (gender !== ALL && c.gender !== gender) return false;
      return true;
    });
  }, [candidates, search, verdict, semester, program, roomCat, messCat, billState, gender]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat icon={<Users className="h-4 w-4" />} label="Eligible" value={eligible} />
        <Stat icon={<BedDouble className="h-4 w-4" />} label="Available beds" value={availableBeds} />
        <Stat label="Will place" value={willPlace} />
        <Stat label="Excluded" value={excluded} muted />
        <Stat label="Bill-ready" value={billReady} muted />
      </div>

      {candidates.length > 0 && billReady === 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No hosteller has a current-year bill tagged</AlertTitle>
          <AlertDescription>
            Category Eligibility rules that depend on a current-year academic fee will not
            resolve a category for any student — those students will be skipped. Generate
            current-academic-year bills under{' '}
            <Link
              href="/campus-living/residents?tab=generate"
              className="font-medium underline underline-offset-2"
            >
              Campus Living → Residents → Generate
            </Link>{' '}
            for these students first.
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
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset filters
              </Button>
            )}
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
                  placeholder="Name, email or program"
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
                label="Semester"
                value={semester}
                onChange={setSemester}
                allLabel="All semesters"
                options={semesterOpts.map((s) => ({ value: s, label: s }))}
              />
              <FilterSelect
                label="Program"
                value={program}
                onChange={setProgram}
                allLabel="All programs"
                options={programOpts.map((p) => ({ value: p, label: p }))}
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
                <th className="px-2">Acad. year</th>
                <th className="px-2 text-center">Bill (curr. yr)</th>
                <th className="px-2 text-center">Profile</th>
                <th className="px-2 text-center">Gender</th>
                <th className="px-2 text-center">Not alloc.</th>
                <th className="px-2 text-center">Phys. access</th>
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
                      <div className="text-xs text-muted-foreground">{c.program_name ?? '—'}</div>
                    </td>
                    <td className="px-2">
                      {c.semester_name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2">
                      {c.academic_year_id ? (
                        c.academic_year_name ?? '—'
                      ) : (
                        <span className="text-red-600">Not set</span>
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
                  <td colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
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
