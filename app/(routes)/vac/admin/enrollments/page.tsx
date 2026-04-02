'use client';

import { useState, useMemo, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useAuth } from '@/hooks/use-auth';
import {
  useVACEnrollments,
  useUpdateEnrollmentStatus,
} from '@/hooks/vac/use-vac';
import type {
  VACEnrollmentWithDetails,
  VACEnrollmentFilters,
  VACEnrollmentStatus,
  VACPaymentStatus,
} from '@/types/vac';
import { Search, Users, CheckCircle2, XCircle, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { BulkEnrollDialog } from './_components/bulk-enroll-dialog';

// ── Badge colors ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const PAYMENT_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  waived: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  refunded: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EnrollmentManagementPage() {
  const { profile } = useAuth();
  const updateStatusMutation = useUpdateEnrollmentStatus();

  // Fetch filter options for bulk enrollment dialog
  const [programmes, setProgrammes] = useState<{ id: string; program_name: string }[]>([]);
  const [semesters, setSemesters] = useState<{ id: string; semester_name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; section_name: string }[]>([]);

  // Load filter options on mount
  useEffect(() => {
    if (!profile?.institution_id) return;
    const loadFilters = async () => {
      const { createClientSupabaseClient } = await import('@/lib/supabase/client');
      const supabase = createClientSupabaseClient();

      const [progRes, semRes, secRes] = await Promise.all([
        supabase
          .from('programs')
          .select('id, program_name')
          .eq('institution_id', profile.institution_id)
          .order('program_name'),
        supabase
          .from('semesters')
          .select('id, semester_name')
          .eq('institution_id', profile.institution_id)
          .order('semester_order'),
        supabase
          .from('sections')
          .select('id, section_name')
          .eq('institution_id', profile.institution_id)
          .eq('is_active', true)
          .order('section_name'),
      ]);

      if (progRes.data) setProgrammes(progRes.data as any);
      if (semRes.data) setSemesters(semRes.data as any);
      if (secRes.data) setSections(secRes.data as any);
    };
    loadFilters();
  }, [profile?.institution_id]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filters: VACEnrollmentFilters = useMemo(
    () => ({
      search: search || undefined,
      status:
        statusFilter !== 'all'
          ? (statusFilter as VACEnrollmentStatus)
          : undefined,
      payment_status:
        paymentFilter !== 'all'
          ? (paymentFilter as VACPaymentStatus)
          : undefined,
    }),
    [search, statusFilter, paymentFilter]
  );

  const { data: enrollmentData, isLoading } = useVACEnrollments(filters);

  const enrollments: VACEnrollmentWithDetails[] = useMemo(() => {
    if (!enrollmentData) return [];
    if (Array.isArray(enrollmentData)) return enrollmentData;
    return (enrollmentData as { data: VACEnrollmentWithDetails[] })?.data ?? [];
  }, [enrollmentData]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === enrollments.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(enrollments.map((e) => e.id)));
    }
  };

  const handleBulkAction = (action: 'active' | 'cancelled' | 'waived') => {
    if (selected.size === 0) {
      toast.error('No enrollments selected');
      return;
    }

    const count = selected.size;
    const label =
      action === 'active'
        ? 'approve'
        : action === 'cancelled'
          ? 'cancel'
          : 'waive fee for';

    if (!confirm(`${label} ${count} enrollment(s)?`)) return;

    selected.forEach((id) => {
      if (action === 'waived') {
        updateStatusMutation.mutate({
          id,
          status: 'active',
          paymentData: { payment_status: 'waived' },
        });
      } else {
        updateStatusMutation.mutate({ id, status: action });
      }
    });

    setSelected(new Set());
  };

  return (
    <ContentLayout title="Enrollments">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Enrollments</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-4 mt-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Enrollment Management</h1>
            <p className="text-sm text-muted-foreground">
              View and manage student enrollments across all courses
            </p>
          </div>
          {profile?.institution_id && (
            <BulkEnrollDialog
              institutionId={profile.institution_id}
              programmes={programmes}
              semesters={semesters}
              sections={sections}
            />
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="waived">Waived</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('active')}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('cancelled')}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('waived')}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              Waive Fee
            </Button>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        enrollments.length > 0 &&
                        selected.size === enrollments.length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Payment</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : enrollments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No enrollments found
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(enrollment.id)}
                          onCheckedChange={() => toggleSelect(enrollment.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {enrollment.user_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {enrollment.user_email || '-'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{enrollment.course_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {enrollment.course_code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={STATUS_COLORS[enrollment.status] || ''}
                        >
                          {enrollment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={
                            PAYMENT_COLORS[enrollment.payment_status] || ''
                          }
                        >
                          {enrollment.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(enrollment.enrolled_at).toLocaleDateString(
                          'en-IN'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {enrollment.status !== 'completed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: enrollment.id,
                                  status: 'completed',
                                  userId: enrollment.user_id,
                                  courseId: enrollment.course_id,
                                })
                              }
                              disabled={updateStatusMutation.isPending}
                            >
                              Complete
                            </Button>
                          )}
                          {enrollment.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: enrollment.id,
                                  status: 'cancelled',
                                  userId: enrollment.user_id,
                                  courseId: enrollment.course_id,
                                })
                              }
                              disabled={updateStatusMutation.isPending}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
