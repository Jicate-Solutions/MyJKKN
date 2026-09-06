'use client';

// ============================================================================
// /campus-living/premium/allocation-rules — Premium-room allocation rules editor (relocated from /admin/hostel 2026-06-01)
// ============================================================================
// Surfaces the 7 hostel.premium.* / hostel.premium_plus.* platform_policies
// rows as English-consequence widgets per Director's D-lock 2026-05-26.
//
// Pattern reference (canonical): /admin/mess/policies/page.tsx + the
// reference_platform_policies_director_view_pattern.md memory entry.
//
// The 7 policies (current production values, verified 2026-05-26):
//   1. hostel.premium.eligibility                       (object — fees-clear toggle)
//   2. hostel.premium.hold_window_minutes               (number, default 15)
//   3. hostel.premium.invite_max_retries                (number, default 1)
//   4. hostel.premium.invite_window_hours               (number, default 48)
//   5. hostel.premium.payment_mode                      (string, default 'atomic')
//   6. hostel.premium.quota_per_block_default_percent   (number, default 0)
//   7. hostel.premium_plus.late_returns_per_month       (number, default 2)
//
// Director's-view UX rule: each card shows the human-meaningful sentence
// ("Hold a premium room for X minutes pending payment") next to the widget.
// Never raw JSON.
// ============================================================================

import { useEffect, useState } from 'react';
import { Settings2, Loader2, Home } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

import {
  useAllocationPolicies,
  useUpdateAllocationPolicy,
  HOSTEL_ALLOCATION_POLICY_KEYS,
  type HostelAllocationPolicyKey,
  type HostelAllocationPolicySnapshot,
} from '@/hooks/hostel/use-allocation-policies';
import type {
  HostelPremiumEligibility,
  HostelPremiumPaymentMode,
} from '@/lib/services/hostel/allocation-policy-service';

export const navMeta = { label: 'Allocation Rules', icon: 'Settings2' } as const;

// ── Generic policy card (lifted from mess/policies pattern) ─────────────────

interface PolicyCardProps<TValue> {
  title: string;
  consequence: string;
  policyKey: HostelAllocationPolicyKey;
  value: TValue;
  render: (params: {
    value: TValue;
    setValue: (v: TValue) => void;
    isPending: boolean;
  }) => React.ReactNode;
  onSave: (v: TValue) => void | Promise<void>;
  equals?: (a: TValue, b: TValue) => boolean;
}

function PolicyCard<TValue>({
  title,
  consequence,
  policyKey,
  value: initialValue,
  render,
  onSave,
  equals,
}: PolicyCardProps<TValue>) {
  const [draft, setDraft] = useState<TValue>(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initialValue);
    // Intentional deep dep on JSON for object values via parent re-render.
  }, [initialValue]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const isEqual = equals ? equals(draft, initialValue) : draft === initialValue;
  const dirty = !isEqual;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          {consequence}
        </CardDescription>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {policyKey}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {render({ value: draft, setValue: setDraft, isPending: saving })}
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Unsaved
            </Badge>
          )}
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Eligibility equality (object compare) ───────────────────────────────────

function eligibilityEquals(a: HostelPremiumEligibility, b: HostelPremiumEligibility): boolean {
  return Boolean(a?.require_fees_clear) === Boolean(b?.require_fees_clear);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HostelAllocationRulesPage() {
  const { data: snapshot, isLoading } = useAllocationPolicies();
  const update = useUpdateAllocationPolicy();

  const saveOne = (
    key: HostelAllocationPolicyKey,
    value: number | string | boolean | Record<string, unknown>,
  ) => update.mutateAsync({ policyKey: key, value });

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. Allocation rules
            govern how the Premium-Room tier of hostel allocation behaves
            across all colleges.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <PageBreadcrumb
          items={[
            { label: 'Campus Living', href: '/campus-living' },
            { label: 'Allocation Rules' },
          ]}
        />

        <header className="mt-4 mb-6 flex items-center gap-3">
          <Settings2 className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Hostel Allocation Rules
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Premium-room knobs that govern how a learner can opt into the
              paid premium tier, how long their bed is held, how invites to
              roommates expire, and how late-return passes work for
              premium-plus residents. Changes take effect within ~1 hour
              without a redeploy.
            </p>
          </div>
        </header>

        {isLoading || !snapshot ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : (
          <AllocationPolicyGrid snapshot={snapshot} saveOne={saveOne} />
        )}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            General room allocation rules
          </h2>
          <Card className="opacity-70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-5 w-5 text-muted-foreground" />
                Coming soon
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Forward-looking rules — gender-room policy (boys-only / girls-only / mixed),
                tier-crossing (standard residents into premium rooms when premium beds are
                full?), default-warden-by-block — will ship in a follow-up PR once the
                rooms / allocations admin lands.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </ContentLayout>
    </SuperAdminOnly>
  );
}

