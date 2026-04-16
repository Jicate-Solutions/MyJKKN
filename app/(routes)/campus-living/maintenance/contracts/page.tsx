'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileSignature,
  Plus,
  Search,
  Loader2,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAmcContracts } from '@/hooks/campus-living/use-hostel-amc-contracts';

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

function contractStatus(expiryDate: string | null | undefined): {
  label: string;
  className: string;
  icon: React.ReactNode;
} {
  const d = daysUntil(expiryDate);
  if (d === null) {
    return {
      label: 'No Expiry',
      className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
      icon: <CalendarDays className="mr-1 h-3 w-3" />,
    };
  }
  if (d < 0) {
    return {
      label: 'Expired',
      className: 'bg-red-100 text-red-800 hover:bg-red-100',
      icon: <AlertTriangle className="mr-1 h-3 w-3" />,
    };
  }
  if (d <= 30) {
    return {
      label: `Expires in ${d}d`,
      className: 'bg-red-100 text-red-800 hover:bg-red-100',
      icon: <AlertTriangle className="mr-1 h-3 w-3" />,
    };
  }
  if (d <= 90) {
    return {
      label: `Expires in ${d}d`,
      className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      icon: <AlertTriangle className="mr-1 h-3 w-3" />,
    };
  }
  return {
    label: `${d}d left`,
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
    icon: <CheckCircle2 className="mr-1 h-3 w-3" />,
  };
}

export default function CampusLivingAMCContractsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useAmcContracts(institutionId);
  const contracts = data ?? [];

  const filtered = contracts.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.name ?? '').toLowerCase().includes(q) ||
      (c.vendor_name ?? '').toLowerCase().includes(q) ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((c.sub_category as any)?.name ?? '').toLowerCase().includes(q) ||
      (c.block_number ?? '').toLowerCase().includes(q) ||
      (c.room_number ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    let total = 0;
    let d30 = 0;
    let d90 = 0;
    let expired = 0;
    for (const c of contracts) {
      total += 1;
      const d = daysUntil(c.warranty_expiry_date);
      if (d === null) continue;
      if (d < 0) expired += 1;
      else if (d <= 30) d30 += 1;
      else if (d <= 90) d90 += 1;
    }
    return { total, d30, d90, expired };
  }, [contracts]);

  const locationLabel = (
    block?: string | null,
    room?: string | null,
    floor?: string | null,
  ) => {
    const parts = [block, floor, room].filter(Boolean);
    return parts.length ? parts.join(' / ') : '—';
  };

  return (
    <ContentLayout title="AMC Contracts">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Maintenance', href: '/campus-living/maintenance' },
          { label: 'AMC Contracts' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileSignature className="h-6 w-6 text-primary" />
              AMC Contracts
            </h1>
            <p className="text-muted-foreground">
              Annual Maintenance Contracts for hostel infrastructure resources —
              driven by the Resource Management catalog.
            </p>
          </div>
          <Button asChild>
            <a href="/resource-management">
              <Plus className="mr-2 h-4 w-4" />
              Add Resource
            </a>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Contracts</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-red-600">Expiring ≤ 30 days</p>
              <p className="text-2xl font-bold text-red-700">{stats.d30}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-amber-600">Expiring ≤ 90 days</p>
              <p className="text-2xl font-bold text-amber-700">{stats.d90}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50/30">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-slate-600">Expired</p>
              <p className="text-2xl font-bold text-slate-700">{stats.expired}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by resource, vendor, category, block…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <FileSignature className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No AMC contracts yet</h3>
                <p className="text-sm text-muted-foreground">
                  No AMC contracts yet — add a hostel infrastructure resource with
                  vendor details.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Block / Room</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Contract Expiry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Contract Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const st = contractStatus(c.warranty_expiry_date);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const subCatName = (c.sub_category as any)?.name ?? '—';
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {c.name}
                          {c.resource_code ? (
                            <span className="block font-mono text-xs text-muted-foreground">
                              {c.resource_code}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{subCatName}</TableCell>
                        <TableCell className="text-sm">
                          {locationLabel(c.block_number, c.room_number, c.floor_number)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.vendor_name ?? '—'}
                          {c.vendor_support_contact ? (
                            <span className="block text-xs text-muted-foreground">
                              {c.vendor_support_contact}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.warranty_expiry_date
                            ? new Date(c.warranty_expiry_date).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={st.className}>
                            {st.icon}
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
                          {c.vendor_contract_details ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
