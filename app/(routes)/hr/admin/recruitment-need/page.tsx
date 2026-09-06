// ============================================================================
// Admin — HR Recruitment Need Signal (hub page)
// ============================================================================

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Camera,
  CheckSquare,
  Gauge,
  GraduationCap,
  BarChart3,
  Shuffle,
  SlidersHorizontal,
  Signal,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminPermissionGuard } from '@/components/auth/admin-permission-guard';
import { SYSTEM_ROLES } from '@/types/auth';

type ActionCardProps = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const CARDS: ActionCardProps[] = [
  {
    href: '/hr/admin/recruitment-need/norms',
    icon: BookOpen,
    title: 'Regulatory Norms',
    description:
      'SFR norms, counting rules (adjunct/visiting weights), and R/A/G thresholds per regulatory body and program type.',
  },
  {
    href: '/hr/admin/recruitment-need/bodies',
    icon: Building2,
    title: 'Regulatory Bodies',
    description:
      'AICTE, UGC, DCI, INC, PCI, and other bodies that set staffing norms for programs.',
  },
  {
    href: '/hr/admin/recruitment-need/specializations',
    icon: GraduationCap,
    title: 'Specializations',
    description:
      'Faculty specialization taxonomy mapped to regulatory bodies.',
  },
  {
    href: '/hr/admin/recruitment-need/peer-benchmarks',
    icon: BarChart3,
    title: 'Peer Benchmarks',
    description:
      'Manually entered SFR data from peer institutions for comparative analysis.',
  },
  {
    href: '/hr/admin/recruitment-need/weights',
    icon: SlidersHorizontal,
    title: 'Signal Weights',
    description:
      'Configure the 7 input weights that drive the composite recruitment need score (must sum to 100).',
  },
  {
    href: '/hr/admin/recruitment-need/thresholds',
    icon: Gauge,
    title: 'Per-Input Thresholds',
    description:
      'Set amber (warning) and red (critical) thresholds for each of the 7 signal inputs.',
  },
  {
    href: '/hr/admin/recruitment-need/approvals',
    icon: CheckSquare,
    title: 'Program Approvals',
    description:
      'Institution-level program approval status — maps which programs are active and governs sanctioned position calculations.',
  },
  {
    href: '/hr/admin/recruitment-need/allocations',
    icon: Shuffle,
    title: 'Cross-Institution Allocations',
    description:
      'Staff allocated across institutions — tracks shared faculty that affect headcount at multiple campuses.',
  },
  {
    href: '/hr/admin/recruitment-need/snapshots',
    icon: Camera,
    title: 'Signal Snapshots',
    description:
      'Point-in-time snapshots of recruitment signals for audit trails and historical comparison.',
  },
];

export default function RecruitmentNeedAdminHub() {
  return (
    // Matches the AdminPermissionGuard gate on every recruitment-need/* leaf
    // (super admins + the 'administrator' role). Added 2026-06-19; the index
    // page was unguarded and listed the recruitment-need configuration cards.
    <AdminPermissionGuard
      adminRoles={[SYSTEM_ROLES.SUPER_ADMIN, SYSTEM_ROLES.ADMINISTRATOR]}
      fallback={
        <ContentLayout title="Recruitment Need Signal — Admin">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Recruitment-need configuration is restricted to administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Recruitment Need Signal — Admin">
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2">
            <Signal className="h-6 w-6 shrink-0 text-primary" />
            <h1 className="text-2xl font-semibold">
              Recruitment Need Signal — Configuration
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Foundation data that feeds the 7-input composite recruitment need
            score. Changes here affect signal computation across all
            institutions.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <ActionCard key={card.href} {...card} />
          ))}
        </div>
      </div>
    </ContentLayout>
    </AdminPermissionGuard>
  );
}

function ActionCard({ href, icon: Icon, title, description }: ActionCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary hover:bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