// ── Grid of 7 policies ──────────────────────────────────────────────────────

function AllocationPolicyGrid({
  snapshot,
  saveOne,
}: {
  snapshot: HostelAllocationPolicySnapshot;
  saveOne: (
    key: HostelAllocationPolicyKey,
    value: number | string | boolean | Record<string, unknown>,
  ) => Promise<void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 1. Eligibility — object widget (boolean toggle on require_fees_clear) */}
      <PolicyCard<HostelPremiumEligibility>
        title="Premium-tier eligibility"
        consequence="When ON, a learner must have no pending tuition or hostel dues before they can opt into the Premium tier. When OFF, anyone may opt in (still subject to bed availability and payment)."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.ELIGIBILITY}
        value={snapshot.eligibility}
        equals={eligibilityEquals}
        onSave={(v) =>
          saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.ELIGIBILITY, {
            ...snapshot.eligibility,
            require_fees_clear: Boolean(v.require_fees_clear),
          })
        }
        render={({ value, setValue }) => (
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">
              Require fees clear before opting into Premium
            </Label>
            <Switch
              checked={Boolean(value.require_fees_clear)}
              onCheckedChange={(checked) =>
                setValue({ ...value, require_fees_clear: checked })
              }
            />
          </div>
        )}
      />

      {/* 2. Hold window minutes */}
      <PolicyCard<number>
        title="Premium-pick hold window"
        consequence="When a learner picks a Premium bed, hold it for X minutes while they complete payment. After the window expires the bed is released back to the pool."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.HOLD_WINDOW_MINUTES}
        value={snapshot.holdWindowMinutes}
        onSave={(v) => saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.HOLD_WINDOW_MINUTES, v)}
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Minutes (default 15)</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />

      {/* 3. Invite max retries */}
      <PolicyCard<number>
        title="Roommate invite retries"
        consequence="A Premium learner may re-invite a roommate up to X times after a decline or expiry. Beyond this, admin intervention is required."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.INVITE_MAX_RETRIES}
        value={snapshot.inviteMaxRetries}
        onSave={(v) => saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.INVITE_MAX_RETRIES, v)}
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Max retries (default 1)</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />

      {/* 4. Invite window hours */}
      <PolicyCard<number>
        title="Roommate invite window"
        consequence="An invited roommate must accept the invite within X hours. After the window expires the invite is void and the inviter must re-invite (subject to the retry cap above)."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.INVITE_WINDOW_HOURS}
        value={snapshot.inviteWindowHours}
        onSave={(v) => saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.INVITE_WINDOW_HOURS, v)}
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Hours (default 48)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />

      {/* 5. Payment mode — enum */}
      <PolicyCard<HostelPremiumPaymentMode>
        title="Premium payment mode"
        consequence="How the Premium fee and the allocation interact at checkout. Atomic = both succeed or both roll back. Hold-24h = bed held for 24 hours pending payment. Pay-at-intake = allocation locked, fee invoiced at admission."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.PAYMENT_MODE}
        value={snapshot.paymentMode}
        onSave={(v) => saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.PAYMENT_MODE, v)}
        render={({ value, setValue }) => (
          <Select
            value={value}
            onValueChange={(v) => setValue(v as HostelPremiumPaymentMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atomic">Atomic (recommended)</SelectItem>
              <SelectItem value="hold_24h">Hold 24h pending payment</SelectItem>
              <SelectItem value="pay_at_intake">Pay at intake</SelectItem>
            </SelectContent>
          </Select>
        )}
      />

      {/* 6. Quota per block default percent */}
      <PolicyCard<number>
        title="Premium quota per block"
        consequence="Suggested default share of beds in each block to tag premium-only. Chief warden may override this per block. Advisory — not enforced at runtime."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.QUOTA_PER_BLOCK_DEFAULT_PERCENT}
        value={snapshot.quotaPerBlockDefaultPercent}
        onSave={(v) =>
          saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.QUOTA_PER_BLOCK_DEFAULT_PERCENT, v)
        }
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Percent (0 – 100, default 0)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />

      {/* 7. Premium-plus late returns per month */}
      <PolicyCard<number>
        title="Premium-plus late-return passes per month"
        consequence="A Premium-Plus learner may use up to X late-return passes per month without warden approval. The X+1th late return triggers a strike."
        policyKey={HOSTEL_ALLOCATION_POLICY_KEYS.LATE_RETURNS_PER_MONTH}
        value={snapshot.lateReturnsPerMonth}
        onSave={(v) =>
          saveOne(HOSTEL_ALLOCATION_POLICY_KEYS.LATE_RETURNS_PER_MONTH, v)
        }
        render={({ value, setValue }) => (
          <div>
            <Label className="text-xs">Passes per month (default 2)</Label>
            <Input
              type="number"
              min={0}
              max={31}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
      />
    </div>
  );
}
