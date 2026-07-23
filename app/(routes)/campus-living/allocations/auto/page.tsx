'use client';

import { useState, useEffect } from 'react';
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

const ALL_BLOCKS = '__all_blocks__';
const ALL_FLOORS = '__all_floors__';
const floorLabel = (f: number) => (f === 0 ? 'Ground floor' : `Floor ${f}`);
import { usePermissions } from '@/hooks/use-permissions';
import { CandidateValidationTable } from './_components/candidate-validation-table';
import type { AllocationCandidate } from '@/types/allocation-batch';
import {
  useAutoBlocks,
  useBlockFloors,
  useBlockInstitutions,
  useHostelYears,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import { AllocationBatchService } from '@/lib/services/campus-living/allocation-batch-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';

export const navMeta = { invokedFrom: '/campus-living/allocations' } as const;

export default function AutoAllocatePage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const { blocks } = useAutoBlocks();

  const [genderType, setGenderType] = useState('');
  const [blockId, setBlockId] = useState('');
  const [floor, setFloor] = useState(ALL_FLOORS);
  const [yearId, setYearId] = useState('');
  // Strict physical rules: only allocate cohorts that match a physical-room rule (default
  // on). Physical condition first, then category. Off = today's fail-open catch-all.
  const [strict, setStrict] = useState(true);
  const { years } = useHostelYears();

  // Floors of the chosen block (single-block only — floor is ambiguous across "All blocks").
  const { floors } = useBlockFloors(blockId && blockId !== ALL_BLOCKS ? blockId : '');
  const floorParam = floor === ALL_FLOORS ? null : Number(floor);

  // ── Cohort filters (which learners get placed). Single-block only, like the
  // floor scope — the institution/program lists are per-block-ambiguous across
  // "All blocks". Cascade: institution → program → semester. Blank = no filter.
  const isSpecificBlock = !!blockId && blockId !== ALL_BLOCKS;
  const [institutionId, setInstitutionId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const { institutions: blockInstitutions } = useBlockInstitutions(isSpecificBlock ? blockId : '');
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

  // Only applied for a specific block; null = no filter.
  const instParam = isSpecificBlock && institutionId ? institutionId : null;
  const progParam = isSpecificBlock && programId ? programId : null;
  const semParam = isSpecificBlock && semesterId ? semesterId : null;

  // Block list is per-gender — pick a type first to narrow it.
  const typedBlocks = genderType ? blocks.filter((b) => b.type === genderType) : [];

  const [candidates, setCandidates] = useState<AllocationCandidate[] | null>(null);
  const [availableBeds, setAvailableBeds] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { generate } = useAllocationBatchActions();

  const canGenerate = isSuperAdmin || can('campus_living.allocations.create');

  const runPreview = async () => {
    // Preview is per-block (the candidate table is one block's cohort).
    if (!blockId || blockId === ALL_BLOCKS) return;
    setPreviewing(true);
    setCandidates(null);
    try {
      const [cands, agg] = await Promise.all([
        AllocationBatchService.previewCandidates(blockId, strict, floorParam, instParam, progParam, semParam),
        AllocationBatchService.preview(blockId, floorParam),
      ]);
      setCandidates(cands);
      setAvailableBeds(agg.available_beds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to preview');
    } finally {
      setPreviewing(false);
    }
  };

  const runGenerate = async () => {
    if (!blockId || !yearId) return;
    setGenerating(true);
    try {
      if (blockId === ALL_BLOCKS) {
        // One proposed batch per block of the selected gender. Floor scope is single-block
        // only, so "All blocks" always runs across all floors (floorParam is null here).
        let made = 0;
        for (const b of typedBlocks) {
          await generate(b.id, yearId, strict, null);
          made += 1;
        }
        toast.success(`Generated a proposed batch for ${made} block${made === 1 ? '' : 's'} — awaiting warden approval`);
        router.push('/campus-living/allocations/batches');
      } else {
        const batchId = await generate(blockId, yearId, strict, floorParam, instParam, progParam, semParam);
        toast.success('Proposed allocation generated — awaiting warden approval');
        router.push(`/campus-living/allocations/batches/${batchId}`);
      }
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
            Fills the block&apos;s eligible rooms with unallocated hostelites, placing each into
            the room category the Category Eligibility rules resolve for them (and assigning their
            mess category). Rooms reserved by a physical-room rule go to that rule&apos;s cohort;
            rooms with no rule are open to any eligible student of the block&apos;s institutions,
            filled primary-institution first. Students with no rule-resolved category — e.g. no
            current-year bill — are skipped. The result is a proposed batch a warden approves.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selection</CardTitle>
            <CardDescription>
              Type, block, floor, and hostel year. Optionally narrow to a specific
              institution / program / semester (a selected block only) to auto-allocate just those learners.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={genderType} onValueChange={(v) => { setGenderType(v); setBlockId(''); setFloor(ALL_FLOORS); setInstitutionId(''); setProgramId(''); setSemesterId(''); setCandidates(null); }}>
                <SelectTrigger><SelectValue placeholder="Boys / Girls" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boys">Boys</SelectItem>
                  <SelectItem value="girls">Girls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={blockId} onValueChange={(v) => { setBlockId(v); setFloor(ALL_FLOORS); setInstitutionId(''); setProgramId(''); setSemesterId(''); setCandidates(null); }} disabled={!genderType}>
                <SelectTrigger><SelectValue placeholder={genderType ? 'Select block' : 'Pick a type first'} /></SelectTrigger>
                <SelectContent>
                  {typedBlocks.length > 1 && (
                    <SelectItem value={ALL_BLOCKS}>
                      All blocks ({genderType === 'boys' ? 'Boys' : 'Girls'})
                    </SelectItem>
                  )}
                  {typedBlocks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Select
                value={floor}
                onValueChange={(v) => { setFloor(v); setCandidates(null); }}
                disabled={!blockId || blockId === ALL_BLOCKS}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All floors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FLOORS}>All floors</SelectItem>
                  {floors.map((f) => (
                    <SelectItem key={f} value={String(f)}>{floorLabel(f)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Institution</Label>
              <Select
                value={institutionId || 'all'}
                onValueChange={(v) => { setInstitutionId(v === 'all' ? '' : v); setProgramId(''); setSemesterId(''); setCandidates(null); }}
                disabled={!isSpecificBlock}
              >
                <SelectTrigger><SelectValue placeholder="All institutions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {blockInstitutions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Program</Label>
              <Select
                value={programId || 'all'}
                onValueChange={(v) => { setProgramId(v === 'all' ? '' : v); setSemesterId(''); setCandidates(null); }}
                disabled={!isSpecificBlock || !institutionId}
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
                disabled={!isSpecificBlock || !programId}
              >
                <SelectTrigger><SelectValue placeholder={programId ? 'All semesters' : 'Pick a program first'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.semester_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hostel Year</Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger><SelectValue placeholder="Select hostel year" /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
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

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={runPreview}
            disabled={!blockId || blockId === ALL_BLOCKS || previewing}
          >
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview
          </Button>
          {canGenerate && (
            <Button
              onClick={runGenerate}
              disabled={!blockId || !yearId || generating}
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate proposed batch
            </Button>
          )}
        </div>

        {candidates && (
          <CandidateValidationTable candidates={candidates} availableBeds={availableBeds} />
        )}
      </div>
    </ContentLayout>
  );
}
