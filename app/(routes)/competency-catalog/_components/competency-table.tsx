'use client';

// ============================================================================
// Competency Data Table Component
// Displays competencies with sorting, filtering, and actions
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import {
  Eye,
  Pencil,
  Archive,
  RotateCcw,
  MoreHorizontal,
  ArrowUpDown,
  Search,
  Filter,
  Plus
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Types
import type {
  Competency,
  CompetencyType,
  CompetencyFilters
} from '@/types/competency';

// Hooks
import {
  useCompetencies,
  useArchiveCompetency,
  useRestoreCompetency
} from '@/hooks/competency';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { toast } from 'sonner';

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_BADGES: Record<CompetencyType, { label: string; color: string }> = {
  technical: { label: 'Technical', color: 'bg-blue-100 text-blue-800' },
  behavioral: { label: 'Behavioral', color: 'bg-purple-100 text-purple-800' },
  domain: { label: 'Domain', color: 'bg-amber-100 text-amber-800' },
  soft_skill: { label: 'Soft Skill', color: 'bg-emerald-100 text-emerald-800' },
  metacognitive: { label: 'Metacognitive', color: 'bg-pink-100 text-pink-800' }
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CompetencyTable() {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  // DEBUG: Log institution access info

  // Filter state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CompetencyType | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'competency_code' | 'competency_name' | 'created_at'>('competency_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Archive dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [selectedCompetency, setSelectedCompetency] = useState<Competency | null>(null);

  // Build filters
  const filters: CompetencyFilters = {
    institution_id: institutionId,
    search: search || undefined,
    competency_type: typeFilter !== 'all' ? typeFilter : undefined,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
    page,
    limit: 10,
    sort_by: sortBy,
    sort_order: sortOrder
  };

  // Fetch data - hooks must always be called, so we rely on 'enabled' in the hook
  const { data, isLoading, error } = useCompetencies(filters);
  const archiveMutation = useArchiveCompetency();
  const restoreMutation = useRestoreCompetency();

  const competencies = data?.data || [];
  const metadata = data?.metadata;

  // Handlers
  const handleSort = (column: 'competency_code' | 'competency_name' | 'created_at') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleArchive = async () => {
    if (!selectedCompetency) return;

    try {
      await archiveMutation.mutateAsync(selectedCompetency.id);
      toast.success('Competency archived successfully');
      setArchiveDialogOpen(false);
      setSelectedCompetency(null);
    } catch (err) {
      toast.error('Failed to archive competency');
    }
  };

  const handleRestore = async (competency: Competency) => {
    try {
      await restoreMutation.mutateAsync(competency.id);
      toast.success('Competency restored successfully');
    } catch (err) {
      toast.error('Failed to restore competency');
    }
  };

  const openArchiveDialog = (competency: Competency) => {
    setSelectedCompetency(competency);
    setArchiveDialogOpen(true);
  };

  // Loading state - check both institutions loading and data loading
  if (institutionsLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!institutionId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No institution selected</p>
          <p className="text-sm text-muted-foreground mt-2">
            Please ensure you have access to at least one institution.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Competency Catalog</h2>
          <p className="text-sm text-muted-foreground">
            Manage skills and learning targets for your institution
          </p>
        </div>
        <Button asChild style={{ backgroundColor: '#0b6d41' }}>
          <Link href="/competency-catalog/new">
            <Plus className="h-4 w-4 mr-2" />
            Add Competency
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            {/* Type Filter */}
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as CompetencyType | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_BADGES).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Active Filter */}
            <Select
              value={activeFilter}
              onValueChange={(v) => {
                setActiveFilter(v as 'all' | 'active' | 'inactive');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-destructive">Failed to load competencies</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          ) : competencies.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No competencies found</p>
              {search && (
                <Button
                  variant="link"
                  onClick={() => setSearch('')}
                  className="mt-2"
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('competency_code')}
                  >
                    <div className="flex items-center gap-1">
                      Code
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort('competency_name')}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Levels</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competencies.map((competency) => (
                  <TableRow key={competency.id}>
                    <TableCell className="font-mono text-sm">
                      {competency.competency_code}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/competency-catalog/${competency.id}`}
                        className="font-medium hover:underline"
                      >
                        {competency.competency_name}
                      </Link>
                      {competency.industry_tags?.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {competency.industry_tags.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {competency.industry_tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{competency.industry_tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={TYPE_BADGES[competency.competency_type].color}>
                        {TYPE_BADGES[competency.competency_type].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {competency.proficiency_levels?.length || 0} levels
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {competency.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-800">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Archived</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={`/competency-catalog/${competency.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/competency-catalog/${competency.id}/edit`}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {competency.is_active ? (
                            <DropdownMenuItem
                              onClick={() => openArchiveDialog(competency)}
                              className="text-destructive"
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleRestore(competency)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {metadata && metadata.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, metadata.total)} of {metadata.total} results
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(metadata.totalPages, p + 1))}
                  disabled={page === metadata.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Competency</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive "{selectedCompetency?.competency_name}"?
              Archived competencies will not appear in selection lists but existing
              learner progress will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
