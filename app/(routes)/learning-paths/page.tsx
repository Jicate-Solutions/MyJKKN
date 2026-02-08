'use client';

// ============================================================================
// Learning Paths - List Page
// Shows all learning paths with filters, search, and pagination
// ============================================================================

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Plus,
  Route,
  TrendingUp,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Pencil,
  Archive,
  Trash2,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { BeatLoader } from 'react-spinners';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useLearningPaths,
  useArchiveLearningPath,
  useDeleteLearningPath,
} from '@/hooks/learning-path';
import { toast } from 'sonner';
import type {
  LearningPathStatus,
  LearningPathFilters,
} from '@/types/learning-path';
import {
  PATH_STATUS_LABELS,
  PATH_STATUS_COLORS,
} from '@/types/learning-path';

export default function LearningPathsPage() {
  const { canAccess, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LearningPathStatus | 'all'>('all');
  const [page, setPage] = useState(1);

  const archiveMutation = useArchiveLearningPath();
  const deleteMutation = useDeleteLearningPath();

  // Build filters
  const filters: LearningPathFilters = useMemo(
    () => ({
      institution_id: institutionId,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      page,
      limit: 10,
      sort_by: 'created_at' as const,
      sort_order: 'desc' as const,
    }),
    [institutionId, search, statusFilter, page]
  );

  const { data, isLoading, error, refetch } = useLearningPaths(filters);

  const paths = data?.data || [];
  const metadata = data?.metadata || { total: 0, page: 1, limit: 10, totalPages: 1 };
  const loading = isLoading || institutionsLoading;

  const canView = isSuperAdmin || canAccess('learning_paths', 'view');
  const canCreate = isSuperAdmin || canAccess('learning_paths', 'create');

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast.success('Learning path archived');
    } catch {
      toast.error('Failed to archive learning path');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success('Learning path deleted');
    } catch {
      toast.error('Failed to delete learning path');
    }
  };

  if (permissionsLoading || institutionsLoading) {
    return (
      <ContentLayout title="Learning Paths">
        <div className="flex items-center justify-center min-h-[400px]">
          <BeatLoader color="#00e902" />
        </div>
      </ContentLayout>
    );
  }

  if (!canView) {
    return (
      <ContentLayout title="Learning Paths">
        <div className="text-center py-8">
          <p className="text-destructive">
            You don&apos;t have permission to view learning paths.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Learning Paths">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Learning Paths</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Learning Paths</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Personalized learning journeys with competency targets and step tracking
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {canCreate ? (
              <Button className="w-full sm:w-auto" asChild>
                <Link href="/learning-paths/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Path
                </Link>
              </Button>
            ) : (
              <Button className="w-full sm:w-auto opacity-50" disabled variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Create Path
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paths</CardTitle>
              <Route className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metadata.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {paths.filter((p) => p.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {paths.filter((p) => p.status === 'completed').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & List */}
        <Card>
          <CardContent className="p-6">
            {/* Search and Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search paths by title, role, or description..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val as LearningPathStatus | 'all');
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading */}
            {loading ? (
              <div className="flex justify-center items-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-destructive">{error.message}</p>
                <Button variant="outline" onClick={() => refetch()} className="mt-4">
                  Try Again
                </Button>
              </div>
            ) : paths.length === 0 ? (
              <div className="text-center py-12">
                <Route className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No learning paths found</h3>
                <p className="text-muted-foreground mb-4">
                  {search || statusFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'Create your first learning path to get started'}
                </p>
                {canCreate && !search && statusFilter === 'all' && (
                  <Button asChild>
                    <Link href="/learning-paths/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Path
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Path Cards */}
                <div className="space-y-4">
                  {paths.map((path) => (
                    <div
                      key={path.id}
                      className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Link
                              href={`/learning-paths/${path.id}`}
                              className="text-lg font-semibold hover:text-primary transition-colors truncate"
                            >
                              {path.title}
                            </Link>
                            <Badge className={PATH_STATUS_COLORS[path.status]}>
                              {PATH_STATUS_LABELS[path.status]}
                            </Badge>
                            {path.is_ai_generated && (
                              <Badge variant="outline" className="text-xs">
                                AI Generated
                              </Badge>
                            )}
                          </div>
                          {path.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                              {path.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            {path.target_role && <span>Role: {path.target_role}</span>}
                            {path.target_industry && (
                              <span>Industry: {path.target_industry}</span>
                            )}
                            {path.estimated_duration_weeks && (
                              <span>{path.estimated_duration_weeks} weeks</span>
                            )}
                            <span>
                              Created {format(new Date(path.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="ml-2 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/learning-paths/${path.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/learning-paths/${path.id}/edit`}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            {path.status !== 'archived' && (
                              <DropdownMenuItem onClick={() => handleArchive(path.id)}>
                                <Archive className="mr-2 h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Learning Path</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this learning path and all its
                                    steps. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(path.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">
                            {Math.round(path.current_progress ?? 0)}%
                          </span>
                        </div>
                        <Progress value={path.current_progress || 0} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {metadata.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(metadata.page - 1) * metadata.limit + 1}-
                      {Math.min(metadata.page * metadata.limit, metadata.total)} of{' '}
                      {metadata.total}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(metadata.totalPages, p + 1))}
                        disabled={page >= metadata.totalPages}
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
    </ContentLayout>
  );
}
