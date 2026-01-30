'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
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
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit2,
  Archive,
  PlayCircle,
  Building2,
  Users,
  User,
  Target,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useObjectives, useArchiveObjective, useActivateObjective } from '@/hooks/okr/use-objectives';
import { OKRTier, OKRLevel, OKRStatus, OKRObjectiveFilters } from '@/types/okr';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Design Rationale: Industrial/utilitarian aesthetic with data-dense table layout
// JKKN brand colors with clear visual hierarchy through tier/level badges

// Tier badge configuration with section counts
const tierConfig: Record<OKRTier, { label: string; shortLabel: string; sections: number; className: string }> = {
  tier_1: { label: 'TIER 1 (Full - 11 Sections)', shortLabel: 'TIER 1', sections: 11, className: 'bg-emerald-900 text-emerald-100 border-emerald-700' },
  tier_2: { label: 'TIER 2 (Core - 6 Sections)', shortLabel: 'TIER 2', sections: 6, className: 'bg-blue-900 text-blue-100 border-blue-700' },
  tier_3: { label: 'TIER 3 (Simple - 3 Sections)', shortLabel: 'TIER 3', sections: 3, className: 'bg-violet-900 text-violet-100 border-violet-700' }
};

// Level badge configuration with icons
const levelConfig: Record<OKRLevel, { label: string; icon: typeof Building2; className: string }> = {
  organization: { label: 'JKKN Group', icon: Building2, className: 'text-green-400' },
  institution: { label: 'Institution', icon: Building2, className: 'text-amber-400' },
  department: { label: 'Department', icon: Users, className: 'text-sky-400' },
  individual: { label: 'Individual', icon: User, className: 'text-rose-400' }
};

// Status badge configuration
const statusConfig: Record<OKRStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-700 text-slate-200' },
  active: { label: 'Active', className: 'bg-green-700 text-green-100' },
  completed: { label: 'Completed', className: 'bg-blue-700 text-blue-100' },
  archived: { label: 'Archived', className: 'bg-gray-600 text-gray-300' }
};

