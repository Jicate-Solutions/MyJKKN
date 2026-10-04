'use client';

/**
 * /cdc/drives/[id]/registrations — people who registered through the drive's
 * public link (/dr/<token>), with the Excel download. Team-only
 * (cdc.drives.view); data comes from GET /api/cdc/drives/[id]/public-registration.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { Download, Search, Users } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  cdcDrivePublicRegistrationsExportUrl,
  useCdcDrive,
  useCdcDrivePublicRegistration,
} from '@/hooks/cdc/use-cdc-drives';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { TablePager, usePager } from '../../_components/table-pager';

export default function CdcDriveRegistrationsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { data: detail } = useCdcDrive(id);
  const { data, isLoading, error } = useCdcDrivePublicRegistration(id);
  const drive = detail?.data;
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const all = data?.registrations ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      [r.full_name, r.email, r.mobile, r.register_number, r.institution_name, r.program_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);
  const pager = usePager(rows, 50);
  const total = data?.registrations.length ?? 0;

  return (
    <PermissionGuard module="cdc.drives" action="view">
      <ContentLayout title="Public registrations">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/cdc/drives">Drives</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/cdc/drives/${id}`}>{drive?.title ?? 'Drive'}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Registrations</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                {drive?.title ?? 'Drive'}
              </h1>
              <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                {drive ? <DriveStatusBadge status={drive.status} /> : null}
                <span>
                  {total} public registration{total === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            {total > 0 ? (
              <Button asChild>
                <a href={cdcDrivePublicRegistrationsExportUrl(id)}>
                  <Download className="h-4 w-4 mr-2" /> Download Excel
                </a>
              </Button>
            ) : (
              <Button disabled title="No registrations to export">
                <Download className="h-4 w-4 mr-2" /> Download Excel
              </Button>
            )}
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, mobile, email, institution…"
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading registrations…</p>
              ) : error ? (
                <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Could not load registrations.'}</p>
              ) : data?.available === false ? (
                <p className="p-6 text-sm text-muted-foreground">{data.error}</p>
              ) : rows.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {total === 0 ? 'Nobody has registered through the public link yet.' : 'No registrations match the search.'}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Mobile</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Institution</TableHead>
                          <TableHead>Program</TableHead>
                          <TableHead>Sem</TableHead>
                          <TableHead>CGPA</TableHead>
                          <TableHead>Arrears</TableHead>
                          <TableHead>Audience</TableHead>
                          <TableHead>Registered</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pager.pageRows.map((r, i) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-muted-foreground">{pager.pageStart + i + 1}</TableCell>
                            <TableCell className="font-medium">
                              {r.full_name}
                              {r.register_number ? <div className="text-xs text-muted-foreground">{r.register_number}</div> : null}
                            </TableCell>
                            <TableCell>{r.gender}</TableCell>
                            <TableCell>{r.mobile}</TableCell>
                            <TableCell>{r.email}</TableCell>
                            <TableCell>{r.institution_name}</TableCell>
                            <TableCell>{r.program_name}</TableCell>
                            <TableCell>{r.semester ?? '—'}</TableCell>
                            <TableCell>{r.cgpa ?? '—'}</TableCell>
                            <TableCell>{r.arrears ?? '—'}</TableCell>
                            <TableCell>
                              {r.in_audience === true ? (
                                <Badge>In audience</Badge>
                              ) : r.in_audience === false ? (
                                <Badge variant="destructive">Outside audience</Badge>
                              ) : r.learner_id ? (
                                <Badge variant="secondary">JKKN learner</Badge>
                              ) : (
                                <Badge variant="outline">Not matched</Badge>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Kolkata',
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePager pager={pager} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
