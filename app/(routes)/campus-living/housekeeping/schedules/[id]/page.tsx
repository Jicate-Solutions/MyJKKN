'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  MapPin,
  User,
  Phone,
  Pencil,
  Save,
  Star,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useCleaningSchedule,
  useUpdateCleaningSchedule,
  useCleaningTasks,
} from '@/hooks/campus-living/use-housekeeping'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import { CLEANING_TYPE, PM_FREQUENCY } from '@/types/campus-living'
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

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  yearly: 'Yearly',
}

interface CleaningScheduleDetailPageProps {
  params: Promise<{ id: string }>
}

export default function CleaningScheduleDetailPage({ params }: CleaningScheduleDetailPageProps) {
  const { id } = use(params)
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: schedule, isLoading } = useCleaningSchedule(id)
  const taskFilters: CleaningTaskFilters = { schedule_id: id }
  const { data: tasksData, isLoading: tasksLoading } = useCleaningTasks(institutionId, taskFilters)
  const updateMutation = useUpdateCleaningSchedule()
  const { data: blocksData } = useHostelBlocks(institutionId)
  const blocks = blocksData?.data || blocksData || []

  const tasks: HostelCleaningTask[] = tasksData?.data || []

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editStaff, setEditStaff] = useState('')
  const [editStaffPhone, setEditStaffPhone] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editFrequency, setEditFrequency] = useState('')
  const [editType, setEditType] = useState('')
  const [editBlockId, setEditBlockId] = useState('')
  const [editFloor, setEditFloor] = useState('')

  if (isLoading || !schedule) {
    return (
      <ContentLayout title="Schedule Detail">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const s = schedule as Record<string, unknown>
  const blockName =
    s.hostel_blocks && typeof s.hostel_blocks === 'object'
      ? (s.hostel_blocks as { name?: string }).name
      : (schedule.block_name || null)

  const openEditDialog = () => {
    setEditStaff(schedule.assigned_staff || '')
    setEditStaffPhone(schedule.assigned_staff_phone || '')
    setEditTime(schedule.scheduled_time || '06:00')
    setEditFrequency(schedule.frequency || '')
    setEditType(schedule.cleaning_type || '')
    setEditBlockId(schedule.block_id || '')
    setEditFloor(schedule.floor_number !== null ? String(schedule.floor_number) : '')
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    const payload: Record<string, unknown> = {
      assigned_staff: editStaff || null,
      assigned_staff_phone: editStaffPhone || null,
      scheduled_time: editTime || '06:00',
      frequency: editFrequency,
      cleaning_type: editType,
      block_id: editBlockId || null,
      floor_number: editFloor ? Number(editFloor) : null,
    }

    await updateMutation.mutateAsync({ id, payload })
    setEditDialogOpen(false)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Scheduled</Badge>
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Clock className="mr-1 h-3 w-3" />In Progress</Badge>
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>
      case 'missed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" />Missed</Badge>
      case 'rescheduled':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Rescheduled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const missedCount = tasks.filter((t) => t.status === 'missed').length

  return (
    <ContentLayout title={CLEANING_TYPE_LABELS[schedule.cleaning_type] || schedule.cleaning_type}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/housekeeping/schedules">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {CLEANING_TYPE_LABELS[schedule.cleaning_type] || schedule.cleaning_type?.replace(/_/g, ' ')}
              </h1>
              <p className="text-muted-foreground">
                {FREQUENCY_LABELS[schedule.frequency] || schedule.frequency} schedule
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {schedule.is_active ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
            ) : (
              <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inactive</Badge>
            )}
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
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
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Cleaning Type</p>
                      <p className="font-medium">
                        {CLEANING_TYPE_LABELS[schedule.cleaning_type] || schedule.cleaning_type?.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Frequency</p>
                      <p className="font-medium">
                        {FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Scheduled Time</p>
                      <p className="font-medium">{schedule.scheduled_time || '-'}</p>
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
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Floor</p>
                      <p className="font-medium">
                        {schedule.floor_number !== null ? `Floor ${schedule.floor_number}` : 'All Floors'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Assigned Staff</p>
                      <p className="font-medium">{schedule.assigned_staff || 'Unassigned'}</p>
                    </div>
                  </div>
                  {schedule.assigned_staff_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Staff Phone</p>
                        <p className="font-medium">{schedule.assigned_staff_phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

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
                      No tasks have been generated for this schedule yet.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Staff</TableHead>
                        <TableHead>Quality Rating</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="text-sm">
                            {new Date(task.date + 'T00:00:00').toLocaleDateString('en-IN', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                          <TableCell>{getStatusBadge(task.status)}</TableCell>
                          <TableCell className="text-sm">
                            {task.assigned_staff || <span className="text-muted-foreground">-</span>}
                          </TableCell>
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
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {task.inspector_notes || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column - Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tasks</p>
                    <p className="text-xl font-bold">{tasks.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-sm font-medium text-green-600">{completedCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Missed</p>
                    <p className="text-sm font-medium text-red-600">{missedCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Completion Rate</p>
                    <p className="text-sm font-medium">
                      {tasks.length > 0
                        ? `${Math.round((completedCount / tasks.length) * 100)}%`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm font-medium">
                      {schedule.created_at ? new Date(schedule.created_at).toLocaleDateString() : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>
              Update the cleaning schedule details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Block</Label>
              <Select value={editBlockId} onValueChange={setEditBlockId}>
                <SelectTrigger>
                  <SelectValue placeholder="All blocks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Blocks</SelectItem>
                  {Array.isArray(blocks) &&
                    blocks.map((block: { id: string; name: string; code?: string }) => (
                      <SelectItem key={block.id} value={block.id}>
                        {block.name}{block.code ? ` (${block.code})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_floor">Floor Number</Label>
              <Input
                id="edit_floor"
                type="number"
                min={0}
                value={editFloor}
                onChange={(e) => setEditFloor(e.target.value)}
                placeholder="e.g., 1"
              />
            </div>
            <div className="space-y-2">
              <Label>Cleaning Type</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CLEANING_TYPE).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {CLEANING_TYPE_LABELS[value] || key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={editFrequency} onValueChange={setEditFrequency}>
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PM_FREQUENCY).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {FREQUENCY_LABELS[value] || key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_time">Scheduled Time</Label>
              <Input
                id="edit_time"
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_staff">Assigned Staff</Label>
              <Input
                id="edit_staff"
                value={editStaff}
                onChange={(e) => setEditStaff(e.target.value)}
                placeholder="Staff name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Staff Phone</Label>
              <Input
                id="edit_phone"
                value={editStaffPhone}
                onChange={(e) => setEditStaffPhone(e.target.value)}
                placeholder="Phone number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  )
}
