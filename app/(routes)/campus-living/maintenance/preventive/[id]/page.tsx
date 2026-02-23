'use client'

import { use, useState } from 'react'
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
  ArrowLeft,
  Play,
  Pause,
  CalendarClock,
  CheckCircle2,
  Wrench,
  MapPin,
  User,
  Clock,
  AlertTriangle,
  Loader2,
  Plus,
  Phone,
  DollarSign,
  ListChecks,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  usePmSchedule,
  usePmTasks,
  usePausePmSchedule,
  useResumePmSchedule,
  useGeneratePmTask,
} from '@/hooks/campus-living/use-pm-schedules'
import type { HostelPmSchedule, HostelPmTask } from '@/types/campus-living'

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  yearly: 'Yearly',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface PmScheduleDetailPageProps {
  params: Promise<{ id: string }>
}

export default function PmScheduleDetailPage({ params }: PmScheduleDetailPageProps) {
  const { id } = use(params)
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: schedule, isLoading } = usePmSchedule(id)
  const { data: tasksData, isLoading: tasksLoading } = usePmTasks(institutionId, {
    schedule_id: id,
  })
  const tasks: HostelPmTask[] = (tasksData?.data as HostelPmTask[] | undefined) || []

  const pauseMutation = usePausePmSchedule()
  const resumeMutation = useResumePmSchedule()
  const generateMutation = useGeneratePmTask()

  const [actionLoading, setActionLoading] = useState(false)

  if (isLoading || !schedule) {
    return (
      <ContentLayout title="PM Schedule">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const s = schedule as HostelPmSchedule & Record<string, unknown>
  const blockName =
    s.hostel_blocks && typeof s.hostel_blocks === 'object'
      ? (s.hostel_blocks as { name: string }).name
      : null
  const todayStr = new Date().toISOString().split('T')[0]
  const isOverdue = s.status === 'active' && s.next_due_date < todayStr

  const handlePause = async () => {
    setActionLoading(true)
    try {
      await pauseMutation.mutateAsync(id)
    } finally {
      setActionLoading(false)
    }
  }

  const handleResume = async () => {
    setActionLoading(true)
    try {
      await resumeMutation.mutateAsync(id)
    } finally {
      setActionLoading(false)
    }
  }

  const handleGenerateTask = async () => {
    setActionLoading(true)
    try {
      await generateMutation.mutateAsync(id)
    } finally {
      setActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><Play className="mr-1 h-3 w-3" />Active</Badge>
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Pause className="mr-1 h-3 w-3" />Paused</Badge>
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getTaskStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="outline">Open</Badge>
      case 'assigned':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Assigned</Badge>
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Clock className="mr-1 h-3 w-3" />In Progress</Badge>
      case 'resolved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Closed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'critical':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Critical</Badge>
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">High</Badge>
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Medium</Badge>
      case 'low':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Low</Badge>
      default:
        return <Badge variant="outline">{p}</Badge>
    }
  }

  const completedTasks = tasks.filter((t) => t.status === 'resolved').length
  const lastCompleted = tasks
    .filter((t) => t.completed_at)
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))[0]

  return (
    <ContentLayout title={s.title}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/maintenance/preventive">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{s.title}</h1>
              <p className="text-muted-foreground">
                {FREQUENCY_LABELS[s.frequency] || s.frequency} schedule
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {getStatusBadge(s.status)}
            {getPriorityBadge(s.priority)}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Schedule Details */}
            <Card>
              <CardHeader>
                <CardTitle>Schedule Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {s.description && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Description</p>
                    <p>{s.description}</p>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium capitalize">{s.category?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Frequency</p>
                      <p className="font-medium">
                        {FREQUENCY_LABELS[s.frequency] || s.frequency}
                        {s.day_of_week !== null && s.day_of_week !== undefined
                          ? ` - ${DAY_NAMES[s.day_of_week]}`
                          : ''}
                        {s.day_of_month ? ` - Day ${s.day_of_month}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Time of Day</p>
                      <p className="font-medium">{s.time_of_day || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Block</p>
                      <p className="font-medium">{blockName || 'All Blocks'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Assigned To</p>
                      <p className="font-medium">{s.assigned_to_name || 'Unassigned'}</p>
                    </div>
                  </div>
                  {s.assigned_to_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{s.assigned_to_phone}</p>
                      </div>
                    </div>
                  )}
                  {s.vendor_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Vendor</p>
                        <p className="font-medium">{s.vendor_name}</p>
                      </div>
                    </div>
                  )}
                  {s.estimated_cost !== null && s.estimated_cost !== undefined && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Estimated Cost</p>
                        <p className="font-medium">INR {Number(s.estimated_cost).toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Checklist */}
            {s.checklist && s.checklist.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5" />
                    Checklist ({s.checklist.length} items)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {s.checklist.map((item, index) => (
                      <li key={index} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                        <span className="text-sm">{typeof item === 'string' ? item : item.item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Task History */}
            <Card>
              <CardHeader>
                <CardTitle>Task History</CardTitle>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-8">
                    <CalendarClock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No tasks generated yet for this schedule.
                    </p>
                    {s.status === 'active' && (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={handleGenerateTask}
                        disabled={actionLoading}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Generate First Task
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => {
                        const taskOverdue =
                          task.status === 'open' && task.due_date < todayStr
                        return (
                          <TableRow key={task.id} className={taskOverdue ? 'bg-red-50' : ''}>
                            <TableCell>
                              <div className={`text-sm ${taskOverdue ? 'text-red-600 font-medium' : ''}`}>
                                {new Date(task.due_date + 'T00:00:00').toLocaleDateString()}
                              </div>
                              {taskOverdue && (
                                <span className="text-xs text-red-600">Overdue</span>
                              )}
                            </TableCell>
                            <TableCell>{getTaskStatusBadge(task.status)}</TableCell>
                            <TableCell className="text-sm">
                              {task.assigned_to_name || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {task.completed_at
                                ? new Date(task.completed_at).toLocaleDateString()
                                : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">
                              {task.completion_notes || (
                                <span className="text-muted-foreground">-</span>
                              )}
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

          {/* Right column - Sidebar */}
          <div className="space-y-6">
            {/* Status & Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status & Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Status</span>
                  {getStatusBadge(s.status)}
                </div>

                <div className="space-y-2">
                  {s.status === 'active' && (
                    <>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={handlePause}
                        disabled={actionLoading}
                      >
                        {pauseMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Pause className="mr-2 h-4 w-4" />
                        )}
                        Pause Schedule
                      </Button>
                      <Button
                        className="w-full"
                        onClick={handleGenerateTask}
                        disabled={actionLoading}
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Generate Next Task
                      </Button>
                    </>
                  )}
                  {s.status === 'paused' && (
                    <Button
                      className="w-full"
                      onClick={handleResume}
                      disabled={actionLoading}
                    >
                      {resumeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Resume Schedule
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Completions</p>
                    <p className="text-xl font-bold">{s.total_completions || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Next Due Date</p>
                    <p className={`text-sm font-medium ${isOverdue ? 'text-red-600' : ''}`}>
                      {s.next_due_date
                        ? new Date(s.next_due_date + 'T00:00:00').toLocaleDateString()
                        : '-'}
                      {isOverdue && (
                        <span className="flex items-center gap-1 text-xs text-red-600 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Completed</p>
                    <p className="text-sm font-medium">
                      {s.last_completed_date
                        ? new Date(s.last_completed_date + 'T00:00:00').toLocaleDateString()
                        : lastCompleted?.completed_at
                          ? new Date(lastCompleted.completed_at).toLocaleDateString()
                          : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tasks Generated</p>
                    <p className="text-sm font-medium">{tasks.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tasks Completed</p>
                    <p className="text-sm font-medium text-green-600">{completedTasks}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  )
}
