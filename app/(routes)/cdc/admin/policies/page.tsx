'use client';

// ============================================================
// /cdc/admin/policies — CDC platform_policies editor
// ============================================================
// Shows all 13 cdc.* policy keys grouped by category.
// English-consequence descriptions per each policy.
// Inline edit: booleans toggle, numbers/strings via text input.
// major-classification keys require super_admin.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Settings,
  Save,
  RotateCcw,
  ShieldAlert,
  Info,
  Lock,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useCdcAdmin } from '@/hooks/cdc/use-cdc-admin';
import type { CdcPolicyRow, CdcPolicyCategory, CdcPolicyGroup } from '@/types/admin/cdc';

// ── Category metadata ──────────────────────────────────────────────────────
const CATEGORY_META: Record<CdcPolicyCategory, { label: string; description: string }> = {
  eligibility: {
    label: 'Eligibility defaults',
    description: 'Pre-fill values for CGPA and arrear limits when creating a new drive. Coordinators can override per drive.',
  },
  drive_lifecycle: {
    label: 'Drive lifecycle',
    description: 'Willingness window duration and multi-offer rules that govern how a drive flows through its 7 states.',
  },
  willingness: {
    label: 'Willingness window',
    description: 'How long coordinators have to lock the eligibility list before the system auto-escalates.',
  },
  escalation: {
    label: 'Escalation timers',
    description: 'Deadlines after which the CDC Head is automatically notified of overdue coordinator actions.',
  },
  placement: {
    label: 'Placement rules',
    description: 'Rules controlling how many offers a learner may hold and what counts toward placement statistics.',
  },
  internship: {
    label: 'Internship settings',
    description: 'Weekend counting rules and the attendance threshold required to receive a completion certificate.',
  },
  attachments: {
    label: 'Required attachments',
    description: 'Which upload fields become mandatory at each drive state transition (campus circular, selection list, etc.).',
  },
  export: {
    label: 'NAAC / AICTE exports',
    description: 'Column mappings for accreditation report exports. Update when regulators publish a new template — zero deploys.',
  },
};

// Map each policy_key to its category
const KEY_TO_CATEGORY: Record<string, CdcPolicyCategory> = {
  'cdc.default_min_cgpa': 'eligibility',
  'cdc.default_max_arrears': 'eligibility',
  'cdc.default_willingness_window_hours': 'drive_lifecycle',
  'cdc.allow_multiple_active_offers': 'placement',
  'cdc.coordinator_willingness_approval_deadline_hours': 'willingness',
  'cdc.quarterly_snapshot_enabled': 'drive_lifecycle',
  'cdc.required_attachments_by_state': 'attachments',
  'cdc.default_internship_skip_weekends': 'internship',
  'cdc.min_attendance_pct_for_internship_certificate': 'internship',
  'cdc.parent_consent_required_under_age': 'eligibility',
  'cdc.naac_export_column_mapping': 'export',
  'cdc.aicte_export_column_mapping': 'export',
  'cdc.aicte_include_internal_placements': 'export',
};

// Human-friendly consequence labels per policy
const KEY_CONSEQUENCE: Record<string, string> = {
  'cdc.default_min_cgpa': 'Drives created without a manual CGPA override will pre-fill this value.',
  'cdc.default_max_arrears': 'Drives created without a manual arrear override will pre-fill this value. 0 = zero arrears required.',
  'cdc.default_willingness_window_hours': 'New drives default to this many hours between "Willingness open" and "Eligibility locked". 168 = 7 days.',
  'cdc.allow_multiple_active_offers': 'When ON, a learner may hold multiple simultaneous offers and choose which to accept. When OFF, the first offer closes the learner.',
  'cdc.coordinator_willingness_approval_deadline_hours': 'If a coordinator has not locked the willingness list within this many hours of the window closing, the CDC Head is auto-notified.',
  'cdc.quarterly_snapshot_enabled': 'When ON, the placement-snapshot cron runs every quarter. Turn OFF during data migrations.',
  'cdc.required_attachments_by_state': 'JSON map of drive states → mandatory upload fields. Director can add/remove requirements without a deploy.',
  'cdc.default_internship_skip_weekends': 'When ON, Saturday/Sunday do not count toward total internship duration for corporate internships.',
  'cdc.min_attendance_pct_for_internship_certificate': 'Learners below this percentage do not qualify for the internship completion certificate.',
  'cdc.parent_consent_required_under_age': 'Learners younger than this age must supply a parent consent URL in the internship willingness form. Set to 0 to disable.',
  'cdc.naac_export_column_mapping': 'Column-mapping object for NAAC 8.2 — Graduate Progression (Binary framework) exports. Update when NAAC publishes a new template.',
  'cdc.aicte_export_column_mapping': 'Column-mapping object for AICTE Annual Return exports. Update when AICTE publishes a new template.',
  'cdc.aicte_include_internal_placements': 'When OFF, placements with JKKN-internal recruiters (e.g. JICATE Solutions) are excluded from the AICTE-reported placement %.',
};

