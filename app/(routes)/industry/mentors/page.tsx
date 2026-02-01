'use client';

// ============================================================================
// Industry Mentors - List Page
// ============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryMentors, useArchiveMentor, useRestoreMentor } from '@/hooks/industry';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Archive,
  RotateCcw,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function MentorsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading, refetch } = useIndustryMentors({
    search: search || undefined,
    is_active: !showArchived,
    page,
    limit: 10
  });

  const archiveMutation = useArchiveMentor();
  const restoreMutation = useRestoreMentor();

  const handleArchive = async (id: string) => {
    try {
      await archiveMutation.mutateAsync(id);
      toast({ title: 'Mentor archived successfully' });
      refetch();
    } catch {
      toast({ title: 'Failed to archive mentor', variant: 'destructive' });
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreMutation.mutateAsync(id);
      toast({ title: 'Mentor restored successfully' });
      refetch();
    } catch {
      toast({ title: 'Failed to restore mentor', variant: 'destructive' });
    }
  };

  return (
    <PermissionGuard module="industry.mentors" action="view">
      <ContentLayout title="Industry Mentors">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Mentors</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Industry Mentors</CardTitle>
              <Button asChild>
                <Link href="/industry/mentors/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Mentor
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search mentors..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant={showArchived ? 'secondary' : 'outline'}
                  onClick={() => { setShowArchived(!showArchived); setPage(1); }}
                >
                  {showArchived ? 'Show Active' : 'Show Archived'}
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : data?.data && data.data.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {data.data.map((mentor) => (
                      <div key={mentor.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{mentor.mentor_name}</p>
                            <p className="text-sm text-muted-foreground">{mentor.designation}</p>
                            <div className="flex gap-1 mt-1">
                              {mentor.expertise_areas?.slice(0, 3).map((area) => (
                                <Badge key={area} variant="outline" className="text-xs">{area}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={mentor.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {mentor.is_active ? 'Active' : 'Archived'}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/industry/mentors/${mentor.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/industry/mentors/${mentor.id}/edit`)}>
                                <Pencil className="h-4 w-4 mr-2" />Edit
                              </DropdownMenuItem>
                              {mentor.is_active ? (
                                <DropdownMenuItem onClick={() => handleArchive(mentor.id)} className="text-destructive">
                                  <Archive className="h-4 w-4 mr-2" />Archive
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleRestore(mentor.id)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />Restore
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, data.metadata.total)} of {data.metadata.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page === 1}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">Page {page} of {data.metadata.totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= data.metadata.totalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">No mentors found</p>
                  <Button className="mt-4" asChild>
                    <Link href="/industry/mentors/new"><Plus className="h-4 w-4 mr-2" />Add Mentor</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
