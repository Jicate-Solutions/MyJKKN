'use client';

/**
 * Admission / Social Media / Governance — Director's-View consequences surface.
 *
 * This is a READ-ONLY page, NOT a settings form. It shows the plain-English
 * CONSEQUENCE of each live social-governance policy, computed against the live
 * metrics tables, and links each one to the admin page where the value can be
 * changed. The point: a Director should be able to read "dormancy threshold =
 * 30 days → 5 handles flagged dormant" and understand exactly what the current
 * policy is doing to the network right now.
 *
 * Data comes from GET /api/social/governance (server-computed; reads policies
 * via fn_get_policy and metrics via ig_accounts / ig_account_metrics /
 * social_dept_accounts — access_token is NEVER read). See that route for the
 * computation details and the fail-soft behaviour when the sibling agent's
 * `social.*` policy keys / `lifecycle_status` column are not yet live.
 *
 * Gate: social.view (the broad "Social Hub Overview" key) so many roles can
 * view — matching the sibling read pages. A finer social.governance.view key
 * also exists for future tightening.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Radio,
  ShieldCheck,
  Users,
  Layers,
  Info,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Governance' },
];

/** Where each policy is edited. The admin policies page is a sibling agent's
 *  deliverable; the links light up when that PR merges. */
const POLICY_ADMIN_HREF = '/admission/social/admin/policies';

interface GovernanceData {
  policies: {
    dormancyThresholdDays: number;
    minFollowers: number;
    minPosts: number;
    followbackRatioThreshold: number;
    realtimeEnabled: boolean;
    seeded: {
      dormancy: boolean;
      minFollowers: boolean;
      minPosts: boolean;
      realtime: boolean;
      followback: boolean;
    };
  };
  consequences: {
    dormancy: {
      threshold_days: number;
      flagged: number;
      total: number;
      no_activity_data: number;
    };
    compliance: {
      min_followers: number;
      min_posts: number;
      failed: number;
      total: number;
      no_data: number;
    };
    followback: {
      ratio_threshold: number;
      exceeded: number;
      evaluable: number;
      total: number;
    };
    realtime: { enabled: boolean };
    lifecycle: {
      available: boolean;
      total: number;
      breakdown: { status: string; count: number }[];
    };
  };
}