// ── Helpers ───────────────────────────────────────────────────────────────
function groupPolicies(policies: CdcPolicyRow[]): CdcPolicyGroup[] {
  const groups: Record<CdcPolicyCategory, CdcPolicyRow[]> = {
    eligibility: [],
    drive_lifecycle: [],
    willingness: [],
    escalation: [],
    placement: [],
    internship: [],
    attachments: [],
    export: [],
  };

  for (const p of policies) {
    const cat = KEY_TO_CATEGORY[p.policy_key] ?? 'drive_lifecycle';
    groups[cat].push(p);
  }

  return (Object.keys(groups) as CdcPolicyCategory[])
    .filter((cat) => groups[cat].length > 0)
    .map((cat) => ({
      category: cat,
      label: CATEGORY_META[cat].label,
      description: CATEGORY_META[cat].description,
      policies: groups[cat],
    }));
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

// ── Component ─────────────────────────────────────────────────────────────

export default function CdcPoliciesPage() {
  const { isCdcAdmin, isSuperAdmin, isLoading: permsLoading } = useCdcAdmin();

  const [policies, setPolicies] = useState<CdcPolicyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);


  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/cdc/policies');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setPolicies(json.data ?? []);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getDraft = (key: string, current: unknown) =>
    drafts[key] !== undefined ? drafts[key] : displayValue(current);

  const handleChange = (key: string, raw: string) => {
    setDrafts((d) => ({ ...d, [key]: raw }));
  };

  const handleToggle = async (key: string, currentValue: boolean) => {
    const newVal = !currentValue;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`/api/admin/cdc/policies/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newVal }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setPolicies((ps) => ps.map((p) => (p.policy_key === key ? { ...p, value: newVal } : p)));
      toast.success('Policy updated');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleSave = async (key: string, dataType: string) => {
    const rawDraft = drafts[key];
    if (rawDraft === undefined) return; // nothing changed

    let coerced: unknown = rawDraft;
    if (dataType === 'number') {
      const n = Number(rawDraft);
      if (isNaN(n)) { toast.error('Value must be a number'); return; }
      coerced = n;
    } else if (dataType === 'object') {
      try { coerced = JSON.parse(rawDraft); } catch {
        toast.error('Value must be valid JSON'); return;
      }
    }

    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch(`/api/admin/cdc/policies/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: coerced }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setPolicies((ps) => ps.map((p) => (p.policy_key === key ? { ...p, value: coerced } : p)));
      setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
      toast.success('Policy updated');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const handleReset = (key: string) => {
    setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });
  };

  // ── Gate ──────────────────────────────────────────────────────────────
  if (permsLoading || loading) {
    return (
      <ContentLayout title="CDC Policies">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!isCdcAdmin) {
    return (
      <ContentLayout title="CDC Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>CDC policy configuration requires super-admin or CDC Head role.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (loadError) {
    return (
      <ContentLayout title="CDC Policies">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={load} className="mt-4">Retry</Button>
      </ContentLayout>
    );
  }

  const groups = groupPolicies(policies);

  return (
    <ContentLayout title="CDC Policies">
      <PageBreadcrumb
        items={[
          { label: 'CDC', href: '/cdc' },
          { label: 'Admin', href: '/cdc/admin' },
          { label: 'Policies', href: '/cdc/admin/policies' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">CDC Policies</h1>
        <p className="text-muted-foreground mt-1">
          All changes take effect immediately. No deploy required.
        </p>
      </div>

      <div className="space-y-6">
        {groups.map((group) => (
          <Card key={group.category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                {group.label}
              </CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.policies.map((policy, idx) => {
                const isMajor = policy.classification === 'major';
                const canEdit = isMajor ? isSuperAdmin : isCdcAdmin;
                const isSavingThis = saving[policy.policy_key];
                const draft = drafts[policy.policy_key];
                const hasDraft = draft !== undefined;
                const consequence = KEY_CONSEQUENCE[policy.policy_key];

                return (
                  <div key={policy.policy_key}>
                    {idx > 0 && <Separator className="mb-4" />}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label className="font-medium text-sm">
                            {policy.policy_key.replace('cdc.', '').replace(/_/g, ' ')}
                          </Label>
                          {isMajor && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <Lock className="h-2.5 w-2.5" />
                              Major — super-admin only
                            </Badge>
                          )}
                          {policy.updated_at && (
                            <span className="text-xs text-muted-foreground">
                              Last edited {format(new Date(policy.updated_at), 'd MMM yyyy')}
                            </span>
                          )}
                        </div>
                        {consequence && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-prose">
                            {consequence}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {policy.data_type === 'boolean' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div>
                                  <Switch
                                    checked={Boolean(policy.value)}
                                    onCheckedChange={() => handleToggle(policy.policy_key, Boolean(policy.value))}
                                    disabled={!canEdit || isSavingThis}
                                  />
                                </div>
                              </TooltipTrigger>
                              {!canEdit && (
                                <TooltipContent>Requires super-admin</TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        ) : policy.data_type === 'object' ? (
                          <div className="flex flex-col gap-2 w-full max-w-xs sm:max-w-sm">
                            <textarea
                              className="text-xs font-mono border rounded p-2 w-full resize-y min-h-[80px] bg-muted/30"
                              value={getDraft(policy.policy_key, policy.value)}
                              onChange={(e) => handleChange(policy.policy_key, e.target.value)}
                              disabled={!canEdit || isSavingThis}
                              rows={4}
                            />
                            {hasDraft && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleSave(policy.policy_key, policy.data_type)}
                                  disabled={isSavingThis}
                                >
                                  <Save className="h-3 w-3 mr-1" />
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleReset(policy.policy_key)}>
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Reset
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Input
                              type={policy.data_type === 'number' ? 'number' : 'text'}
                              value={getDraft(policy.policy_key, policy.value)}
                              onChange={(e) => handleChange(policy.policy_key, e.target.value)}
                              disabled={!canEdit || isSavingThis}
                              className="w-28 text-right"
                            />
                            {hasDraft && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleSave(policy.policy_key, policy.data_type)}
                                  disabled={isSavingThis}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleReset(policy.policy_key)}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </ContentLayout>
  );
}
