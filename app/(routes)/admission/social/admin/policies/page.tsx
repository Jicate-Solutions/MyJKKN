'use client';

// ============================================================
// /admission/social/admin/policies — Social Governance policy editor
// ============================================================
// Super-admin write-UI for the social.* platform_policies keys.
// Cloned from app/(routes)/cdc/admin/policies/page.tsx — same gate
// (single super-admin guard), same read/write shape, same audit
// surfacing (updated_by / "Last edited" via updated_at).
//
// Per-type editors:
//   - number ints  → number Input
//   - realtime flag → Switch toggle
//   - digest_categories (json) → checkbox group
//   - ratio (text) → text Input
//   - any other object/array json → JSON textarea (fallback)
// All changes take effect immediately. No deploy required.
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Settings, Save, RotateCcw, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { usePermissions } from '@/hooks/use-permissions';
import type { SocialPolicyRow, SocialPolicyCategory, SocialPolicyGroup } from '@/types/admin/social';

// ── Category metadata ──────────────────────────────────────────────────────
const CATEGORY_META: Record<SocialPolicyCategory, { label: string; description: string }> = {
  dormancy: {
    label: 'Dormancy',
    description: 'How long a social account may go without activity before it is flagged dormant.',
  },
  compliance: {
    label: 'Compliance thresholds',
    description: 'Minimum follower / post counts and follow-back ratio an account must meet to be considered compliant.',
  },
  digest: {
    label: 'Digest',
    description: 'Real-time toggle and the shape of the periodic social digest sent to admins.',
  },
};

// Map each policy_key to its category
const KEY_TO_CATEGORY: Record<string, SocialPolicyCategory> = {
  'social.dormancy_threshold_days': 'dormancy',
  'social.compliance_min_followers': 'compliance',
  'social.compliance_min_posts': 'compliance',
  'social.followback_ratio_threshold': 'compliance',
  'social.realtime_enabled': 'digest',
  'social.digest_top_n': 'digest',
  'social.digest_categories': 'digest',
};

// Human-friendly consequence labels per policy
const KEY_CONSEQUENCE: Record<string, string> = {
  'social.dormancy_threshold_days':
    'A social account with no new posts for this many days is flagged dormant on the governance dashboard.',
  'social.compliance_min_followers':
    'Accounts below this follower count are marked non-compliant.',
  'social.compliance_min_posts':
    'Accounts that have published fewer than this many posts are marked non-compliant.',
  'social.followback_ratio_threshold':
    'Minimum acceptable followers-to-following ratio (e.g. "1.5"). Accounts below this are flagged.',
  'social.realtime_enabled':
    'When ON, the social governance dashboard updates in real time. When OFF, it refreshes on page load only.',
  'social.digest_top_n':
    'The social digest shows the top N accounts/posts in each section.',
  'social.digest_categories':
    'Which sections appear in the social digest. Unchecking a category removes it from the digest entirely.',
};

// Keys that render as a Switch toggle (boolean).
const TOGGLE_KEYS = new Set<string>(['social.realtime_enabled']);
// Key that renders as a checkbox group.
const DIGEST_CATEGORIES_KEY = 'social.digest_categories';

