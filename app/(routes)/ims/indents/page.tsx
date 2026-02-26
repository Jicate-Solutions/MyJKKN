'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsIndents, useCancelImsIndent } from '@/hooks/ims/use-ims-indents';
import { useDepartments } from '@/hooks/organization/use-departments';
import {
  INDENT_STATUS_CONFIG,
  INDENT_URGENCY_CONFIG,
  type ImsIndentStatus,
  type ImsIndentFilters,
} from '@/types/ims/indents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Eye, X, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

export default function IndentsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [cancelId, setCancelId] = useState<string | null>(null);

  const filters: ImsIndentFilters = {
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as ImsIndentStatus) : undefined,
    department_id: departmentFilter !== 'all' ? departmentFilter : undefined,
    store_id: storeId ?? undefined,
    institution_id: institutionId || undefined,
  };

  const { data: indentsResponse, isLoading } = useImsIndents(filters);
  const indents = indentsResponse?.data ?? [];
  const { data: departmentsData } = useDepartments({
    institution_id: institutionId || '',
  });
  const cancelIndent = useCancelImsIndent();

  const departments = departmentsData?.data || [];

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      await cancelIndent.mutateAsync(cancelId);
      toast.success('Indent cancelled successfully');
      setCancelId(null);
    } catch {
      toast.error('Failed to cancel indent');
    }
  };

  const canCancel = (indent: { status: string; requested_by: string }) => {
    return (
      (indent.status === 'draft' || indent.status === 'pending_approval') &&
      indent.requested_by === profile?.id
    );
  };

  return (
    <ContentLayout title="Indent Requests">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Indent Requests</h2>
            <p className="text-muted-foreground">
              Manage and track all indent requests
            </p>
          </div>
          <Button onClick={() => router.push('/ims/indents/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Indent
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search indents..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(INDENT_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept: { id: string; department_name: string }) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : !indents || indents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>No indents found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Indent #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indents.map((indent) => {
                    const statusConfig = INDENT_STATUS_CONFIG[indent.status];
                    const urgencyConfig = INDENT_URGENCY_CONFIG[indent.urgency];
                    return (
                      <TableRow key={indent.id}>
                        <TableCell className="font-medium">
                          {indent.indent_number}
                        </TableCell>
                        <TableCell>
                          {new Date(indent.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {indent.department?.department_name || '-'}
                        </TableCell>
                        <TableCell>
                          {indent.requested_by_profile?.full_name || '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {indent.purpose}
                        </TableCell>
                        <TableCell>
                          <Badge variant={urgencyConfig.variant}>
                            {urgencyConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/ims/indents/${indent.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canCancel(indent) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCancelId(indent.id)}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Indent</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel this indent request? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No, keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancel}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, cancel indent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ContentLayout>
  );
}
