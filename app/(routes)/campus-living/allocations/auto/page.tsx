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
import { Loader2, Wand2, Users, BedDouble } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useEligibilityInstitutions } from '@/hooks/campus-living/use-program-eligibility';
import {
  useAutoCategories,
  useHostelYears,
  useAllocationBatchActions,
} from '@/hooks/campus-living/use-allocation-batches';
import { AllocationBatchService } from '@/lib/services/campus-living/allocation-batch-service';
import type { AllocatePreview } from '@/types/allocation-batch';

export const navMeta = { invokedFrom: '/campus-living/allocations' } as const;

export default function AutoAllocatePage() {
  const router = useRouter();
  const { can, isSuperAdmin } = usePermissions();
  const { institutions } = useEligibilityInstitutions();
  const { categories } = useAutoCategories();

  const [institutionId, setInstitutionId] = useState('');
  const [genderType, setGenderType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [yearId, setYearId] = useState('');
  const { years } = useHostelYears();

  // Categories are stored per gender (Classic Room boys / girls) — pick a type first.
  const typedCategories = genderType
    ? categories.filter((c) => c.type === genderType)
    : [];

  const [preview, setPreview] = useState<AllocatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { generate } = useAllocationBatchActions();

  const canGenerate = isSuperAdmin || can('campus_living.allocations.create');

  const runPreview = async () => {
    if (!institutionId || !categoryId) return;
    setPreviewing(true);
    setPreview(null);
    try {
      setPreview(await AllocationBatchService.preview(institutionId, categoryId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to preview');
    } finally {
      setPreviewing(false);
    }
  };

  const runGenerate = async () => {
    if (!institutionId || !categoryId || !yearId) return;
    setGenerating(true);
    try {
      const batchId = await generate(institutionId, categoryId, yearId);
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
            Fills the selected auto-category&apos;s eligible rooms with its unallocated
            hostelites in alphabetical order. The result is a proposed batch that a
            warden must approve before it&apos;s committed.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selection</CardTitle>
            <CardDescription>Institution, type, category, and hostel year</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={(v) => { setInstitutionId(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={genderType} onValueChange={(v) => { setGenderType(v); setCategoryId(''); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Boys / Girls" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="boys">Boys</SelectItem>
                  <SelectItem value="girls">Girls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPreview(null); }} disabled={!genderType}>
                <SelectTrigger><SelectValue placeholder={genderType ? 'Auto category' : 'Pick a type first'} /></SelectTrigger>
                <SelectContent>
                  {typedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
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

        <div className="flex gap-3">
          <Button variant="outline" onClick={runPreview} disabled={!institutionId || !categoryId || previewing}>
            {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preview
          </Button>
          {canGenerate && (
            <Button onClick={runGenerate} disabled={!institutionId || !categoryId || !yearId || generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate proposed batch
            </Button>
          )}
        </div>

        {preview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Stat icon={<Users className="h-4 w-4" />} label="Eligible cohort" value={preview.cohort_eligible} />
                <Stat icon={<BedDouble className="h-4 w-4" />} label="Available beds" value={preview.available_beds} />
                <Stat label="No login profile" value={preview.no_profile} muted />
                <Stat label="Already allocated" value={preview.already_allocated} muted />
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Up to {Math.min(preview.cohort_eligible, preview.available_beds)} learners
                will be placed (limited by beds). Eligibility rules + gender are enforced,
                so some may be skipped.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function Stat({ icon, label, value, muted }: { icon?: React.ReactNode; label: string; value: number; muted?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${muted ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
