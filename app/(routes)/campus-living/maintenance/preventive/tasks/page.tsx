'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ListChecks,
  CalendarClock,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  usePmTasks,
  useOverduePmTasks,
  useCompletePmTask,
} from '@/hooks/campus-living/use-pm-schedules'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import type { HostelPmTask } from '@/types/campus-living'

export default function PmTasksPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const [statusFilter, setStatusFilter] = useState('all')
  const [blockFilter, setBlockFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Complete task dialog state
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<HostelPmTask | null>(null)
  const [completionNotes, setCompletionNotes] = useState('')

  const taskFilters: Record<string, unknown> = {}
  if (statusFilter !== 'all') taskFilters.status = statusFilter
  if (blockFilter !== 'all') taskFilters.block_id = blockFilter
  if (dateFrom) taskFilters.due_from = dateFrom
  if (dateTo) taskFilters.due_to = dateTo

  const { data: tasksData, isLoading } = usePmTasks(institutionId, taskFilters as Parameters<typeof usePmTasks>[1])
  const { data: overdueData } = useOverduePmTasks(institutionId)
  const { data: blocksData } = useHostelBlocks(institutionId)
  const completeMutation = useCompletePmTask()

  const tasks: HostelPmTask[] = (tasksData?.data as HostelPmTask[] | undefined) || []
  const overdueTasks: HostelPmTask[] = (overdueData as HostelPmTask[] | undefined) || []
  const blocks = blocksData?.data || blocksData || []

  const todayStr = new Date().toISOString().split('T')[0]

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery) return true
    const title = t.title?.toLowerCase() || ''
    const scheduleTitle =
      (t as Record<string, unknown>).hostel_pm_schedules &&
      typeof (t as Record<string, unknown>).hostel_pm_schedules === 'object'
        ? ((t as Record<string, unknown>).hostel_pm_schedules as { title?: string }).title?.toLowerCase() || ''
        : ''
    return title.includes(searchQuery.toLowerCase()) || scheduleTitle.includes(searchQuery.toLowerCase())
  })

  const totalTasks = tasks.length
  const overdueCount = overdueTasks.length
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length
  const completedToday = tasks.filter(
    (t) => t.status === 'resolved' && t.completed_at && t.completed_at.startsWith(todayStr)
  ).length

  const openCompleteDialog = (task: HostelPmTask) => {
    setSelectedTask(task)
    setCompletionNotes('')
    setCompleteDialogOpen(true)
  }

  const handleCompleteTask = async () => {
    if (!selectedTask || !profile?.id) return
    await completeMutation.mutateAsync({
      id: selectedTask.id,
      completedBy: profile.id,
      payload: {
        completion_notes: completionNotes || 'Completed',
      },
    })
    setCompleteDialogOpen(false)
    setSelectedTask(null)
  }

  const getStatusBadge = (status: string) => {
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

  if (isLoading) {
    return (
      <ContentLayout title="PM Tasks">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="PM Tasks">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/maintenance/preventive">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Preventive Maintenance Tasks</h1>
              <p className="text-muted-foreground">
                All tasks generated from PM schedules
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              <ListChecks className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTasks}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedToday}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {Array.isArray(blocks) &&
                    blocks.map((block: { id: string; name: string }) => (
                      <SelectItem key={block.id} value={block.id}>
                        {block.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[140px]"
                  placeholder="From"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[140px]"
                  placeholder="To"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No tasks found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {tasks.length === 0
                    ? 'No PM tasks have been generated yet. Create a schedule and generate tasks.'
                    : 'Try adjusting your filters to find what you are looking for.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const isOverdue = task.status === 'open' && task.due_date < todayStr
                    const scheduleTitle =
                      (task as Record<string, unknown>).hostel_pm_schedules &&
                      typeof (task as Record<string, unknown>).hostel_pm_schedules === 'object'
                        ? ((task as Record<string, unknown>).hostel_pm_schedules as { title?: string }).title
                        : null
                    const blockName =
                      (task as Record<string, unknown>).hostel_blocks &&
                      typeof (task as Record<string, unknown>).hostel_blocks === 'object'
                        ? ((task as Record<string, unknown>).hostel_blocks as { name?: string }).name
                        : null

                    return (
                      <TableRow key={task.id} className={isOverdue ? 'bg-red-50' : ''}>
                        <TableCell>
                          <div className="font-medium">{task.title}</div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {task.category?.replace('_', ' ')}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {scheduleTitle ? (
                            <Link
                              href={`/campus-living/maintenance/preventive/${task.schedule_id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {scheduleTitle}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {blockName || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <div className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                            {new Date(task.due_date + 'T00:00:00').toLocaleDateString()}
                          </div>
                          {isOverdue && (
                            <span className="text-xs text-red-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Overdue
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                        <TableCell className="text-sm">
                          {task.assigned_to_name || (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {task.status !== 'resolved' && task.status !== 'closed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCompleteDialog(task)}
                              >
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Complete
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

      {/* Complete Task Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
            <DialogDescription>
              Mark &quot;{selectedTask?.title}&quot; as completed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="completion_notes">Completion Notes</Label>
              <Textarea
                id="completion_notes"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Describe what was done..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCompleteTask}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {completeMutation.isPending ? 'Completing...' : 'Mark Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  )
}
