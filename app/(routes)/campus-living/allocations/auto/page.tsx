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
import Link from 'next/link';
import { Loader2, Wand2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/use-permissions';
import { Switch } from '@/components/ui/switch';
import { CandidateValidationTable } from './_components/candidate-validation-table';
import type { AllocationCandidate } from '@/types/allocation-batch';
import {
  useAutoCategories,
  useAutoBlocks,
  useHostelYears,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import { useBlockHasEligibilityRules } from '@/hooks/campus-living/use-room-eligibility';
import { AllocationBatchService } from '@/lib/services/campus-living/allocation-batch-service';

export const navMeta = { invokedFrom: '/campus-living/allocations' } as const;

export default function AutoAllocatePage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const { categories } = useAutoCategories();
  const { blocks } = useAutoBlocks();

  const [genderType, setGenderType] = useState('');
  const [blockId, setBlockId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [yearId, setYearId] = useState('');
  const { years } = useHostelYears();

  // Block + category are per-gender — pick a type first to narrow both.
  const typedBlocks = genderType ? blocks.filter((b) => b.type === genderType) : [];
  const typedCategories = genderType
    ? categories.filter((c) => c.type === genderType)
    : [];

  const [candidates, setCandidates] = useState<AllocationCandidate[] | null>(null);
  const [availableBeds, setAvailableBeds] = useState(0);
  const [requireBill, setRequireBill] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { generate } = useAllocationBatchActions();

  // Auto-allocation is rule-driven: a block with no active physical-room rule
  // cannot be auto-allocated. Guard the UI (the RPC enforces it server-side too).
  const { hasRules, loading: rulesLoading } = useBlockHasEligibilityRules(blockId || null);
  const blockMissingRules = !!blockId && !rulesLoading && !hasRules;

  const canGenerate = isSuperAdmin || can('campus_living.allocations.create');

  const runPreview = async () => {
    if (!blockId || !categoryId || blockMissingRules) return;
    setPreviewing(true);
    setCandidates(null);
    try {
      const [cands, agg] = await Promise.all([
        AllocationBatchService.previewCandidates(blockId, categoryId, requireBill),
        AllocationBatchService.preview(blockId, categoryId),
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
    if (!blockId || !categoryId || !yearId || blockMissingRules) return;
    setGenerating(true);
    try {
      const batchId = await generate(blockId, categoryId, yearId, requireBill);
      toast.success('Proposed allocation generated — awaiting warden approval');
      router.push(`/campus-living/allocations/batches/${batchId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ContentLayout title="Auto-Allocate">
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
          <h1 className="text-2xl font-bold py-1">Auto-Allocate (Classic)</h1>
          <p className="text-sm text-muted-foreground">
            Fills the selected block&apos;s eligible rooms with unallocated hostelites in
            alphabetical order. Students are chosen by their <strong>fee-aware eligibility</strong>{' '}
            for the selected category — falling back to their saved category when no rule
            applies — and institution / room access come from the block and its physical-room
            rules. The result is a proposed batch a warden approves before it&apos;s committed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selection</CardTitle>
            <CardDescription>Type, block, category, and hostel year</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={genderType} onValueChange={(v) => { setGenderType(v); setBlockId(''); setCategoryId(''); setCandidates(null); }}>
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
                  {typedBlocks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setCandidates(null); }} disabled={!genderType}>
                <SelectTrigger><SelectValue placeholder={genderType ? 'Auto category' : 'Pick a type first'} /></SelectTrigger>
                <SelectContent>
                  {typedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-3">
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

        {blockMissingRules && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No physical-room rules set for this block</AlertTitle>
            <AlertDescription>
              Auto-allocation is rule-driven — it only fills rooms reserved by a
              physical-room rule. Set rules for this block first under{' '}
              <Link
                href="/campus-living/settings/program-eligibility"
                className="font-medium underline underline-offset-2"
              >
                Program Eligibility → Physical Rooms
              </Link>
              , then come back to auto-allocate.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Switch
            id="require-bill"
            checked={requireBill}
            onCheckedChange={(v) => {
              setRequireBill(v);
              setCandidates(null);
            }}
          />
          <Label htmlFor="require-bill">
            Require current-year bill
            <span className="ml-1 text-xs text-muted-foreground">
              (academic year + matching bill are mandatory)
            </span>
          </Label>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={runPreview}
            disabled={!blockId || !categoryId || previewing || rulesLoading || blockMissingRules}
          >
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview
          </Button>
          {canGenerate && (
            <Button
              onClick={runGenerate}
              disabled={!blockId || !categoryId || !yearId || generating || rulesLoading || blockMissingRules}
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
