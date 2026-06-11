'use client';

// ============================================
// /admission/consultants/admin — Consultant Admin landing hub
// ============================================
// Landing page for the consultant admin/policy cluster, relocated from
// /admin/consultants/* on 2026-06-10 ("one module = one URL prefix").
// Surfaces the 3 sub-pages as cards so users land somewhere coherent
// when they navigate to the bare /admission/consultants/admin URL
// (and so the 307 redirect from the old /admin/consultants resolves).
//
// Sub-modules wired into this hub:
//   Tier Policy, Commission Triggers, Portal Access Policy
//
// Pattern: mirrors /admin/counselors/page.tsx (PR #1026 hub-page fix).
// ============================================

export const navMeta = { label: 'Consultant Admin', icon: 'Settings' } as const;

import Link from 'next/link';
import { Award, Coins, KeyRound, ChevronRight } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface ModuleCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const CONSULTANT_ADMIN_MODULES: ModuleCard[] = [
  {
    href: '/admission/consultants/admin/tier-policy',
    title: 'Tier Policy',
    description:
      'Bronze → silver → gold → platinum → diamond ladder for education consultants. Edit conversion thresholds globally or per institution.',
    icon: Award,
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/admission/consultants/admin/commission-triggers',
    title: 'Commission Triggers',
    description:
      'Which lead/admission status transitions fire a consultant commission, and at what amount.',
    icon: Coins,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    href: '/admission/consultants/admin/portal-access',
    title: 'Portal Access Policy',
    description:
      'Role allowlist that controls who can enter the consultant portal and who can preview as a consultant.',
    icon: KeyRound,
    color: 'text-blue-600 bg-blue-50',
  },
];

export default function ConsultantAdminLandingPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Consultant Admin">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Consultant Administration">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Consultant Administration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tier ladder, commission triggers, and portal access policy for the
              education-consultant channel.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CONSULTANT_ADMIN_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className="block group"
                  aria-label={`Open ${mod.title}`}
                >
                  <Card className="h-full transition hover:shadow-md hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className={`p-2 rounded-lg ${mod.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition mt-2" />
                      </div>
                      <CardTitle className="text-base mt-3">{mod.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm">
                        {mod.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