export default function OKRManagePage() {
  // Filters state
  const [filters, setFilters] = useState<OKRObjectiveFilters>({
    page: 1,
    limit: 10
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Data fetching
  const { data, isLoading, error } = useObjectives({
    ...filters,
    search: searchQuery || undefined
  });

  // Mutations
  const archiveMutation = useArchiveObjective();
  const activateMutation = useActivateObjective();

  // Handlers
  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this objective?')) return;
    try {
      await archiveMutation.mutateAsync(id);
      toast.success('Objective archived successfully');
    } catch {
      toast.error('Failed to archive objective');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await activateMutation.mutateAsync(id);
      toast.success('Objective activated successfully');
    } catch {
      toast.error('Failed to activate objective');
    }
  };

  const handleFilterChange = (key: keyof OKRObjectiveFilters, value: string | number | undefined) => {
    setFilters(prev => {
      const newFilters = {
        ...prev,
        [key]: value === 'all' ? undefined : value,
        page: 1 // Reset to first page on filter change
      };

      // Auto-restrict tier to tier_1 when level is 'organization' (org OKRs are always Tier 1)
      if (key === 'level' && value === 'organization') {
        newFilters.tier = 'tier_1' as OKRTier;
      }

      return newFilters;
    });
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  return (
    <ContentLayout title="Organization OKRs">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Organization OKRs</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage strategic objectives for institutions, departments, and individuals
            </p>
          </div>
          <Button asChild style={{ backgroundColor: '#0b6d41' }} className="hover:opacity-90">
            <Link href="/okr/objectives/create">
              <Plus className="h-4 w-4 mr-2" />
              Create Objective
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-slate-800">
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search objectives..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900/50"
                />
              </div>

              {/* Filter dropdowns */}
              <div className="flex flex-wrap items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />

                {/* Tier filter - disabled when level is organization (always Tier 1) */}
                <Select
                  value={filters.tier || 'all'}
                  onValueChange={(v) => handleFilterChange('tier', v === 'all' ? undefined : v as OKRTier)}
                  disabled={filters.level === 'organization'}
                >
                  <SelectTrigger className={cn("w-[180px] bg-slate-900/50", filters.level === 'organization' && "opacity-60")}>
                    <SelectValue placeholder="All Tiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="tier_1">Tier 1 - Full (11 Sections)</SelectItem>
                    <SelectItem value="tier_2">Tier 2 - Core (6 Sections)</SelectItem>
                    <SelectItem value="tier_3">Tier 3 - Simple (3 Sections)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Level filter */}
                <Select
                  value={filters.level || 'all'}
                  onValueChange={(v) => handleFilterChange('level', v === 'all' ? undefined : v as OKRLevel)}
                >
                  <SelectTrigger className="w-[140px] bg-slate-900/50">
                    <SelectValue placeholder="All Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="institution">Institution</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>

                {/* Status filter */}
                <Select
                  value={filters.status || 'all'}
                  onValueChange={(v) => handleFilterChange('status', v === 'all' ? undefined : v as OKRStatus)}
                >
                  <SelectTrigger className="w-[130px] bg-slate-900/50">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-800">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="p-12 text-center">
                <p className="text-destructive">Failed to load objectives</p>
                <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : data?.data.length === 0 ? (
              <div className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-lg font-medium">No objectives found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || filters.tier || filters.level || filters.status
                    ? 'Try adjusting your filters'
                    : 'Create your first organization objective'}
                </p>
                <Button asChild className="mt-4" style={{ backgroundColor: '#0b6d41' }}>
                  <Link href="/okr/objectives/create">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Objective
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="w-[400px]">Objective</TableHead>
                      <TableHead className="w-[100px]">Tier</TableHead>
                      <TableHead className="w-[120px]">Level</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="w-[150px]">Progress</TableHead>
                      <TableHead className="w-[150px]">Owner</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.data.map((objective) => {
                      const LevelIcon = levelConfig[objective.level].icon;
                      return (
                        <TableRow
                          key={objective.id}
                          className="border-slate-800 hover:bg-slate-900/50 transition-colors"
                        >
                          <TableCell>
                            <Link
                              href={`/okr/objectives/${objective.id}`}
                              className="block hover:text-[#0b6d41] transition-colors"
                            >
                              <p className="font-medium line-clamp-1">{objective.title}</p>
                              {objective.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {objective.description}
                                </p>
                              )}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn('text-xs font-mono', tierConfig[objective.tier].className)}
                              >
                                {tierConfig[objective.tier].shortLabel}
                              </Badge>
                              <span
                                className="text-[10px] text-muted-foreground"
                                title={`${tierConfig[objective.tier].sections} sections`}
                              >
                                ({tierConfig[objective.tier].sections}s)
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <LevelIcon className={cn('h-3.5 w-3.5', levelConfig[objective.level].className)} />
                              <span className="text-sm">{levelConfig[objective.level].label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-xs', statusConfig[objective.status].className)}>
                              {statusConfig[objective.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={objective.overall_progress}
                                className="h-2 flex-1"
                              />
                              <span className="text-xs font-mono w-10 text-right">
                                {objective.overall_progress}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm truncate block max-w-[140px]">
                              {objective.owner?.full_name || 'Unknown'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/okr/objectives/${objective.id}`}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/okr/objectives/${objective.id}/edit`}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Edit
                                  </Link>
                                </DropdownMenuItem>
                                {objective.status === 'draft' && (
                                  <DropdownMenuItem onClick={() => handleActivate(objective.id)}>
                                    <PlayCircle className="h-4 w-4 mr-2" />
                                    Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleArchive(objective.id)}
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {data && data.metadata.totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
                    <p className="text-sm text-muted-foreground">
                      Showing {((data.metadata.page - 1) * data.metadata.limit) + 1} to{' '}
                      {Math.min(data.metadata.page * data.metadata.limit, data.metadata.total)} of{' '}
                      {data.metadata.total} objectives
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(data.metadata.page - 1)}
                        disabled={data.metadata.page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2">
                        Page {data.metadata.page} of {data.metadata.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(data.metadata.page + 1)}
                        disabled={data.metadata.page >= data.metadata.totalPages}
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
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
