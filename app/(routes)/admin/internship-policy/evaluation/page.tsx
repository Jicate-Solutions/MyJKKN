'use client';

// /admin/internship-policy/evaluation
// Dual-eval toggle, approval escalation config.
// Rubric editor and approval chain UIs are future sub-pages (Q3 phase).

import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import {
  InternshipPolicyService,
  INTERNSHIP_POLICY_KEYS,
  type PolicyRow,
} from '@/lib/services/admin/internship-policy-service';
import { PolicyField } from '../_components/PolicyField';

const POLICY_KEYS = [
  INTERNSHIP_POLICY_KEYS.APPROVAL_ESCALATE_AFTER_HOURS,
  INTERNSHIP_POLICY_KEYS.LOGBOOK_SUBMIT_WITHIN_HOURS,
  INTERNSHIP_POLICY_KEYS.LOGBOOK_EDIT_WINDOW_HOURS,
];

const FIELD_CONFIGS = [
  {
    key: INTERNSHIP_POLICY_KEYS.APPROVAL_ESCALATE_AFTER_HOURS,
    label: 'Approval Auto-Escalation (hours)',
    description:
      'If an approval step is not actioned within this window, the system auto-escalates to the next level or sends a reminder. Covers logbook approvals, evaluation sign-offs, and fee exception requests. Default: 72 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 168,
    step: 12,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.LOGBOOK_SUBMIT_WITHIN_HOURS,
    label: 'Logbook Submission Deadline',
    description:
      'How many hours after a posting day the learner has to submit their logbook. After this window, the submission is marked late and the late-penalty % is applied. Default: 24 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 1,
    max: 72,
    step: 1,
  },
  {
    key: INTERNSHIP_POLICY_KEYS.LOGBOOK_EDIT_WINDOW_HOURS,
    label: 'Logbook Edit Window',
    description:
      'After submission, learners can edit logbook entries for this many hours. After the edit window closes, entries are locked for auditor review. Default: 24 hours.',
    type: 'number' as const,
    unit: 'hours',
    min: 0,
    max: 72,
    step: 1,
  },
];

export default function EvaluationPolicyPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const [rows, setRows] = useState<Record<string, PolicyRow>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await InternshipPolicyService.getMany(POLICY_KEYS);
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (permsLoading) {
    return (
      <ContentLayout title="Evaluation Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Evaluation Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Evaluation policy configuration is restricted to super-admin.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Evaluation Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies', href: '/admin/internship-policy' },
          { label: 'Evaluation' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Evaluation Policies</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Controls logbook deadlines, edit windows, and approval escalation timers.
            Rubric editors and per-program approval chains are Phase 1D (Q3).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="gap-2 flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Q3 links callout */}
      <div className="mb-6 flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span>Rubric editors per program</span>
          <Badge variant="outline" className="text-xs">Q3</Badge>
          <ArrowRight className="h-3.5 w-3.5" />
          <Link href="/admin/internship-policy" className="text-primary text-xs hover:underline">
            Coming in Phase 1D
          </Link>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span>Approval chain config per posting type</span>
          <Badge variant="outline" className="text-xs">Q3</Badge>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {FIELD_CONFIGS.map((config) => (
            <PolicyField
              key={config.key}
              config={config}
              currentValue={rows[config.key]?.value}
              updatedAt={rows[config.key]?.updated_at}
              onSaved={load}
            />
          ))}
        </div>
      )}
    </ContentLayout>
  );
}
