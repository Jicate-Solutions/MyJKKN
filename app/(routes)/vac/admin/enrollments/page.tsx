'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useVACCourses,
  useCourseEnrollments,
  useEnrollmentStats,
  useUpdateEnrollment,
  useMarkPaymentComplete
} from '@/hooks/vac/use-vac';
import { useToast } from '@/hooks/use-toast';
import type { VACEnrollmentWithDetails } from '@/types/vac';
import {
  Users,
  UserCheck,
  CheckCircle,
  DollarSign,
  MoreHorizontal,
  CreditCard,
  Award,
  XCircle,
  Loader2,
  BookOpen,
  AlertCircle,
  Download
} from 'lucide-react';

function exportToCSV(enrollments: VACEnrollmentWithDetails[], courseName: string) {
  const headers = ['Student Name', 'Email', 'Enrolled Date', 'Status', 'Payment Status'];
  const rows = enrollments.map(e => [
    e.user_name || 'N/A',
    e.user_email || 'N/A',
    new Date(e.enrolled_at).toLocaleDateString('en-IN'),
    e.status,
    e.payment_status
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `vac-enrollments-${courseName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function VACAdminEnrollmentsPage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const { toast } = useToast();

  // Fetch all courses (including inactive) for the selector
  const { data: coursesData, isLoading: coursesLoading } = useVACCourses({
    activeOnly: false
  });
  const courses = coursesData?.courses || [];

  // Fetch enrollments and stats for selected course
  const {
    data: enrollmentsData,
    isLoading: enrollmentsLoading
  } = useCourseEnrollments(selectedCourseId || undefined);
  const enrollments = enrollmentsData?.enrollments || [];

  const { data: stats, isLoading: statsLoading } = useEnrollmentStats(
    selectedCourseId || undefined
  );

  // Mutations
  const updateEnrollment = useUpdateEnrollment();
  const markPaymentComplete = useMarkPaymentComplete();

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  // Action handlers
  const handleMarkPaid = async (enrollment: VACEnrollmentWithDetails) => {
    try {
      await markPaymentComplete.mutateAsync({
        enrollmentId: enrollment.id,
        userId: enrollment.user_id,
        courseId: enrollment.course_id,
        amount: enrollment.course_fee || 0
      });
      toast({
        title: 'Payment marked as complete',
        description: `Payment recorded for ${enrollment.user_name || enrollment.user_email}`
      });
    } catch {
      toast({
        title: 'Failed to update payment',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleMarkCompleted = async (enrollment: VACEnrollmentWithDetails) => {
    try {
      await updateEnrollment.mutateAsync({
        enrollmentId: enrollment.id,
        userId: enrollment.user_id,
        courseId: enrollment.course_id,
        updates: { status: 'completed' }
      });
      toast({
        title: 'Enrollment marked as completed',
        description: `${enrollment.user_name || enrollment.user_email} has been marked as completed.`
      });
    } catch {
      toast({
        title: 'Failed to update enrollment',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleCancelEnrollment = async (
    enrollment: VACEnrollmentWithDetails
  ) => {
    try {
      await updateEnrollment.mutateAsync({
        enrollmentId: enrollment.id,
        userId: enrollment.user_id,
        courseId: enrollment.course_id,
        updates: { status: 'cancelled' }
      });
      toast({
        title: 'Enrollment cancelled',
        description: `Enrollment for ${enrollment.user_name || enrollment.user_email} has been cancelled.`
      });
    } catch {
      toast({
        title: 'Failed to cancel enrollment',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Badge helpers
  const statusBadgeVariant = (
    status: string
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'active':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const paymentBadgeVariant = (
    status: string
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'waived':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'refunded':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const isMutating =
    updateEnrollment.isPending || markPaymentComplete.isPending;

  return (
    <ContentLayout title="VAC Enrollments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'VAC', href: '/vac' },
          { label: 'Admin', href: '/vac/admin/courses' },
          { label: 'Enrollments' }
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Enrollment Management</h1>
          <p className="text-muted-foreground">
            View and manage student enrollments for each course
          </p>
        </div>

        {/* Course Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select a Course</CardTitle>
          </CardHeader>
          <CardContent>
            {coursesLoading ? (
              <Skeleton className="h-10 w-full max-w-md" />
            ) : (
              <Select
                value={selectedCourseId}
                onValueChange={setSelectedCourseId}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Choose a course to view enrollments" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      <span className="font-mono text-xs mr-2">
                        {course.code}
                      </span>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Content: only show when a course is selected */}
        {selectedCourseId ? (
          <>
            {/* Stats Row */}
            {statsLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-20" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-12" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : stats ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Total Enrollments
                    </CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.total_enrollments}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Active
                    </CardTitle>
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.active_enrollments}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Completed
                    </CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.completed_enrollments}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Paid
                    </CardTitle>
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats.paid_enrollments}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      Revenue
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        maximumFractionDigits: 0
                      }).format(stats.total_revenue)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {/* Enrollments Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Enrollments
                    {selectedCourse && (
                      <Badge variant="outline" className="ml-2 font-normal">
                        {selectedCourse.code}
                      </Badge>
                    )}
                  </CardTitle>
                  {enrollments.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportToCSV(enrollments, selectedCourse?.name || 'unknown')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {enrollmentsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : enrollments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
                    <h3 className="text-lg font-medium">No enrollments yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      No students have enrolled in this course yet.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Enrolled Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enrollments.map((enrollment) => (
                          <TableRow key={enrollment.id}>
                            <TableCell className="font-medium">
                              {enrollment.user_name || 'N/A'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {enrollment.user_email || 'N/A'}
                            </TableCell>
                            <TableCell>
                              {new Date(
                                enrollment.enrolled_at
                              ).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={statusBadgeVariant(enrollment.status)}
                              >
                                {enrollment.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={paymentBadgeVariant(
                                  enrollment.payment_status
                                )}
                              >
                                {enrollment.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isMutating}
                                  >
                                    {isMutating ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <MoreHorizontal className="h-4 w-4" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {enrollment.payment_status !== 'paid' &&
                                    enrollment.payment_status !== 'waived' && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          handleMarkPaid(enrollment)
                                        }
                                      >
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Mark as Paid
                                      </DropdownMenuItem>
                                    )}
                                  {enrollment.status === 'active' && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleMarkCompleted(enrollment)
                                      }
                                    >
                                      <Award className="mr-2 h-4 w-4" />
                                      Mark as Completed
                                    </DropdownMenuItem>
                                  )}
                                  {enrollment.status !== 'cancelled' && (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() =>
                                        handleCancelEnrollment(enrollment)
                                      }
                                    >
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Cancel Enrollment
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          /* No course selected state */
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">
                Select a course to get started
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Choose a course from the dropdown above to view enrollment
                details, statistics, and manage student enrollments.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
