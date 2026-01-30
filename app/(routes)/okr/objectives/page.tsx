'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import {
  Target,
  ClipboardCheck,
  Plus,
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  TrendingUp,
  MoreHorizontal,
  Edit2,
  Trash2,
  Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useAllMyOKRs, useDeleteElectiveOKR } from '@/hooks/okr/use-learner-okrs';
import { KRStatus, LearnerOKRAssignment, LearnerElectiveOKR } from '@/types/okr';
import { format } from 'date-fns';
import { toast } from 'sonner';

// Status badge config
const statusBadgeConfig: Record<KRStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; color: string }> = {
  not_started: { variant: 'outline', label: 'Not Started', color: 'text-slate-500' },
  on_track: { variant: 'default', label: 'On Track', color: 'text-emerald-600' },
  at_risk: { variant: 'secondary', label: 'At Risk', color: 'text-amber-600' },
  behind: { variant: 'destructive', label: 'Behind', color: 'text-red-600' },
  blocked: { variant: 'destructive', label: 'Blocked', color: 'text-red-700' },
  completed: { variant: 'default', label: 'Completed', color: 'text-blue-600' }
};

function CoreOKRCard({ okr }: { okr: LearnerOKRAssignment }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4" style={{ color: '#0b6d41' }} />
              <Badge variant="outline" className="text-xs">Core</Badge>
            </div>
            <h3 className="font-semibold text-lg">{okr.core_okr?.kr_title || 'Core OKR'}</h3>
            {okr.core_okr?.kr_description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {okr.core_okr.kr_description}
              </p>
            )}
          </div>
          <Badge {...statusBadgeConfig[okr.status]}>{statusBadgeConfig[okr.status].label}</Badge>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {okr.current_value} / {okr.core_okr?.target_value} {okr.core_okr?.unit}
            </span>
          </div>
          <Progress value={okr.progress} className="h-2" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{okr.progress}% complete</span>
            <span>
              {okr.semester} • {okr.academic_year}
            </span>
          </div>
        </div>

        {okr.core_okr?.auto_source_module && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Auto-tracked from {okr.core_okr.auto_source_module}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ElectiveOKRCard({
  okr,
  onDelete
}: {
  okr: LearnerElectiveOKR;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck className="h-4 w-4" style={{ color: '#0b6d41' }} />
              <Badge variant="outline" className="text-xs">Elective</Badge>
            </div>
            <h3 className="font-semibold text-lg">{okr.title}</h3>
            {okr.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{okr.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge {...statusBadgeConfig[okr.status]}>{statusBadgeConfig[okr.status].label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/okr/elective/${okr.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/okr/elective/${okr.id}/edit`}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(okr.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {okr.current_value} / {okr.target_value} {okr.unit}
            </span>
          </div>
          <Progress value={okr.progress} className="h-2" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{okr.progress}% complete</span>
            {okr.deadline && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Due {format(new Date(okr.deadline), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>

        {okr.why_matters && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground italic">&quot;{okr.why_matters}&quot;</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ObjectivesListPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<KRStatus | 'all'>('all');

  const { data: myOKRs, isLoading } = useAllMyOKRs();
  const deleteElective = useDeleteElectiveOKR();

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this elective OKR?')) return;

    try {
      await deleteElective.mutateAsync(id);
      toast.success('Elective OKR deleted');
    } catch (error) {
      toast.error('Failed to delete OKR');
    }
  };

  // Filter OKRs based on search and status
  const filteredCore =
    myOKRs?.core.filter((okr) => {
      const matchesSearch =
        searchQuery === '' ||
        okr.core_okr?.kr_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        okr.core_okr?.kr_description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || okr.status === statusFilter;
      return matchesSearch && matchesStatus;
    }) || [];

  const filteredElective =
    myOKRs?.elective.filter((okr) => {
      const matchesSearch =
        searchQuery === '' ||
        okr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        okr.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || okr.status === statusFilter;
      return matchesSearch && matchesStatus;
    }) || [];

  return (
    <ContentLayout title="My Objectives">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/okr">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
          <Button asChild style={{ backgroundColor: '#0b6d41' }}>
            <Link href="/okr/objectives/new">
              <Plus className="h-4 w-4 mr-1" />
              Create Elective OKR
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search objectives..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as KRStatus | 'all')}
                >
                  <option value="all">All Status</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                  <option value="behind">Behind</option>
                  <option value="completed">Completed</option>
                  <option value="not_started">Not Started</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">
              All ({(myOKRs?.core.length || 0) + (myOKRs?.elective.length || 0)})
            </TabsTrigger>
            <TabsTrigger value="core">Core ({myOKRs?.core.length || 0})</TabsTrigger>
            <TabsTrigger value="elective">Elective ({myOKRs?.elective.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <>
                {filteredCore.length === 0 && filteredElective.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-12 text-muted-foreground">
                        <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No objectives found</p>
                        <p className="text-sm">
                          {searchQuery || statusFilter !== 'all'
                            ? 'Try adjusting your filters'
                            : 'Create an elective OKR to get started'}
                        </p>
                        {!searchQuery && statusFilter === 'all' && (
                          <Button className="mt-4" asChild>
                            <Link href="/okr/objectives/new">
                              <Plus className="h-4 w-4 mr-1" />
                              Create Elective OKR
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredCore.map((okr) => (
                      <CoreOKRCard key={okr.id} okr={okr} />
                    ))}
                    {filteredElective.map((okr) => (
                      <ElectiveOKRCard key={okr.id} okr={okr} onDelete={handleDelete} />
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="core" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : filteredCore.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No core OKRs</p>
                    <p className="text-sm">Core OKRs will be assigned by your institution</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredCore.map((okr) => (
                  <CoreOKRCard key={okr.id} okr={okr} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="elective" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-48 w-full" />
              </div>
            ) : filteredElective.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No elective OKRs</p>
                    <p className="text-sm mb-4">Create personal goals to track your growth</p>
                    <Button asChild>
                      <Link href="/okr/objectives/new">
                        <Plus className="h-4 w-4 mr-1" />
                        Create Elective OKR
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredElective.map((okr) => (
                  <ElectiveOKRCard key={okr.id} okr={okr} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
