'use client';

/**
 * Program Partner detail — rollup dashboard (per spec §7.9 / fn_program_partner_rollup).
 *
 * Shows totals (schools touched, sessions, attendees, contributions, grants)
 * for the signed-in viewer (server-side RLS scopes results to what they can see).
 */

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Calendar as CalendarIcon,
  Gift,
  Globe,
  Handshake,
  Mail,
  Phone,
  Users,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { getPartnerRollup } from '../../_lib/api';
import { PARTNER_STATUS_LABEL, formatInr } from '../../_lib/types';

function PartnerDetailContent({ partnerId }: { partnerId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['schools-network', 'partner-rollup', partnerId],
    queryFn: () => getPartnerRollup(partnerId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <Handshake className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2">Partner not found</h3>
        <p className="text-muted-foreground mb-4">
          {(error as Error | undefined)?.message ?? 'No data returned.'}
        </p>
        <Link href="/admission/schools-network/partners">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Partners
          </Button>
        </Link>
      </div>
    );
  }

  const { partner, rollup } = data;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-2xl font-bold">{partner.name}</h2>
          <Badge variant="secondary">{partner.typeLabel ?? partner.typeCode ?? '—'}</Badge>
          <Badge>{PARTNER_STATUS_LABEL[partner.status]}</Badge>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {partner.contactPerson && <span>{partner.contactPerson}</span>}
          {partner.contactEmail && (
            <a
              href={`mailto:${partner.contactEmail}`}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Mail className="h-3 w-3" /> {partner.contactEmail}
            </a>
          )}
          {partner.contactPhone && (
            <a
              href={`tel:${partner.contactPhone}`}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="h-3 w-3" /> {partner.contactPhone}
            </a>
          )}
          {partner.websiteUrl && (
            <a
              href={partner.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Globe className="h-3 w-3" /> {partner.websiteUrl}
            </a>
          )}
        </div>
      </div>

      {/* Rollup */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Schools Touched</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rollup.schoolsTouched}</div>
            <p className="text-xs text-muted-foreground">In the network</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rollup.sessionsCount}</div>
            <p className="text-xs text-muted-foreground">
              {rollup.attendeesTotal.toLocaleString('en-IN')} attendees
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contributions</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInr(rollup.contributionsInr)}
            </div>
            <p className="text-xs text-muted-foreground">
              {rollup.contributionsCount} item{rollup.contributionsCount === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Grants Received</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInr(rollup.grantsReceivedInr)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatInr(rollup.grantsOutstandingInr)} outstanding
            </p>
          </CardContent>
        </Card>
      </div>

      {partner.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
            <CardDescription>Free-text notes about this partner</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{partner.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ partnerId: string }>();
  const partnerId = params?.partnerId ?? '';

  return (
    <PermissionGuard module="schools_network.partners" action="view">
      <ContentLayout title="Program Partner">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network/partners">
                Partners
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Detail</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <PartnerDetailContent partnerId={partnerId} />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
