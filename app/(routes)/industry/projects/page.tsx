'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryProjects, useUpdateProjectStatus } from '@/hooks/industry';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Eye, Pencil, Target, ChevronLeft, ChevronRight, XCircle } from 'lucide-react';
import type { ProjectStatus } from '@/types/industry';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  open: 'bg-green-100 text-green-800',
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800'
};

export default function ProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

  const { data, isLoading, refetch } = useIndustryProjects({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    limit: 10
  });

  const cancelMutation = useUpdateProjectStatus();

  const handleCancel = async (id: string) => {
    try {
      await cancelMutation.mutateAsync({ id, status: 'cancelled' });
      toast({ title: 'Project cancelled' });
      refetch();
    } catch {
      toast({ title: 'Failed to cancel project', variant: 'destructive' });
    }
  };

  return (
    <PermissionGuard module="industry.projects" action="view">
      <ContentLayout title="Industry Projects">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Projects</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Industry Projects</CardTitle>
              <Button asChild><Link href="/industry/projects/new"><Plus className="h-4 w-4 mr-2" />Add Project</Link></Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search projects..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ProjectStatus | 'all'); setPage(1); }}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
              ) : data?.data && data.data.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {data.data.map((project) => (
                      <div key={project.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Target className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{project.project_title}</p>
                            <p className="text-sm text-muted-foreground">{(project.partner as any)?.company_name}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge className={STATUS_COLORS[project.status]}>{project.status.replace('_', ' ')}</Badge>
                              {project.difficulty_level && <Badge variant="outline" className="capitalize">{project.difficulty_level}</Badge>}
                              {(project as any).is_remote && <Badge variant="outline">Remote</Badge>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {project.stipend_amount && project.stipend_amount > 0 && (
                            <span className="text-sm font-medium text-green-600">{project.stipend_currency} {project.stipend_amount.toLocaleString()}</span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/industry/projects/${project.id}`)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/industry/projects/${project.id}/edit`)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                              {!['completed', 'cancelled'].includes(project.status) && (
                                <DropdownMenuItem onClick={() => handleCancel(project.id)} className="text-destructive"><XCircle className="h-4 w-4 mr-2" />Cancel</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, data.metadata.total)} of {data.metadata.total}</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
                      <span className="text-sm">Page {page} of {data.metadata.totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= data.metadata.totalPages}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">No projects found</p>
                  <Button className="mt-4" asChild><Link href="/industry/projects/new"><Plus className="h-4 w-4 mr-2" />Add Project</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
