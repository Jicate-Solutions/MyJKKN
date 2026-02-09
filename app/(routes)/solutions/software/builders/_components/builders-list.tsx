'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Search,
  Plus,
  Filter,
  Users,
  Star,
  FolderKanban,
  Code2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useBuilders, useBuilderStats } from '@/hooks/solutions/use-builders';
import { useDebounceValue } from '@/hooks/use-debounce-value';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BuildersList() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [skillFilter, setSkillFilter] = useState('');
  const debouncedSearch = useDebounceValue(searchQuery, 300);
  const debouncedSkill = useDebounceValue(skillFilter, 300);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (departmentFilter) count++;
    if (statusFilter) count++;
    if (skillFilter.trim()) count++;
    return count;
  }, [departmentFilter, statusFilter, skillFilter]);

  const clearFilters = () => {
    setDepartmentFilter('');
    setStatusFilter('');
    setSkillFilter('');
  };

  // Fetch real data from hooks
  const { data: buildersData, isLoading, error } = useBuilders({
    search: debouncedSearch || undefined,
    department_id: departmentFilter || undefined,
    is_active: statusFilter === '' ? undefined : statusFilter === 'active',
    has_skill: debouncedSkill.trim() || undefined,
    limit: 50,
  });
  const { data: stats, isLoading: statsLoading } = useBuilderStats();

  const builders = buildersData?.data || [];

  // Extract unique departments from builders for filter dropdown
  const departments = useMemo(() => {
    const deptMap = new Map<string, string>();
    builders.forEach((b) => {
      if (b.department?.id) {
        deptMap.set(
          b.department.id,
          b.department.name || b.department.department_name || 'Unknown'
        );
      }
    });
    return Array.from(deptMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [builders]);

  return (
    <div className="space-y-4">
      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load builders. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Builders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Star className="h-8 w-8 text-yellow-500" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{stats?.active || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <FolderKanban className="h-8 w-8 text-blue-500" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{stats?.activeAssignments || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Active Assignments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Code2 className="h-8 w-8 text-green-500" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold">{stats?.totalSkills || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Skills</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search builders or skills..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button asChild>
              <Link href="/solutions/software/builders/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Builder
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Builder</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Skills</TableHead>
                  <TableHead className="text-center">Assignments</TableHead>
                  <TableHead className="text-right">Skills</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Users className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">
                        {searchQuery ? 'No builders match your search' : 'No builders found'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  builders.map((builder) => (
                    <TableRow key={builder.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/solutions/software/builders/${builder.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {builder.name
                                ?.split(' ')
                                .map((n: string) => n[0])
                                .join('') || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link href={`/solutions/software/builders/${builder.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                              {builder.name}
                            </Link>
                            <p className="text-sm text-muted-foreground">{builder.email || '-'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{builder.department?.name || builder.department?.department_name || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {builder.skills?.slice(0, 3).map((skill: { skill_name: string }) => (
                            <Badge key={skill.skill_name} variant="secondary" className="text-xs">
                              {skill.skill_name}
                            </Badge>
                          )) || <span className="text-muted-foreground">-</span>}
                          {builder.skills && builder.skills.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{builder.skills.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <span className="font-medium">
                            {builder.assignments?.filter((a: { status: string }) => a.status === 'active').length || 0}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            / {builder.assignments?.filter((a: { status: string }) => a.status === 'completed').length || 0} completed
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {builder.skills?.length || 0} skills
                      </TableCell>
                      <TableCell>
                        <Badge variant={builder.is_active ? 'default' : 'secondary'}>
                          {builder.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
