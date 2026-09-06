'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { campaignKeys } from '@/hooks/admission/use-campaigns';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCampaign,
  useUpdateCampaign,
} from '@/hooks/admission/use-campaigns';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useAdmissionYears } from '@/hooks/use-admission-years';
import { FALLBACK_LEAD_SOURCE_LABELS } from '@/hooks/admission/use-active-lead-sources';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  CAMPAIGN_CATEGORIES,
  type CampaignCategory,
} from '@/types/admission/campaign';
import type { LeadSource } from '@/types/admission';
import { ArrowLeft, Lock } from 'lucide-react';

export default function CampaignEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: campaign } = useCampaign(id);
  const update = useUpdateCampaign(id);

  // Force-refresh on mount so we get the freshest joined data
  // (institution / program / admission_year). useCampaign has a 30s
  // staleTime, so navigating from the detail page right after a
  // service-shape upgrade would otherwise serve the pre-join cache.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CampaignCategory>('admission');
  const [programId, setProgramId] = useState('');
  const [admissionYearId, setAdmissionYearId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [budget, setBudget] = useState('');
  const [targetLeads, setTargetLeads] = useState('');
  const [targetEnrolled, setTargetEnrolled] = useState('');

  // Hydrate state from the loaded campaign once.
  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? '');
      setCategory(campaign.category);
      setProgramId(campaign.program_id ?? '');
      setAdmissionYearId(campaign.admission_year_id ?? '');
      setStartsAt(campaign.starts_at?.slice(0, 10) ?? '');
      setEndsAt(campaign.ends_at?.slice(0, 10) ?? '');
      setBudget(campaign.budget_inr?.toString() ?? '');
      setTargetLeads(campaign.target_leads?.toString() ?? '');
      setTargetEnrolled(campaign.target_enrolled?.toString() ?? '');
    }
  }, [campaign]);

  const isGlobal = campaign?.scope === 'global';
  const showAdmissionFields = category === 'admission';

  const { data: programsData } = usePrograms({
    institution_id:
      !isGlobal && campaign?.institution_id
        ? campaign.institution_id
        : undefined,
    isActive: true,
    limit: 200,
  });
  const programsFromList = programsData?.data ?? [];

  // Belt-and-braces: fetch the campaign's currently-set program by ID
  // directly. The nested embed on CampaignService.get() should populate
  // campaign.program, but RLS on the programs table can silently null
  // a nested-embed even when a direct select succeeds — so we do both
  // and take whichever returns a row first.
  const { data: campaignProgram } = useQuery({
    queryKey: ['campaign-edit-program', campaign?.program_id],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('programs')
        .select('id, program_name, display_name')
        .eq('id', campaign!.program_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!campaign?.program_id,
    staleTime: 60_000,
  });

  // Merge the campaign's CURRENTLY-set program into the list — it may
  // have become inactive since the campaign was created (so the active-
  // only fetch above would miss it), or paginated out. Without this
  // merge the Select renders an empty trigger even though programId is
  // populated, making the user think the fetch failed.
  //
  // Source of truth for the "current" program is whichever resolves
  // first: the joined campaign.program (via service get()), or the
  // direct campaignProgram query above. Either yields {id, program_name,
  // display_name}.
  const currentProgram = campaign?.program ?? campaignProgram ?? null;
  const programs = useMemo(() => {
    if (
      !currentProgram ||
      programsFromList.some((p: any) => p.id === currentProgram.id)
    ) {
      return programsFromList;
    }
    return [currentProgram, ...programsFromList];
  }, [programsFromList, currentProgram]);

  const { admissionYears: yearsFromList, loading: yearsLoading } =
    useAdmissionYears(
      !isGlobal ? campaign?.institution_id ?? null : null,
    );

  // Same belt-and-braces approach for admission_year.
  const { data: campaignAdmissionYear } = useQuery({
    queryKey: [
      'campaign-edit-admission-year',
      campaign?.admission_year_id,
    ],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('admission_years')
        .select('id, admission_year_name, year, is_active')
        .eq('id', campaign!.admission_year_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!campaign?.admission_year_id,
    staleTime: 60_000,
  });

  // Same merge for admission years — useAdmissionYears filters to
  // is_active=true, so an archived year that's still on the campaign
  // would never appear without this.
  const currentAdmissionYear =
    campaign?.admission_year ?? campaignAdmissionYear ?? null;
  const admissionYears = useMemo(() => {
    if (
      !currentAdmissionYear ||
      yearsFromList.some((y) => y.id === currentAdmissionYear.id)
    ) {
      return yearsFromList;
    }
    return [
      {
        id: currentAdmissionYear.id,
        admission_year_name: currentAdmissionYear.admission_year_name,
        year: (currentAdmissionYear as any).year ?? 0,
        is_active: (currentAdmissionYear as any).is_active ?? true,
      },
      ...yearsFromList,
    ];
  }, [yearsFromList, currentAdmissionYear]);

  useEffect(() => {
    if (category !== 'admission') {
      setProgramId('');
      setAdmissionYearId('');
    }
  }, [category]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (update.isPending) return;
    try {
      await update.mutateAsync({
        name,
        description: description || null,
        category,
        program_id:
          showAdmissionFields && programId ? programId : null,
        admission_year_id:
          showAdmissionFields && admissionYearId
            ? admissionYearId
            : null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        budget_inr: budget ? parseFloat(budget) : null,
        target_leads: targetLeads ? parseInt(targetLeads, 10) : null,
        target_enrolled: targetEnrolled
          ? parseInt(targetEnrolled, 10)
          : null,
      });
      toast.success('Campaign updated');
      router.push(`/admission/marketing/campaigns/${id}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update campaign');
    }
  }

  if (!campaign) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const sourceLabel =
    FALLBACK_LEAD_SOURCE_LABELS[campaign.source as LeadSource] ??
    campaign.source;

  return (
    <PermissionGuard module="admission.marketing" action="edit">
      <div className="mx-auto space-y-4 p-6">
        <Link
          href={`/admission/marketing/campaigns/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to {campaign.name}
        </Link>

        <form onSubmit={handleSave} className="space-y-6">
          {/* ─── Read-only identifiers (immutable for attribution safety) ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Immutable settings
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                These are locked after creation. Existing leads, links,
                and analytics are tied to them — create a new campaign
                if you need different values.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="flex items-center gap-1 text-xs">
                  <Lock className="size-3" /> Scope
                </Label>
                <Input
                  value={
                    campaign.scope === 'global'
                      ? '🌐 Global'
                      : 'Institution'
                  }
                  disabled
                />
              </div>
              <div>
                <Label className="flex items-center gap-1 text-xs">
                  <Lock className="size-3" /> Institution
                </Label>
                <Input
                  value={
                    campaign.scope === 'global'
                      ? 'All institutions'
                      : campaign.institution?.name ?? '—'
                  }
                  disabled
                  className="truncate"
                />
              </div>
              <div>
                <Label className="flex items-center gap-1 text-xs">
                  <Lock className="size-3" /> Source
                </Label>
                <Input value={sourceLabel} disabled />
              </div>
            </CardContent>
          </Card>

          {/* ─── Editable: basics ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div>
                <Label>Category *</Label>
                <Select
                  value={category}
                  onValueChange={(v) =>
                    setCategory(v as CampaignCategory)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {category !== 'admission' &&
                  (campaign.program_id ||
                    campaign.admission_year_id) && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      Saving will clear the existing Program and
                      Admission Year (only valid for the Admission
                      category).
                    </p>
                  )}
              </div>

              {showAdmissionFields && (
                <div className="grid grid-cols-1 gap-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3 sm:grid-cols-2">
                  <div className="-mb-1 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Optional — leave blank for a multi-program
                      admission campaign.
                    </p>
                  </div>
                  <div>
                    <Label>Program</Label>
                    {/* key={programId} forces a remount whenever the
                        selected value changes — this dodges Radix
                        Select's first-render race where the trigger
                        label stays stuck on the placeholder when the
                        matching <SelectItem> wasn't mounted at the time
                        Radix evaluated its initial value. */}
                    <Select
                      key={`program-${programId || 'empty'}`}
                      value={programId}
                      onValueChange={setProgramId}
                      disabled={isGlobal}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            isGlobal
                              ? 'Not available for global'
                              : 'Pick a program (optional)'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {programs.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.display_name ?? p.program_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Admission Year</Label>
                    <Select
                      key={`year-${admissionYearId || 'empty'}`}
                      value={admissionYearId}
                      onValueChange={setAdmissionYearId}
                      disabled={isGlobal || yearsLoading}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            yearsLoading
                              ? 'Loading…'
                              : admissionYears.length === 0
                                ? 'No active years'
                                : 'Pick a year (optional)'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {admissionYears.map((y) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.admission_year_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Editable: schedule + budget/goals ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Schedule, budget &amp; goals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Budget (INR)</Label>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Target leads</Label>
                  <Input
                    type="number"
                    value={targetLeads}
                    onChange={(e) => setTargetLeads(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Target enrolled</Label>
                  <Input
                    type="number"
                    value={targetEnrolled}
                    onChange={(e) => setTargetEnrolled(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || !name}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </PermissionGuard>
  );
}
