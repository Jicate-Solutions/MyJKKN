'use client';

// fee-structures-list-view.tsx
//
// Main list view for /admission/settings/fees-structure. Renders filters
// (institution, admission_year, status, search), a table of all structures
// the user has access to, and a "+ New Fee Structure" action button.
// Row actions: View / Edit / Clone / Archive.
//
// Uses @/components/ui/table directly rather than the heavyweight DataTable
// because the dataset is bounded (admin-configured structures, low N) and
// the simple manual table keeps logic close to the data shape.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { FeeStructureRowActions } from './fee-structures-row-actions';
import type { AdmissionFeeStructure } from '@/types/admission';

type StructureRow = AdmissionFeeStructure & {
  institution_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  programme_name: string | null;
  quota_name: string | null;
  community_name: string | null;
  accommodation_name: string | null;
  admission_year_name: string | null;
  item_count: number;
};

export function FeeStructuresListView() {
  const router = useRouter();
  const { institutions } = useInstitutionsWithAccess();

  const [structures, setStructures] = useState<StructureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    FeeStructureService.listAll({
      institution_id: institutionFilter === 'all' ? undefined : institutionFilter,
      status: statusFilter === 'all' ? undefined : (statusFilter as 'draft' | 'active' | 'archived'),
      search: search.trim() || undefined,
    })
      .then((rows) => setStructures(rows))
      .finally(() => setLoading(false));
  }, [institutionFilter, statusFilter, search, refreshTick]);

  const handleResetFilters = () => {
    setInstitutionFilter('all');
    setStatusFilter('all');
    setSearch('');
  };

  const handleRowChanged = () => setRefreshTick((t) => t + 1);

  return (
    <div className="space-y-4">
      {/* Filter bar + new button */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Institution filter */}
          <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="All institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All institutions</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {(institutionFilter !== 'all' || statusFilter !== 'all' || search) && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          )}
        </div>

        <Button asChild size="sm">
          <Link href="/admission/settings/fees-structure/new">
            <Plus className="h-4 w-4 mr-1" />
            New Fee Structure
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Quota</TableHead>
              <TableHead>Community</TableHead>
              <TableHead>Accommodation</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && structures.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No fee structures found.</p>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admission/settings/fees-structure/new">
                        <Plus className="h-4 w-4 mr-1" />
                        Create your first fee structure
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              structures.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admission/settings/fees-structure/${s.id}`)}
                >
                  <TableCell className="font-medium max-w-xs truncate">{s.name}</TableCell>
                  <TableCell className="text-sm">{s.institution_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{s.programme_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{s.admission_year_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{s.quota_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{s.community_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{s.accommodation_name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.item_count}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.status === 'active'
                          ? 'default'
                          : s.status === 'draft'
                          ? 'secondary'
                          : 'outline'
                      }
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <FeeStructureRowActions structure={s} onChanged={handleRowChanged} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {!loading && structures.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {structures.length} structure{structures.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
