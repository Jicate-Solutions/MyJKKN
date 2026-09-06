'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { usePermissions } from '@/hooks/use-permissions';
import { CandidateValidationTable } from './_components/candidate-validation-table';
import type { AllocationCandidate } from '@/types/allocation-batch';
import {
  useHostelTypeInstitutions,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import { AllocationBatchService } from '@/lib/services/campus-living/allocation-batch-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';

export const navMeta = { invokedFrom: '/campus-living/allocations' } as const;

export default function AutoAllocatePage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();

  // Block and floor are NOT chosen here. The physical-room rules already decide
  // which block/room a cohort may enter (fn_learner_strictly_eligible_for_room),
  // so the engine sweeps every block of the selected type. Hostel year is not
  // chosen either — the RPC defaults to hostel_years.is_current.
  const [genderType, setGenderType] = useState('');
  // Strict physical rules: only allocate cohorts that match a physical-room rule (default
  // on). Physical condition first, then category. Off = today's fail-open catch-all.
  const [strict, setStrict] = useState(true);
  // Overflow: when every room RESERVED for a learner's cohort in their eligible
  // category is full, fall back to rooms of that SAME category that no rule
  // reserves. Default on — it is the behaviour operators expect, and off
  // reproduces the pre-2026-08-10 engine exactly for comparison.
  const [allowOverflow, setAllowOverflow] = useState(true);

  // ── Cohort filters (which learners get placed).
  // Cascade: institution → program → semester. Blank = no filter.
  const [institutionId, setInstitutionId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const { institutions: typeInstitutions } = useHostelTypeInstitutions(genderType);
  const [programs, setPrograms] = useState<{ id: string; program_name: string }[]>([]);
  const [semesters, setSemesters] = useState<{ id: string; semester_name: string }[]>([]);

  useEffect(() => {
    if (!institutionId) { setPrograms([]); return; }
    ProgramService.getPrograms({ institution_id: institutionId, page: 1, limit: 1000, isActive: true })
      .then((r) => setPrograms((r.data || []) as { id: string; program_name: string }[]))
      .catch(() => setPrograms([]));
  }, [institutionId]);

  useEffect(() => {
    if (!programId) { setSemesters([]); return; }
    SemesterService.getSemestersByProgram(programId)
      .then((r) => setSemesters((r || []) as { id: string; semester_name: string }[]))
      .catch(() => setSemesters([]));
  }, [programId]);

  const instParam = institutionId || null;
  const progParam = programId || null;
  const semParam = semesterId || null;

  const [candidates, setCandidates] = useState<AllocationCandidate[] | null>(null);
  const [availableBeds, setAvailableBeds] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { generate } = useAllocationBatchActions();

  const canGenerate = isSuperAdmin || can('campus_living.allocations.create');

  // Cohort selection in words, for the preview export header. Safe to read from
  // live state: every one of these selects clears `candidates`, so the table
  // (and its export) only exists while the selection still matches the preview.
  const scopeLabels = useMemo(() => {
    const out: string[] = [];
    const inst = typeInstitutions.find((i) => i.id === institutionId)?.name;
    const prog = programs.find((p) => p.id === programId)?.program_name;
    const sem = semesters.find((s) => s.id === semesterId)?.semester_name;
    if (inst) out.push(`Institution: ${inst}`);
    if (prog) out.push(`Program: ${prog}`);
    if (sem) out.push(`Semester: ${sem}`);
    return out;
  }, [typeInstitutions, institutionId, programs, programId, semesters, semesterId]);

  const runPreview = async () => {
    if (!genderType) return;
    setPreviewing(true);
    setCandidates(null);
    try {
      const [cands, agg] = await Promise.all([
        AllocationBatchService.previewCandidates(genderType, strict, instParam, progParam, semParam, allowOverflow),
        AllocationBatchService.preview(genderType, instParam, progParam, semParam),
      ]);
      setCandidates(cands);
      setAvailableBeds(agg.available_beds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to preview');
    } finally {
      setPreviewing(false);
    }
  };

  // One batch spanning every block of the type — the rules place each learner.
  const runGenerate = async () => {
    if (!genderType) return;
    setGenerating(true);
    try {
      // Same allowOverflow the preview ran with — otherwise Generate places a
      // different set than the operator just approved on screen.
      const batchId = await generate(genderType, strict, instParam, progParam, semParam, allowOverflow);
      toast.success('Proposed allocation generated — awaiting warden approval');
      router.push(`/campus-living/allocations/batches/${batchId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ContentLayout title="Auto-Allocate (Rules-Driven)">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Allocations', href: '/campus-living/allocations' },
          { label: 'Auto-Allocate' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Auto-Allocate</h1>
          <p className="text-sm text-muted-foreground">
            Fills the block&apos;s eligible rooms with unallocated <strong>active</strong>{' '}
            hostelites, placing each into the room category the Category Eligibility rules resolve
            for them (and assigning their mess category). Only learners whose status is Active are
            candidates — enquiry, reserved, admitted, account, graduated, inactive and rejected
            learners are never allocated a bed (Residents still lists every status). Rooms reserved
            by a physical-room rule go to that rule&apos;s cohort; rooms with no rule are open to any
            eligible student of the block&apos;s institutions, filled primary-institution first.
            Fee bands are matched against the fee billed for the academic year the student was
            admitted in (falling back to their earliest billed year). Students with no
            rule-resolved category — e.g. no academic bill, or bills totalling ₹0 — are skipped.
            The result is a proposed batch a warden approves.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selection</CardTitle>
            <CardDescription>
              Pick the hostel type, then optionally narrow to an institution / program /
              semester. Block, floor and room are decided by the Physical Rooms rules —
              you don&apos;t choose them here. The batch is stamped with the current hostel year.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={genderType} onValueChange={(v) => { setGenderType(v); setInstitutionId(''); setProgramId(''); setSemesterId(''); setCandidates(null); }}>
                <SelectTrigger><SelectValue placeholder="Boys / Girls" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boys">Boys</SelectItem>
                  <SelectItem value="girls">Girls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Institution</Label>
              <Select
                value={institutionId || 'all'}
                onValueChange={(v) => { setInstitutionId(v === 'all' ? '' : v); setProgramId(''); setSemesterId(''); setCandidates(null); }}
                disabled={!genderType}
              >
                <SelectTrigger><SelectValue placeholder={genderType ? 'All institutions' : 'Pick a type first'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {typeInstitutions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Program</Label>
              <Select
                value={programId || 'all'}
                onValueChange={(v) => { setProgramId(v === 'all' ? '' : v); setSemesterId(''); setCandidates(null); }}
                disabled={!institutionId}
              >
                <SelectTrigger><SelectValue placeholder={institutionId ? 'All programs' : 'Pick an institution first'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All programs</SelectItem>
                  {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Semester</Label>
              <Select
                value={semesterId || 'all'}
                onValueChange={(v) => { setSemesterId(v === 'all' ? '' : v); setCandidates(null); }}
                disabled={!programId}
              >
                <SelectTrigger><SelectValue placeholder={programId ? 'All semesters' : 'Pick a program first'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between rounded-lg border p-3 sm:max-w-xl">
          <div className="space-y-0.5 pr-3">
            <Label className="text-sm">Strict physical rules</Label>
            <p className="text-xs text-muted-foreground">
              Check the physical-room condition first: only allocate cohorts that match a
              physical-room rule. Open (rule-free) rooms are not used as a catch-all, so cohorts
              with no rule (e.g. 3-Year) are skipped. Turn off for the open, fill-everyone mode.
            </p>
          </div>
          <Switch checked={strict} onCheckedChange={(v) => { setStrict(v); setCandidates(null); }} />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3 sm:max-w-xl">
          <div className="space-y-0.5 pr-3">
            <Label className="text-sm">Allow overflow when reserved rooms are full</Label>
            <p className="text-xs text-muted-foreground">
              If every room a physical rule reserves for a learner&apos;s cohort is full, place
              them in a room of the <strong>same category</strong> that no rule reserves. Their
              category is never changed, and a room reserved for another cohort is never used.
              Turn off to reproduce the engine&apos;s previous behaviour exactly.
            </p>
          </div>
          <Switch
            checked={allowOverflow}
            onCheckedChange={(v) => { setAllowOverflow(v); setCandidates(null); }}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={runPreview} disabled={!genderType || previewing}>
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview
          </Button>
          {canGenerate && (
            <Button onClick={runGenerate} disabled={!genderType || generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate proposed batch
            </Button>
          )}
        </div>

        {candidates && (
          <CandidateValidationTable
            candidates={candidates}
            availableBeds={availableBeds}
            hostelType={genderType}
            strict={strict}
            allowOverflow={allowOverflow}
            scope={scopeLabels}
          />
        )}
      </div>
    </ContentLayout>
  );
}
