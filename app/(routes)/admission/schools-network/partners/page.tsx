'use client';

/**
 * Program Partners — list page.
 *
 * Partners (CSR / grant / corporate / govt foundation) that fund or co-deliver
 * sessions and contributions in the schools network.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Handshake,
  Plus,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Globe,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';

import { listPartners } from '../_lib/api';
import { PARTNER_STATUS_LABEL, type ProgramPartner, type ProgramPartnerStatus } from '../_lib/types';

const PAGE_SIZE = 25;
const STATUSES: ProgramPartnerStatus[] = ['active', 'sustaining', 'dormant'];

function PartnersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  const opts = {
    search: searchParams.get('search') || undefined,
    status: searchParams.get('status') || undefined,
    limit: PAGE_SIZE,
    offset: (currentPage - 1) * PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['schools-network', 'partners', opts],
    queryFn: () => listPartners(opts),
    placeholderData: (prev) => prev,
  });

  const partners: ProgramPartner[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const updateParams = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'all') p.delete(k);
      else p.set(k, v);
    }
    if (!('page' in patch)) p.delete('page');
    router.push(`?${p.toString()}`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search partner name…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && updateParams({ search: searchTerm })}
                />
              </div>
            </div>
            <Select
              value={searchParams.get('status') || 'all'}
              onValueChange={(v) => updateParams({ status: v })}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PARTNER_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => updateParams({ search: searchTerm })}>
              <Filter className="h-4 w-4 mr-2" /> Apply
            </Button>
            {(searchParams.get('search') || searchParams.get('status')) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearchTerm('');
                  router.push('/admission/schools-network/partners');
                }}
              >
                <X className="h-4 w-4 mr-2" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5" /> Program Partners
          </CardTitle>
          <PermissionGuard module="schools_network.partners" action="manage" fallback={null}>
            <Link href="/admission/schools-network/partners/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" /> Add Partner
              </Button>
            </Link>
          </PermissionGuard>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : partners.length === 0 ? (
            <div className="text-center py-12">
              <Handshake className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No partners yet</h3>
              <p className="text-muted-foreground mb-4">
                Add a CSR partner, grant, corporate sponsor, or government foundation
                that funds or co-delivers your school programs.
              </p>
              <PermissionGuard module="schools_network.partners" action="manage" fallback={null}>
                <Link href="/admission/schools-network/partners/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" /> Add the first partner
                  </Button>
                </Link>
              </PermissionGuard>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link
                          href={`/admission/schools-network/partners/${p.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.websiteUrl && (
                          <a
                            href={p.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Globe className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {p.typeLabel ?? p.typeCode ?? '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          {p.contactPerson && <div>{p.contactPerson}</div>}
                          {p.contactEmail && (
                            <a
                              href={`mailto:${p.contactEmail}`}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Mail className="h-3 w-3" />
                              {p.contactEmail}
                            </a>
                          )}
                          {p.contactPhone && (
                            <a
                              href={`tel:${p.contactPhone}`}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {p.contactPhone}
                            </a>
                          )}
                          {!p.contactPerson && !p.contactEmail && !p.contactPhone && '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge>{PARTNER_STATUS_LABEL[p.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                    {Math.min(currentPage * PAGE_SIZE, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateParams({ page: String(currentPage - 1) })}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateParams({ page: String(currentPage + 1) })}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PartnersPage() {
  return (
    <PermissionGuard module="schools_network.partners" action="view">
      <ContentLayout title="Program Partners">
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
              <BreadcrumbPage>Partners</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <PartnersContent />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
