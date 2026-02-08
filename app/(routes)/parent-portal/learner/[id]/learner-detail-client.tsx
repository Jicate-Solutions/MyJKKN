'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  GraduationCap,
  Loader2,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useLearnerAttendance, useLearnerFees } from '@/hooks/parent-portal';
import {
  formatAttendancePercentage,
  getAttendanceColor,
} from '@/types/parent-portal';

interface LearnerDetailClientProps {
  learnerId: string;
}

export function LearnerDetailClient({ learnerId }: LearnerDetailClientProps) {
  const router = useRouter();

  // Auth is now handled server-side via httpOnly session cookies.
  // The API routes (/api/parent-portal/learner/[id]/attendance and /fees)
  // validate the session and parent-learner relationship.
  // If the session is invalid, the API returns 401 and the hooks will error.
  const { data: attendance, isLoading: loadingAttendance, error: attendanceError } =
    useLearnerAttendance(learnerId);
  const { data: fees, isLoading: loadingFees, error: feesError } = useLearnerFees(learnerId);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Handle auth errors from API (401 = session expired/invalid)
  const authError = attendanceError?.message?.includes('Authentication required') ||
    feesError?.message?.includes('Authentication required');

  if (authError) {
    router.push('/auth/parent/login');
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Handle access denied (parent not linked to this learner)
  const accessDenied = attendanceError?.message?.includes('Access denied') ||
    feesError?.message?.includes('Access denied');

  if (accessDenied) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg font-medium text-gray-900">Access Denied</p>
          <p className="mt-1 text-sm text-gray-500">
            This learner is not linked to your account
          </p>
          <Button
            onClick={() => router.push('/parent-portal/dashboard')}
            className="mt-4"
          >
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Learner Details</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs defaultValue="attendance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto">
            <TabsTrigger value="attendance" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="fees" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Fees</span>
            </TabsTrigger>
            <TabsTrigger value="grades" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Grades</span>
            </TabsTrigger>
          </TabsList>

          {/* Attendance Tab */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Attendance Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingAttendance ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : attendance ? (
                  <div className="space-y-6">
                    {/* Overall Stats */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg bg-green-50 p-4 text-center">
                        <p className="text-3xl font-bold text-green-600">
                          {attendance.present_days}
                        </p>
                        <p className="text-sm text-green-700">Present</p>
                      </div>
                      <div className="rounded-lg bg-red-50 p-4 text-center">
                        <p className="text-3xl font-bold text-red-600">
                          {attendance.absent_days}
                        </p>
                        <p className="text-sm text-red-700">Absent</p>
                      </div>
                      <div className="rounded-lg bg-yellow-50 p-4 text-center">
                        <p className="text-3xl font-bold text-yellow-600">
                          {attendance.late_days}
                        </p>
                        <p className="text-sm text-yellow-700">Late</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-4 text-center">
                        <p className="text-3xl font-bold text-blue-600">
                          {attendance.leave_days}
                        </p>
                        <p className="text-sm text-blue-700">Leave</p>
                      </div>
                    </div>

                    {/* Percentage */}
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          Overall Attendance
                        </span>
                        <span
                          className={`text-2xl font-bold ${getAttendanceColor(attendance.attendance_percentage)}`}
                        >
                          {formatAttendancePercentage(
                            attendance.attendance_percentage
                          )}
                        </span>
                      </div>
                      <Progress
                        value={attendance.attendance_percentage}
                        className="mt-2"
                      />
                    </div>

                    {/* Daily Records */}
                    <div>
                      <h4 className="mb-3 font-medium">Last 30 Days</h4>
                      <div className="flex flex-wrap gap-1">
                        {attendance.last_30_days?.map((day, index) => (
                          <div
                            key={index}
                            className={`h-6 w-6 rounded ${
                              day.status === 'present'
                                ? 'bg-green-500'
                                : day.status === 'absent'
                                  ? 'bg-red-500'
                                  : day.status === 'late'
                                    ? 'bg-yellow-500'
                                    : 'bg-blue-500'
                            }`}
                            title={`${day.date}: ${day.status}`}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded bg-green-500" />{' '}
                          Present
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded bg-red-500" /> Absent
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded bg-yellow-500" />{' '}
                          Late
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-3 w-3 rounded bg-blue-500" /> Leave
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-500">
                    No attendance data available
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fees Tab */}
          <TabsContent value="fees">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Fee Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFees ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : fees ? (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-gray-500">Total Billed</p>
                        <p className="text-2xl font-bold">
                          {formatCurrency(fees.total_billed)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-gray-500">Total Paid</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(fees.total_paid)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-gray-500">Pending</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {formatCurrency(fees.total_pending)}
                        </p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-gray-500">Overdue</p>
                        <p className="text-2xl font-bold text-red-600">
                          {formatCurrency(fees.total_overdue)}
                        </p>
                      </div>
                    </div>

                    {/* Next Due */}
                    {fees.next_due_date && (
                      <div className="rounded-lg bg-orange-50 p-4">
                        <p className="text-sm text-orange-700">Next Due Date</p>
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-medium">
                            {new Date(fees.next_due_date).toLocaleDateString()}
                          </p>
                          <p className="text-xl font-bold text-orange-600">
                            {formatCurrency(fees.next_due_amount)}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Recent Payments */}
                    {fees.recent_payments && fees.recent_payments.length > 0 && (
                      <div>
                        <h4 className="mb-3 font-medium">Recent Payments</h4>
                        <div className="space-y-2">
                          {fees.recent_payments.map((payment) => (
                            <div
                              key={payment.id}
                              className="flex items-center justify-between rounded-lg border p-3"
                            >
                              <div>
                                <p className="font-medium">
                                  {payment.receipt_number}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {new Date(payment.date).toLocaleDateString()}
                                </p>
                              </div>
                              <p className="font-bold text-green-600">
                                {formatCurrency(payment.amount)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-gray-500">
                    No fee data available
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Grades Tab */}
          <TabsContent value="grades">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Academic Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <GraduationCap className="h-12 w-12 text-gray-300" />
                  <p className="mt-4 text-gray-500">
                    Grade information will be available after examinations
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
