'use client';

// app/(routes)/admission/settings/lookups/page.tsx
// Landing page for admission lookups — 2x2 grid of cards.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Tag,
  Users2,
  Building2,
  SearchCheck,
  ArrowRight,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { DqrService } from '@/lib/services/admission/dqr-service';

interface LookupCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: React.ReactNode;
}

function LookupCard({ href, icon, title, description, badge }: LookupCardProps) {
  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-shadow group-hover:shadow-md group-hover:border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
            <div className="flex items-center gap-2">
              {badge}
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}

function LookupsLandingContent() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const count = await DqrService.pendingCount();
        if (!cancelled) setPendingCount(count);
      } catch {
        // Silent: badge just shows nothing on error.
        if (!cancelled) setPendingCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="Lookups">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/settings">Settings</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Lookups</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <p className="text-sm text-muted-foreground">
              Canonical lookup catalogues that anchor admission fee structures and lead
              allocation. Maintain the values here, and review observed-but-unmapped
              entries from production data.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LookupCard
              href="/admission/settings/lookups/quotas"
              icon={<Tag className="h-5 w-5" />}
              title="Quotas"
              description="Government, management, NRI, lateral entry, and other admission quotas (global)."
            />
            <LookupCard
              href="/admission/settings/lookups/community-categories"
              icon={<Users2 className="h-5 w-5" />}
              title="Community Categories"
              description="OC, BC, MBC, SC, ST and other community classifications (global)."
            />
            <LookupCard
              href="/admission/settings/lookups/accommodation-types"
              icon={<Building2 className="h-5 w-5" />}
              title="Accommodation Types"
              description="Hostel, day scholar, PG, etc. — scoped per institution."
            />
            <LookupCard
              href="/admission/settings/lookups/data-quality"
              icon={<SearchCheck className="h-5 w-5" />}
              title="Data Quality Review"
              description="Map observed lookup values from production data to canonical entries."
              badge={
                pendingCount !== null && pendingCount > 0 ? (
                  <Badge variant="destructive">{pendingCount} pending</Badge>
                ) : pendingCount === 0 ? (
                  <Badge variant="outline">Clear</Badge>
                ) : null
              }
            />
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function LookupsLandingPage() {
  return (
    <AdmissionErrorBoundary>
      <LookupsLandingContent />
    </AdmissionErrorBoundary>
  );
}
