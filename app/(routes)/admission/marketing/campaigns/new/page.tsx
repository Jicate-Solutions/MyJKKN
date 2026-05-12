'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
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
  useCreateCampaign,
  useCreateCampaignLink,
} from '@/hooks/admission/use-campaigns';
import { useCampaignableForms } from '@/hooks/admission/use-campaignable-forms';
import { useAuth } from '@/hooks/use-auth';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useActiveLeadSources,
  FALLBACK_LEAD_SOURCE_LABELS,
} from '@/hooks/admission/use-active-lead-sources';
import { PermissionGuard } from '@/components/auth/permission-guard';
import type { LeadSource } from '@/types/admission';

// Sentinel value used inside the institution <Select> to represent the
// "All Institutions (Global)" option. Picked because Radix Select rejects
// empty-string values, and a real UUID would collide with an institution.
const GLOBAL_SCOPE_VALUE = '__global__';

export default function NewCampaignWizard() {
  const router = useRouter();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(
    null,
  );

  const [institutionId, setInstitutionId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<LeadSource>('whatsapp');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [budget, setBudget] = useState('');
  const [targetLeads, setTargetLeads] = useState('');
  const [targetEnrolled, setTargetEnrolled] = useState('');
  const [formId, setFormId] = useState('');
  const [linkName, setLinkName] = useState('');

  const { institutions, loading: instLoading } = useInstitutionsWithAccess({
    isActive: true,
  });
  const { isSuperAdmin } = usePermissions();

  // Admin-curated source catalog. Falls back to the built-in label table
  // if the master is empty or RLS hides everything from this user — that
  // way the dropdown always has at least the 14 enum values present.
  const { options: sourceOptions, isLoading: sourcesLoading } =
    useActiveLeadSources();
  const displaySources = useMemo<Array<{ value: LeadSource; label: string }>>(
    () => {
      if (sourceOptions.length > 0) {
        return sourceOptions.map((o) => ({
          value: o.value as LeadSource,
          label: o.label,
        }));
      }
      return (Object.keys(FALLBACK_LEAD_SOURCE_LABELS) as LeadSource[]).map(
        (v) => ({ value: v, label: FALLBACK_LEAD_SOURCE_LABELS[v] }),
      );
    },
    [sourceOptions],
  );

  // Default to user's own institution when present; otherwise leave empty
  // so super_admin / admission_global_user must pick one explicitly.
  // For super_admin we deliberately do NOT auto-pick "global" — make it an
  // explicit, conscious choice.
  useEffect(() => {
    if (!institutionId) {
      if (profile?.institution_id) {
        setInstitutionId(profile.institution_id);
      } else if (institutions.length === 1) {
        setInstitutionId(institutions[0].id);
      }
    }
  }, [profile?.institution_id, institutions, institutionId]);

  const isGlobal = institutionId === GLOBAL_SCOPE_VALUE;

  const { data: forms } = useCampaignableForms(source);
  const createCampaign = useCreateCampaign();
  // Hook is scoped to a campaign id — we'll re-init via state once the
  // campaign is created. For the wizard's single-shot use, we use direct
  // service call instead of swapping hooks at runtime.
  const linkScope = createdCampaignId ?? '';
  const createLink = useCreateCampaignLink(linkScope);

  async function handleFinish() {
    if (!institutionId) {
      toast.error('Pick an institution before finishing the wizard.');
      setStep(1);
      return;
    }
    if (isGlobal && !isSuperAdmin) {
      toast.error('Only super admins can create a cross-institution (global) campaign.');
      return;
    }
    const campaign = await createCampaign.mutateAsync({
      institution_id: isGlobal ? null : institutionId,
      scope: isGlobal ? 'global' : 'institution',
      name,
      description: description || undefined,
      source,
      starts_at: startsAt || undefined,
      ends_at: endsAt || undefined,
      budget_inr: budget ? parseFloat(budget) : undefined,
      target_leads: targetLeads ? parseInt(targetLeads, 10) : undefined,
      target_enrolled: targetEnrolled
        ? parseInt(targetEnrolled, 10)
        : undefined,
    });
    setCreatedCampaignId(campaign.id);

    if (formId && linkName) {
      // Mount hook scope to new id by re-rendering before mutate. The
      // existing hook above was scoped to '' for the initial pass; we
      // call the service directly to avoid a rerender wait.
      const { CampaignService } = await import(
        '@/lib/services/admission/campaign-service'
      );
      const link = await CampaignService.createLink(campaign.id, {
        form_id: formId,
        name: linkName,
      });
      if (link?.token && typeof window !== 'undefined') {
        try {
          await navigator.clipboard.writeText(
            `${window.location.origin}/c/${link.token}`,
          );
        } catch {
          /* clipboard may be blocked — non-fatal */
        }
      }
    }

    router.push(`/admission/marketing/campaigns/${campaign.id}`);
  }

  // Silence unused-var warning for createLink (kept for future inline use).
  void createLink;

  const step1Valid = !!(name && source && institutionId);
  const step3Valid = !formId || (formId && linkName);

  return (
    <PermissionGuard module="admission.campaigns" action="create">
      <div className="mx-auto space-y-6 p-6">
        <h1 className="text-2xl font-semibold">
          New Campaign · Step {step} of 3
        </h1>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Institution *</Label>
                <Select
                  value={institutionId}
                  onValueChange={setInstitutionId}
                  disabled={instLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        instLoading ? 'Loading…' : 'Pick an institution'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin && (
                      <SelectItem value={GLOBAL_SCOPE_VALUE}>
                        🌐 All Institutions (Global)
                      </SelectItem>
                    )}
                    {institutions.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isGlobal && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    This campaign attributes leads across every institution.
                    Each share link still points at one form, and the lead
                    inherits the form&apos;s institution at capture time.
                  </p>
                )}
                {!instLoading && institutions.length === 0 && !isSuperAdmin && (
                  <p className="mt-1 text-xs text-destructive">
                    You don&apos;t have access to any institutions.
                  </p>
                )}
              </div>
              <div>
                <Label>Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Diwali 2026 WhatsApp Push"
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
                <Label>Source *</Label>
                <Select
                  value={source}
                  onValueChange={(v) => setSource(v as LeadSource)}
                  disabled={sourcesLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        sourcesLoading ? 'Loading…' : 'Pick a source'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {displaySources.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Budget &amp; Goals (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Budget (INR)</Label>
                <Input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>First share link (optional, recommended)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>
                  Form (only forms with source={source} shown)
                </Label>
                <Select value={formId} onValueChange={setFormId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a form" />
                  </SelectTrigger>
                  <SelectContent>
                    {(forms ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Link name</Label>
                <Input
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="e.g. Facebook creative A"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A short URL like <code>/c/&#123;token&#125;</code> will be
                generated and copied to your clipboard.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <div className="space-x-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 3 && (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !step1Valid}
              >
                Next
              </Button>
            )}
            {step === 3 && (
              <Button
                onClick={handleFinish}
                disabled={!step3Valid || createCampaign.isPending}
              >
                {createCampaign.isPending
                  ? 'Creating…'
                  : 'Finish & Activate'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}
