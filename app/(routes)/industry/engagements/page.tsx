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
import { useIndustryEngagements, useUpdateEngagementStatus } from '@/hooks/industry';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Eye, Pencil, Briefcase, ChevronLeft, ChevronRight, CheckCircle, XCircle, Play } from 'lucide-react';
import type { EngagementStatus } from '@/types/industry';

const STATUS_COLORS: Record<EngagementStatus, string> = {
  pending: 'bg-gray-100 text-gray-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  withdrawn: 'bg-orange-100 text-orange-800',
  terminated: 'bg-red-100 text-red-800'
};

export default function EngagementsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EngagementStatus | 'all'>('all');

  const { data, isLoading, refetch } = useIndustryEngagements({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    limit: 10
  });

  const statusMutation = useUpdateEngagementStatus();

  const handleStatusUpdate = async (id: string, status: EngagementStatus) => {
    try {
      await statusMutation.mutateAsync({ id, status });
      toast({ title: `Engagement marked as ${status}` });
      refetch();
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  return (
    <PermissionGuard module="industry.engagements" action="view">
      <ContentLayout title="Learner Engagements">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Engagements</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Learner Engagements</CardTitle>
              <Button asChild><Link href="/industry/engagements/new"><Plus className="h-4 w-4 mr-2" />New Engagement</Link></Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search engagements..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
                </div>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as EngagementStatus | 'all'); setPage(1); }}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="withdrawn">Withdrawn</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
              ) : data?.data && data.data.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {data.data.map((engagement) => (
                      <div key={engagement.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Briefcase className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{(engagement.project as any)?.project_title || 'Industry Engagement'}</p>
                            <p className="text-sm text-muted-foreground">{engagement.engagement_type} - {(engagement.partner as any)?.company_name}</p>
                            <div className="flex gap-2 mt-1">
                              <Badge className={STATUS_COLORS[engagement.status]}>{engagement.status}</Badge>
                              {engagement.hours_completed > 0 && (
                                <Badge variant="outline">{engagement.hours_completed} hrs</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/industry/engagements/${engagement.id}`)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/industry/engagements/${engagement.id}/edit`)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                              {engagement.status === 'pending' && (
                                <DropdownMenuItem onClick={() => handleStatusUpdate(engagement.id, 'active')}><Play className="h-4 w-4 mr-2" />Activate</DropdownMenuItem>
                              )}
                              {engagement.status === 'active' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleStatusUpdate(engagement.id, 'completed')}><CheckCircle className="h-4 w-4 mr-2" />Complete</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleStatusUpdate(engagement.id, 'terminated')} className="text-destructive"><XCircle className="h-4 w-4 mr-2" />Terminate</DropdownMenuItem>
                                </>
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
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">No engagements found</p>
                  <Button className="mt-4" asChild><Link href="/industry/engagements/new"><Plus className="h-4 w-4 mr-2" />New Engagement</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
