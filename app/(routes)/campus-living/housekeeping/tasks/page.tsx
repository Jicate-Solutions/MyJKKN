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
  Loader2,
  CalendarClock,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Star,
  ListChecks,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useCleaningTasks,
  useUpdateCleaningTaskStatus,
} from '@/hooks/campus-living/use-housekeeping'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import type { HostelCleaningTask, CleaningTaskFilters } from '@/types/campus-living'

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

export default function CleaningTasksPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const [statusFilter, setStatusFilter] = useState('all')
  const [blockFilter, setBlockFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Complete/update dialog state
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<HostelCleaningTask | null>(null)
  const [actionType, setActionType] = useState<'in_progress' | 'completed'>('completed')
  const [qualityRating, setQualityRating] = useState('')
  const [inspectorNotes, setInspectorNotes] = useState('')

  const filters: CleaningTaskFilters = {}
  if (statusFilter !== 'all') filters.status = statusFilter as CleaningTaskFilters['status']
  if (blockFilter !== 'all') filters.block_id = blockFilter
  if (dateFrom) filters.date_from = dateFrom
  if (dateTo) filters.date_to = dateTo

  const { data: tasksData, isLoading } = useCleaningTasks(institutionId, filters)
  const { data: blocksData } = useHostelBlocks(institutionId)
  const updateStatusMutation = useUpdateCleaningTaskStatus()

  const tasks: HostelCleaningTask[] = tasksData?.data || []
  const blocks = blocksData?.data || blocksData || []

  const scheduledCount = tasks.filter((t) => t.status === 'scheduled').length
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length
  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const missedCount = tasks.filter((t) => t.status === 'missed').length

  const openActionDialog = (task: HostelCleaningTask, action: 'in_progress' | 'completed') => {
    setSelectedTask(task)
    setActionType(action)
    setQualityRating('')
    setInspectorNotes('')
    setActionDialogOpen(true)
  }

  const handleAction = async () => {
    if (!selectedTask) return
    await updateStatusMutation.mutateAsync({
      id: selectedTask.id,
      status: actionType,
      completedBy: actionType === 'completed' ? profile?.id : undefined,
      qualityRating: qualityRating ? Number(qualityRating) : undefined,
      inspectorNotes: inspectorNotes || undefined,
    })
    setActionDialogOpen(false)
    setSelectedTask(null)
  }

  const handleQuickStatusChange = (taskId: string, status: string) => {
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

  if (isLoading) {
    return (
      <ContentLayout title="Cleaning Tasks">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Cleaning Tasks">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/housekeeping">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">All Cleaning Tasks</h1>
              <p className="text-muted-foreground">
                View and manage cleaning tasks across all schedules
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <ListChecks className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{scheduledCount}</div>
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
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Missed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{missedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[150px]"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[160px]">
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                  <SelectItem value="rescheduled">Rescheduled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="text-center py-12">
                <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No tasks found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting your filters or create cleaning schedules to generate tasks.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quality</TableHead>
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
                        <TableCell className="text-sm">
                          {new Date(task.date + 'T00:00:00').toLocaleDateString('en-IN', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
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
                        <TableCell>
                          {task.quality_rating !== null ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span className="text-sm">{task.quality_rating}/5</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {task.status === 'scheduled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuickStatusChange(task.id, 'in_progress')}
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
                                onClick={() => openActionDialog(task, 'completed')}
                                disabled={updateStatusMutation.isPending}
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
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'completed' ? 'Complete Task' : 'Start Task'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'completed'
                ? `Mark "${CLEANING_TYPE_LABELS[selectedTask?.cleaning_type || ''] || selectedTask?.cleaning_type}" as completed.`
                : `Start "${CLEANING_TYPE_LABELS[selectedTask?.cleaning_type || ''] || selectedTask?.cleaning_type}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {actionType === 'completed' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="quality_rating">Quality Rating (1-5)</Label>
                  <Input
                    id="quality_rating"
                    type="number"
                    min={1}
                    max={5}
                    value={qualityRating}
                    onChange={(e) => setQualityRating(e.target.value)}
                    placeholder="Rate 1-5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspector_notes">Inspector Notes</Label>
                  <Textarea
                    id="inspector_notes"
                    value={inspectorNotes}
                    onChange={(e) => setInspectorNotes(e.target.value)}
                    placeholder="Any observations or notes..."
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : actionType === 'completed' ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              {updateStatusMutation.isPending
                ? 'Updating...'
                : actionType === 'completed'
                  ? 'Mark Complete'
                  : 'Start Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  )
}
