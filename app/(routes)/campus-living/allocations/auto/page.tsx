'use client';

import { useState } from 'react';
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
import { usePermissions } from '@/hooks/use-permissions';
import { CandidateValidationTable } from './_components/candidate-validation-table';
import type { AllocationCandidate } from '@/types/allocation-batch';
import {
  useAutoBlocks,
  useHostelYears,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import { AllocationBatchService } from '@/lib/services/campus-living/allocation-batch-service';

export const navMeta = { invokedFrom: '/campus-living/allocations' } as const;

export default function AutoAllocatePage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const { blocks } = useAutoBlocks();

  const [genderType, setGenderType] = useState('');
  const [blockId, setBlockId] = useState('');
  const [yearId, setYearId] = useState('');
  // Strict physical rules: only allocate cohorts that match a physical-room rule (default
  // on). Physical condition first, then category. Off = today's fail-open catch-all.
  const [strict, setStrict] = useState(true);
  const { years } = useHostelYears();

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
        AllocationBatchService.previewCandidates(blockId, strict),
        AllocationBatchService.preview(blockId),
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
        // One proposed batch per block of the selected gender.
        let made = 0;
        for (const b of typedBlocks) {
          await generate(b.id, yearId, strict);
          made += 1;
        }
        toast.success(`Generated a proposed batch for ${made} block${made === 1 ? '' : 's'} — awaiting warden approval`);
        router.push('/campus-living/allocations/batches');
      } else {
        const batchId = await generate(blockId, yearId, strict);
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
            <CardDescription>Type, block, and hostel year</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={genderType} onValueChange={(v) => { setGenderType(v); setBlockId(''); setCandidates(null); }}>
                <SelectTrigger><SelectValue placeholder="Boys / Girls" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boys">Boys</SelectItem>
                  <SelectItem value="girls">Girls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={blockId} onValueChange={(v) => { setBlockId(v); setCandidates(null); }} disabled={!genderType}>
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
