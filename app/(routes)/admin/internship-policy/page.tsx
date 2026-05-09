'use client';

// ============================================
// /admin/internship-policy — Landing page
// ============================================
// Super-admin policy hub for the Internship Module.
// Shows 6 category cards + last-edit timestamps.
// Pattern mirrors /admin/counselors/routing-config (Spec #26, #537).
// ============================================

import Link from 'next/link';
import {
  GraduationCap,
  Banknote,
  MapPin,
  ClipboardCheck,
  CalendarRange,
  Bell,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import {
  InternshipPolicyService,
  INTERNSHIP_POLICY_KEYS,
} from '@/lib/services/admin/internship-policy-service';

interface CategoryCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  policyKeys: string[];
  color: string;
}

const CATEGORIES: CategoryCard[] = [
  {
    href: '/admin/internship-policy/eligibility',
    title: 'Eligibility',
    description: 'Fee compliance threshold, registration cutoff, and GPA gate for posting allocation.',
    icon: GraduationCap,
    policyKeys: [INTERNSHIP_POLICY_KEYS.FEE_COMPLIANCE_THRESHOLD, INTERNSHIP_POLICY_KEYS.REGISTRATION_CUTOFF_DAYS],
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/admin/internship-policy/fees',
    title: 'Fees',
    description: 'Fee compliance thresholds and penalty configuration per cycle.',
    icon: Banknote,
    policyKeys: [INTERNSHIP_POLICY_KEYS.FEE_COMPLIANCE_THRESHOLD, INTERNSHIP_POLICY_KEYS.LOGBOOK_LATE_PENALTY_PCT],
    color: 'text-amber-600 bg-amber-50',
  },
  {
    href: '/admin/internship-policy/attendance',
    title: 'Attendance',
    description: 'GPS geofence strictness, attendance marking window, and LOP-immunity wiring.',
    icon: MapPin,
    policyKeys: [INTERNSHIP_POLICY_KEYS.ATTENDANCE_FLAG_BELOW_PCT, INTERNSHIP_POLICY_KEYS.GPS_STRICT_MODE],
    color: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/admin/internship-policy/evaluation',
    title: 'Evaluation',
    description: 'Dual-evaluation toggle, rubric editor links, and approval chain config.',
    icon: ClipboardCheck,
    policyKeys: [INTERNSHIP_POLICY_KEYS.APPROVAL_ESCALATE_AFTER_HOURS],
    color: 'text-purple-600 bg-purple-50',
  },
  {
    href: '/admin/internship-policy/cycle',
    title: 'Cycle',
    description: 'Min/max cycle duration, status labels, and blackout dates per college.',
    icon: CalendarRange,
    policyKeys: [INTERNSHIP_POLICY_KEYS.ROSTER_REMINDER_D_MINUS, INTERNSHIP_POLICY_KEYS.VEHICLE_LEAD_TIME_DAYS],
    color: 'text-orange-600 bg-orange-50',
  },
  {
    href: '/admin/internship-policy/notifications',
    title: 'Notifications',
    description: 'Per-college notification override schedules and reminder cadences.',
    icon: Bell,
    policyKeys: [
      INTERNSHIP_POLICY_KEYS.NOTIFY_LOGBOOK_REMINDER_AFTER_HOURS,
      INTERNSHIP_POLICY_KEYS.NOTIFY_EVALUATION_REMINDER_AFTER_HOURS,
    ],
    color: 'text-rose-600 bg-rose-50',
  },
];

export default function InternshipPolicyLandingPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const [lastEdits, setLastEdits] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);

  const loadLastEdits = async () => {
    setLoading(true);
    const allKeys = CATEGORIES.flatMap((c) => c.policyKeys);
    const rows = await InternshipPolicyService.getMany(allKeys);
    const edits: Record<string, string | undefined> = {};
    for (const [key, row] of Object.entries(rows)) {
      if (row.updated_at) edits[key] = row.updated_at;
    }
    setLastEdits(edits);
    setLoading(false);
  };

  useEffect(() => {
    loadLastEdits();
  }, []);

  const getLastEditForCategory = (cat: CategoryCard): string | undefined => {
    const timestamps = cat.policyKeys
      .map((k) => lastEdits[k])
      .filter(Boolean) as string[];
    if (timestamps.length === 0) return undefined;
    return timestamps.sort().reverse()[0];
  };

  if (permsLoading) {
    return (
      <ContentLayout title="Internship Policies">
        <Skeleton className="h-32 w-full" />
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Internship Policies">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Super-admin only</AlertTitle>
          <AlertDescription>
            Internship policy configuration is restricted to super-admin. Changes here affect all 7 colleges.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Internship Policies">
      <PageBreadcrumb
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Internship Policies' },
        ]}
      />

      <div className="mt-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Internship Policies</h1>
            <Badge variant="secondary" className="text-xs font-mono">v1</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Director-grade policy hub. Every edit shows a cascade-preview before saving.
            Changes take effect immediately across all 7 colleges (~2,740 learners).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadLastEdits}
          disabled={loading}
          className="gap-2 flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((cat) => {
          const lastEdit = getLastEditForCategory(cat);
          const Icon = cat.icon;

          return (
            <Link key={cat.href} href={cat.href} className="group block focus:outline-none">
              <Card className="h-full transition-shadow hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`rounded-lg p-2.5 ${cat.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <CardTitle className="text-base mt-2">{cat.title}</CardTitle>
                  <CardDescription className="text-sm leading-snug">
                    {cat.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    {loading ? (
                      <Skeleton className="h-3 w-32" />
                    ) : lastEdit ? (
                      <>Last edited {new Date(lastEdit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                    ) : (
                      'Never edited — using defaults'
                    )}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Alert className="mt-8">
        <AlertTitle>How policy changes propagate</AlertTitle>
        <AlertDescription className="text-sm">
          Each save triggers an optimistic update in the UI and writes to{' '}
          <code className="rounded bg-muted px-1">platform_policies</code>. Active cycles
          read policies via{' '}
          <code className="rounded bg-muted px-1">fn_internship_evaluate_policy()</code>{' '}
          on each computation — no deploy required. The cascade-preview pane on each sub-page
          shows affected learners, cycles, and notification audience before you confirm.
        </AlertDescription>
      </Alert>
    </ContentLayout>
  );
}