// Selectable options for the digest-categories checkbox group.
// (Tolerant of values not listed here — any selected unknown value is still shown.)
const DIGEST_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'lead_ads', label: 'Lead Ads' },
  { value: 'attribution', label: 'Attribution' },
  { value: 'dormancy', label: 'Dormant accounts' },
  { value: 'compliance', label: 'Compliance flags' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function groupPolicies(policies: SocialPolicyRow[]): SocialPolicyGroup[] {
  const groups: Record<SocialPolicyCategory, SocialPolicyRow[]> = {
    dormancy: [],
    compliance: [],
    digest: [],
  };

  for (const p of policies) {
    const cat = KEY_TO_CATEGORY[p.policy_key] ?? 'digest';
    groups[cat].push(p);
  }

  return (Object.keys(groups) as SocialPolicyCategory[])
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

/** Coerce a policy.value into a string[] for the checkbox group, tolerating shapes. */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [];
}

// ── Component ─────────────────────────────────────────────────────────────

export default function SocialPoliciesPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  const [policies, setPolicies] = useState<SocialPolicyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/social/policies');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setPolicies(json.data ?? []);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getDraft = (key: string, current: unknown) =>
    drafts[key] !== undefined ? drafts[key] : displayValue(current);

  const handleChange = (key: string, raw: string) => {
    setDrafts((d) => ({ ...d, [key]: raw }));
  };

  // Persist a coerced value to the API and reflect it locally.
  const persist = useCallback(
    async (key: string, value: unknown): Promise<boolean> => {
      setSaving((s) => ({ ...s, [key]: true }));
      try {
        const res = await fetch(`/api/admin/social/policies/${encodeURIComponent(key)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Save failed');
        setPolicies((ps) => ps.map((p) => (p.policy_key === key ? { ...p, value } : p)));
        toast.success('Policy updated');
        return true;
      } catch (err: any) {
        toast.error(err.message);
        return false;
      } finally {
        setSaving((s) => ({ ...s, [key]: false }));
      }
    },
    []
  );

  const handleToggle = async (key: string, currentValue: boolean) => {
    await persist(key, !currentValue);
  };

  const handleSave = async (key: string, dataType: string) => {
    const rawDraft = drafts[key];
    if (rawDraft === undefined) return; // nothing changed

    let coerced: unknown = rawDraft;
    if (dataType === 'number') {
      const n = Number(rawDraft);
      if (isNaN(n)) {
        toast.error('Value must be a number');
        return;
      }
      coerced = n;
    } else if (dataType === 'object' || dataType === 'array') {
      try {
        coerced = JSON.parse(rawDraft);
      } catch {
        toast.error('Value must be valid JSON');
        return;
      }
    }
    // 'string'/'enum' pass through as-is (covers the followback ratio text field).

    const ok = await persist(key, coerced);
    if (ok) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
    }
  };

  // Checkbox-group toggle for digest_categories — writes the whole array immediately.
  const handleCategoryToggle = async (key: string, current: string[], optValue: string, checked: boolean) => {
    const set = new Set(current);
    if (checked) set.add(optValue);
    else set.delete(optValue);
    await persist(key, Array.from(set));
  };

  const handleReset = (key: string) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };

  // ── Gate ──────────────────────────────────────────────────────────────
  if (permsLoading || loading) {
    return (
      <ContentLayout title="Social Policies">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Social Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            Social governance configuration requires super-admin access.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (loadError) {
    return (
      <ContentLayout title="Social Policies">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={load} className="mt-4">
          Retry
        </Button>
      </ContentLayout>
    );
  }

  const groups = groupPolicies(policies);

  return (
    <ContentLayout title="Social Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admissions', href: '/admission' },
          { label: 'Social', href: '/admission/social' },
          { label: 'Admin', href: '/admission/social/admin/policies' },
          { label: 'Policies', href: '/admission/social/admin/policies' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Social Policies</h1>
        <p className="text-muted-foreground mt-1">
          All changes take effect immediately. No deploy required.
        </p>
      </div>

      {groups.length === 0 ? (
        <Alert>
          <AlertTitle>No policies found</AlertTitle>
          <AlertDescription>
            No <code>social.*</code> policy keys are present yet. They are seeded into
            platform_policies by the social governance substrate migration.
          </AlertDescription>
        </Alert>
      ) : (
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
                  const isSavingThis = saving[policy.policy_key];
                  const draft = drafts[policy.policy_key];
                  const hasDraft = draft !== undefined;
                  const consequence = KEY_CONSEQUENCE[policy.policy_key];
                  const isToggle = TOGGLE_KEYS.has(policy.policy_key) || policy.data_type === 'boolean';
                  const isDigestCategories = policy.policy_key === DIGEST_CATEGORIES_KEY;

                  return (
                    <div key={policy.policy_key}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Label className="font-medium text-sm">
                              {policy.policy_key.replace('social.', '').replace(/_/g, ' ')}
                            </Label>
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

                          {/* digest_categories checkbox group renders below the label, full width */}
                          {isDigestCategories && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(() => {
                                const selected = toStringArray(policy.value);
                                // Merge known options with any unknown selected values so nothing is hidden.
                                const knownValues = new Set(DIGEST_CATEGORY_OPTIONS.map((o) => o.value));
                                const extras = selected
                                  .filter((v) => !knownValues.has(v))
                                  .map((v) => ({ value: v, label: v }));
                                const allOptions = [...DIGEST_CATEGORY_OPTIONS, ...extras];
                                return allOptions.map((opt) => {
                                  const checked = selected.includes(opt.value);
                                  return (
                                    <label
                                      key={opt.value}
                                      className="flex items-center gap-2 text-sm cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        disabled={isSavingThis}
                                        onCheckedChange={(c) =>
                                          handleCategoryToggle(
                                            policy.policy_key,
                                            selected,
                                            opt.value,
                                            c === true
                                          )
                                        }
                                      />
                                      <span>{opt.label}</span>
                                    </label>
                                  );
                                });
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Right-hand editor for non-checkbox-group keys */}
                        {!isDigestCategories && (
                          <div className="flex items-center gap-2 shrink-0">
                            {isToggle ? (
                              <Switch
                                checked={Boolean(policy.value)}
                                onCheckedChange={() =>
                                  handleToggle(policy.policy_key, Boolean(policy.value))
                                }
                                disabled={isSavingThis}
                              />
                            ) : policy.data_type === 'object' || policy.data_type === 'array' ? (
                              <div className="flex flex-col gap-2 w-full max-w-xs sm:max-w-sm">
                                <textarea
                                  className="text-xs font-mono border rounded p-2 w-full resize-y min-h-[80px] bg-muted/30"
                                  value={getDraft(policy.policy_key, policy.value)}
                                  onChange={(e) => handleChange(policy.policy_key, e.target.value)}
                                  disabled={isSavingThis}
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
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleReset(policy.policy_key)}
                                    >
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
                                  disabled={isSavingThis}
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
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ContentLayout>
  );
}