/** A consequence card: policy value (left) → live consequence (right) → edit. */
function ConsequenceCard({
  icon,
  policyLabel,
  policyValue,
  notConfigured,
  consequence,
  tone,
  caveat,
  editHref,
}: {
  icon: React.ReactNode;
  policyLabel: string;
  policyValue: React.ReactNode;
  notConfigured?: boolean;
  consequence: React.ReactNode;
  tone: 'danger' | 'ok' | 'neutral';
  caveat?: React.ReactNode;
  editHref?: string;
}) {
  const toneRing =
    tone === 'danger'
      ? 'border-l-4 border-l-destructive'
      : tone === 'ok'
        ? 'border-l-4 border-l-green-500'
        : 'border-l-4 border-l-muted-foreground/40';

  return (
    <Card className={toneRing}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{icon}</span>
            <CardTitle className="text-base">{policyLabel}</CardTitle>
          </div>
          {notConfigured && (
            <Badge variant="outline" className="shrink-0 text-xs">
              Using default
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {policyValue}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span
            className={
              tone === 'danger'
                ? 'font-semibold text-destructive'
                : tone === 'ok'
                  ? 'font-semibold text-green-600'
                  : 'font-semibold'
            }
          >
            {consequence}
          </span>
        </div>

        {caveat && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{caveat}</span>
          </p>
        )}

        {editHref && (
          <Link
            href={editHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Edit policy
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/** Visual lifecycle cascade for social_dept_accounts. */
const LIFECYCLE_META: Record<
  string,
  { label: string; bar: string; chip: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  official: { label: 'Official', bar: 'bg-green-500', chip: 'default' },
  provisional: { label: 'Provisional', bar: 'bg-amber-500', chip: 'secondary' },
  deprecated: { label: 'Deprecated', bar: 'bg-orange-500', chip: 'outline' },
  kill: { label: 'Kill', bar: 'bg-destructive', chip: 'destructive' },
  unset: { label: 'Unset', bar: 'bg-muted-foreground/40', chip: 'outline' },
};

function LifecycleCascade({
  data,
}: {
  data: GovernanceData['consequences']['lifecycle'];
}) {
  if (!data.available) {
    return (
      <Alert>
        <AlertDescription>
          Lifecycle status is not yet available — the{' '}
          <code className="text-xs">lifecycle_status</code> column on department
          accounts has not been provisioned. This cascade will populate
          automatically once that change is live.
        </AlertDescription>
      </Alert>
    );
  }

  if (data.total === 0) {
    return (
      <Alert>
        <AlertDescription>No department accounts to classify yet.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {data.breakdown.map(({ status, count }) => {
        const meta = LIFECYCLE_META[status] ?? LIFECYCLE_META.unset;
        const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
        return (
          <div key={status} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={meta.chip} className="text-xs">
                  {meta.label}
                </Badge>
              </div>
              <span className="font-medium">
                {count}{' '}
                <span className="text-muted-foreground">
                  ({pct}%)
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${meta.bar}`}
                style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted-foreground">
        {data.total} department account{data.total === 1 ? '' : 's'} classified.
      </p>
    </div>
  );
}

function GovernanceBody() {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/social/governance')
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error ?? `Failed to load (HTTP ${res.status})`);
        } else {
          setData(json.data as GovernanceData);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Network error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const c = data.consequences;
  const p = data.policies;

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-muted-foreground">
        What each live social-governance policy is doing to the network right
        now. Read-only — follow the “Edit policy” links to change a threshold.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Dormancy */}
        <ConsequenceCard
          icon={<Clock className="h-4 w-4" />}
          policyLabel="Dormancy threshold"
          policyValue={`${c.dormancy.threshold_days} days`}
          notConfigured={!p.seeded.dormancy}
          tone={c.dormancy.flagged > 0 ? 'danger' : 'ok'}
          consequence={
            <>
              {c.dormancy.flagged} of {c.dormancy.total} handle
              {c.dormancy.flagged === 1 ? '' : 's'} flagged dormant
            </>
          }
          caveat={
            c.dormancy.no_activity_data > 0 ? (
              <>
                {c.dormancy.no_activity_data} handle
                {c.dormancy.no_activity_data === 1 ? ' has' : 's have'} no
                last-post date to evaluate (business-discovery accounts don’t
                report it).
              </>
            ) : undefined
          }
          editHref={POLICY_ADMIN_HREF}
        />

        {/* 2. Compliance floor */}
        <ConsequenceCard
          icon={<ShieldCheck className="h-4 w-4" />}
          policyLabel="Compliance floor"
          policyValue={`${c.compliance.min_followers} followers / ${c.compliance.min_posts} posts`}
          notConfigured={!p.seeded.minFollowers || !p.seeded.minPosts}
          tone={c.compliance.failed > 0 ? 'danger' : 'ok'}
          consequence={
            <>
              {c.compliance.failed} of {c.compliance.total} handle
              {c.compliance.failed === 1 ? '' : 's'} fail compliance
            </>
          }
          caveat={
            c.compliance.no_data > 0 ? (
              <>
                {c.compliance.no_data} handle
                {c.compliance.no_data === 1 ? ' has' : 's have'} no metric
                snapshot yet — not counted as passing.
              </>
            ) : undefined
          }
          editHref={POLICY_ADMIN_HREF}
        />

        {/* 3. Follow-back ratio */}
        <ConsequenceCard
          icon={<Users className="h-4 w-4" />}
          policyLabel="Follow-back ratio flag"
          policyValue={`ratio > ${c.followback.ratio_threshold}`}
          notConfigured={!p.seeded.followback}
          tone={c.followback.exceeded > 0 ? 'danger' : 'ok'}
          consequence={
            <>
              {c.followback.exceeded} handle
              {c.followback.exceeded === 1 ? '' : 's'} exceed it
            </>
          }
          caveat={
            <>
              Only evaluable for the {c.followback.evaluable} graph-source
              handle{c.followback.evaluable === 1 ? '' : 's'} — “follows” is not
              populated for business-discovery accounts.
            </>
          }
          editHref={POLICY_ADMIN_HREF}
        />

        {/* 4. Real-time publishing */}
        <ConsequenceCard
          icon={<Radio className="h-4 w-4" />}
          policyLabel="Real-time publishing"
          policyValue={c.realtime.enabled ? 'enabled' : 'disabled'}
          notConfigured={!p.seeded.realtime}
          tone={c.realtime.enabled ? 'ok' : 'neutral'}
          consequence={
            <span className="inline-flex items-center gap-1.5">
              {c.realtime.enabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> ON
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4" /> OFF
                </>
              )}
            </span>
          }
          editHref={POLICY_ADMIN_HREF}
        />
      </div>

      {/* 5. Lifecycle cascade */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-muted-foreground" />
            Department account lifecycle
          </CardTitle>
          <CardDescription>
            How the {c.lifecycle.total || 'department'} social handles are
            classified across their lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LifecycleCascade data={c.lifecycle} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SocialGovernancePage() {
  return (
    <PermissionGuard
      module="social"
      action="view"
      fallback={
        <ContentLayout title="Social Governance">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Social Governance">
        <PageBreadcrumb items={breadcrumbItems} />
        <GovernanceBody />
      </ContentLayout>
    </PermissionGuard>
  );
}
