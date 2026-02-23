'use client'

import Link from 'next/link'
import { useState } from 'react'
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
  Plus,
  Loader2,
  CalendarClock,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useCleaningSchedules,
  useCreateCleaningSchedule,
  useDeleteCleaningSchedule,
  useUpdateCleaningSchedule,
} from '@/hooks/campus-living/use-housekeeping'
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks'
import { CLEANING_TYPE, PM_FREQUENCY } from '@/types/campus-living'
import type { HostelCleaningSchedule, CreateCleaningScheduleDTO, CleaningScheduleFilters } from '@/types/campus-living'

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

export default function CleaningSchedulesPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const [blockFilter, setBlockFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeFilter, setActiveFilter] = useState('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Form state
  const [formBlockId, setFormBlockId] = useState('')
  const [formFloor, setFormFloor] = useState('')
  const [formType, setFormType] = useState('')
  const [formFrequency, setFormFrequency] = useState('')
  const [formTime, setFormTime] = useState('06:00')
  const [formStaff, setFormStaff] = useState('')
  const [formStaffPhone, setFormStaffPhone] = useState('')

  const filters: CleaningScheduleFilters = {}
  if (blockFilter !== 'all') filters.block_id = blockFilter
  if (typeFilter !== 'all') filters.cleaning_type = typeFilter as CleaningScheduleFilters['cleaning_type']
  if (activeFilter !== 'all') filters.is_active = activeFilter === 'active'

  const { data: schedulesData, isLoading } = useCleaningSchedules(institutionId, filters)
  const { data: blocksData } = useHostelBlocks(institutionId)
  const createMutation = useCreateCleaningSchedule()
  const deleteMutation = useDeleteCleaningSchedule()
  const updateMutation = useUpdateCleaningSchedule()

  const schedules: HostelCleaningSchedule[] = schedulesData?.data || []
  const blocks = blocksData?.data || blocksData || []

  const resetForm = () => {
    setFormBlockId('')
    setFormFloor('')
    setFormType('')
    setFormFrequency('')
    setFormTime('06:00')
    setFormStaff('')
    setFormStaffPhone('')
  }

  const handleCreate = async () => {
    if (!formType || !formFrequency) return

    const payload: CreateCleaningScheduleDTO = {
      institution_id: institutionId,
      cleaning_type: formType as CreateCleaningScheduleDTO['cleaning_type'],
      frequency: formFrequency as CreateCleaningScheduleDTO['frequency'],
      scheduled_time: formTime || '06:00',
      ...(formBlockId ? { block_id: formBlockId } : {}),
      ...(formFloor ? { floor_number: Number(formFloor) } : {}),
      ...(formStaff ? { assigned_staff: formStaff } : {}),
      ...(formStaffPhone ? { assigned_staff_phone: formStaffPhone } : {}),
    }

    await createMutation.mutateAsync(payload)
    setAddDialogOpen(false)
    resetForm()
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return
    await deleteMutation.mutateAsync(deleteConfirmId)
    setDeleteConfirmId(null)
  }

  const handleToggleActive = async (schedule: HostelCleaningSchedule) => {
    await updateMutation.mutateAsync({
      id: schedule.id,
      payload: { is_active: !schedule.is_active },
    })
  }

  if (isLoading) {
    return (
      <ContentLayout title="Cleaning Schedules">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Cleaning Schedules">
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
              <h1 className="text-2xl font-bold">Cleaning Schedules</h1>
              <p className="text-muted-foreground">
                Manage recurring cleaning schedules across campus
              </p>
            </div>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Schedule
          </Button>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-4">
              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {Array.isArray(blocks) &&
                    blocks.map((block: { id: string; name: string; code?: string }) => (
                      <SelectItem key={block.id} value={block.id}>
                        {block.name}{block.code ? ` (${block.code})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Cleaning Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(CLEANING_TYPE).map(([key, value]) => (
                    <SelectItem key={value} value={value}>
                      {CLEANING_TYPE_LABELS[value] || key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <div className="text-center py-12">
                <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No schedules found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first cleaning schedule to get started.
                </p>
                <Button className="mt-4" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Schedule
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Block</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => {
                    const blockName =
                      (schedule as Record<string, unknown>).hostel_blocks &&
                      typeof (schedule as Record<string, unknown>).hostel_blocks === 'object'
                        ? ((schedule as Record<string, unknown>).hostel_blocks as { name?: string }).name
                        : schedule.block_name
                    return (
                      <TableRow key={schedule.id} className={!schedule.is_active ? 'opacity-60' : ''}>
                        <TableCell className="font-medium">
                          {blockName || <span className="text-muted-foreground">All</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {schedule.floor_number !== null ? `Floor ${schedule.floor_number}` : <span className="text-muted-foreground">All</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {CLEANING_TYPE_LABELS[schedule.cleaning_type] || schedule.cleaning_type?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}
                        </TableCell>
                        <TableCell className="text-sm">
                          {schedule.scheduled_time || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {schedule.assigned_staff || <span className="text-muted-foreground">Unassigned</span>}
                        </TableCell>
                        <TableCell>
                          {schedule.is_active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/campus-living/housekeeping/schedules/${schedule.id}`}>
                                View
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(schedule)}
                              disabled={updateMutation.isPending}
                            >
                              {schedule.is_active ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(schedule.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
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

      {/* Add Schedule Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Cleaning Schedule</DialogTitle>
            <DialogDescription>
              Create a new recurring cleaning schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Block (optional)</Label>
              <Select value={formBlockId} onValueChange={setFormBlockId}>
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
              <Label htmlFor="floor_number">Floor Number (optional)</Label>
              <Input
                id="floor_number"
                type="number"
                min={0}
                value={formFloor}
                onChange={(e) => setFormFloor(e.target.value)}
                placeholder="e.g., 1"
              />
            </div>
            <div className="space-y-2">
              <Label>Cleaning Type *</Label>
              <Select value={formType} onValueChange={setFormType}>
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
              <Label>Frequency *</Label>
              <Select value={formFrequency} onValueChange={setFormFrequency}>
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
              <Label htmlFor="scheduled_time">Scheduled Time</Label>
              <Input
                id="scheduled_time"
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_staff">Assigned Staff</Label>
              <Input
                id="assigned_staff"
                value={formStaff}
                onChange={(e) => setFormStaff(e.target.value)}
                placeholder="Staff name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_staff_phone">Staff Phone</Label>
              <Input
                id="assigned_staff_phone"
                value={formStaffPhone}
                onChange={(e) => setFormStaffPhone(e.target.value)}
                placeholder="Phone number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm() }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !formType || !formFrequency}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Schedule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this cleaning schedule? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  )
}
