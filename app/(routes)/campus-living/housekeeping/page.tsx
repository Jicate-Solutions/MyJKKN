'use client'

import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  PlayCircle,
  ListChecks,
  Calendar,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useTodayCleaningStats,
  useCleaningTasksByDate,
  useUpdateCleaningTaskStatus,
} from '@/hooks/campus-living/use-housekeeping'
import type { HostelCleaningTask } from '@/types/campus-living'

const CLEANING_TYPE_LABELS: Record<string, string> = {
  daily_sweep: 'Daily Sweep',
  daily_mop: 'Daily Mop',
  toilet_cleaning: 'Toilet Cleaning',
  common_area: 'Common Area',
  deep_cleaning: 'Deep Cleaning',
  window_cleaning: 'Window Cleaning',
  water_tank: 'Water Tank',
  disinfection: 'Disinfection',
  other: 'Other',
}

export default function HousekeepingDashboardPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const todayStr = new Date().toISOString().split('T')[0]
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const { data: stats, isLoading: statsLoading } = useTodayCleaningStats(institutionId)
  const { data: todayTasks, isLoading: tasksLoading } = useCleaningTasksByDate(institutionId, todayStr)
  const updateStatusMutation = useUpdateCleaningTaskStatus()

  const tasks: HostelCleaningTask[] = (todayTasks as HostelCleaningTask[] | undefined) || []

  const scheduled = stats?.scheduled ?? 0
  const inProgress = stats?.in_progress ?? 0
  const completed = stats?.completed ?? 0
  const missed = stats?.missed ?? 0

  const handleStatusChange = (taskId: string, status: string) => {
    updateStatusMutation.mutate({
      id: taskId,
      status,
      completedBy: status === 'completed' ? profile?.id : undefined,
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100"><CalendarClock className="mr-1 h-3 w-3" />Scheduled</Badge>
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Clock className="mr-1 h-3 w-3" />In Progress</Badge>
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>
      case 'missed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" />Missed</Badge>
      case 'rescheduled':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><CalendarClock className="mr-1 h-3 w-3" />Rescheduled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const isLoading = statsLoading || tasksLoading

  if (isLoading) {
    return (
      <ContentLayout title="Cleaning & Housekeeping">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Cleaning & Housekeeping">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Today&apos;s Cleaning Dashboard</h1>
            <p className="text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {todayFormatted}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/housekeeping/tasks">
                <ListChecks className="mr-2 h-4 w-4" />
                All Tasks
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/housekeeping/schedules">
                <CalendarClock className="mr-2 h-4 w-4" />
                Schedules
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <CalendarClock className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{scheduled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{inProgress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Missed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{missed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Tasks Table */}
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No tasks for today</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Set up cleaning schedules to auto-generate daily tasks.
                </p>
                <Button className="mt-4" asChild>
                  <Link href="/campus-living/housekeeping/schedules">
                    <CalendarClock className="mr-2 h-4 w-4" />
                    Manage Schedules
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => {
                    const blockName =
                      (task as Record<string, unknown>).hostel_blocks &&
                      typeof (task as Record<string, unknown>).hostel_blocks === 'object'
                        ? ((task as Record<string, unknown>).hostel_blocks as { name?: string }).name
                        : null
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">
                          {blockName || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {task.floor_number !== null ? `Floor ${task.floor_number}` : <span className="text-muted-foreground">All</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {CLEANING_TYPE_LABELS[task.cleaning_type] || task.cleaning_type?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {task.assigned_staff || <span className="text-muted-foreground">Unassigned</span>}
                        </TableCell>
                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                        <TableCell className="text-sm">
                          {task.started_at
                            ? new Date(task.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                            : task.completed_at
                              ? new Date(task.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {task.status === 'scheduled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusChange(task.id, 'in_progress')}
                                disabled={updateStatusMutation.isPending}
                              >
                                <PlayCircle className="mr-1 h-3 w-3" />
                                Start
                              </Button>
                            )}
                            {(task.status === 'scheduled' || task.status === 'in_progress') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStatusChange(task.id, 'completed')}
                                disabled={updateStatusMutation.isPending}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Done
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
