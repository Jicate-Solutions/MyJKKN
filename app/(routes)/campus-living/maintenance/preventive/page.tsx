'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  CalendarClock,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Play,
  Pause,
  ListChecks,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePmSchedules } from '@/hooks/campus-living/use-pm-schedules'
import type { HostelPmSchedule } from '@/types/campus-living'

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  yearly: 'Yearly',
}

export default function PreventiveMaintenancePage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data: schedulesData, isLoading } = usePmSchedules(institutionId)
  const schedules: HostelPmSchedule[] = (schedulesData?.data as HostelPmSchedule[] | undefined) || []

  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter
    return matchesSearch && matchesStatus && matchesCategory
  })

  const today = new Date()
  const nextWeek = new Date()
  nextWeek.setDate(today.getDate() + 7)
  const todayStr = today.toISOString().split('T')[0]
  const nextWeekStr = nextWeek.toISOString().split('T')[0]

  const activeCount = schedules.filter((s) => s.status === 'active').length
  const dueThisWeek = schedules.filter(
    (s) => s.status === 'active' && s.next_due_date >= todayStr && s.next_due_date <= nextWeekStr
  ).length
  const overdueCount = schedules.filter(
    (s) => s.status === 'active' && s.next_due_date < todayStr
  ).length
  const completedCount = schedules.reduce((sum, s) => sum + (s.total_completions || 0), 0)

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

  if (isLoading) {
    return (
      <ContentLayout title="Preventive Maintenance">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Preventive Maintenance">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Preventive Maintenance Schedules</h1>
            <p className="text-muted-foreground">
              Schedule and track recurring maintenance tasks across campus
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/maintenance/preventive/tasks">
                <ListChecks className="mr-2 h-4 w-4" />
                View Tasks
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/maintenance/preventive/new">
                <Plus className="mr-2 h-4 w-4" />
                New Schedule
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
              <Play className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
              <CalendarClock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{dueThisWeek}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedCount}</div>
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
                  placeholder="Search schedules..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="civil">Civil</SelectItem>
                  <SelectItem value="pest_control">Pest Control</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="internet">Internet</SelectItem>
                  <SelectItem value="water_supply">Water Supply</SelectItem>
                  <SelectItem value="furniture">Furniture</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredSchedules.length === 0 ? (
              <div className="text-center py-12">
                <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No schedules found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {schedules.length === 0
                    ? 'Create your first preventive maintenance schedule to get started.'
                    : 'Try adjusting your filters to find what you are looking for.'}
                </p>
                {schedules.length === 0 && (
                  <Button className="mt-4" asChild>
                    <Link href="/campus-living/maintenance/preventive/new">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Schedule
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((schedule) => {
                    const isOverdue = schedule.status === 'active' && schedule.next_due_date < todayStr
                    return (
                      <TableRow key={schedule.id} className={isOverdue ? 'bg-red-50' : ''}>
                        <TableCell>
                          <div className="font-medium">{schedule.title}</div>
                          {schedule.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {schedule.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {schedule.category?.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {FREQUENCY_LABELS[schedule.frequency] || schedule.frequency}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(schedule as Record<string, unknown>).hostel_blocks
                            ? ((schedule as Record<string, unknown>).hostel_blocks as { name: string }).name
                            : schedule.block_id
                              ? 'Block'
                              : <span className="text-muted-foreground">All</span>}
                        </TableCell>
                        <TableCell>
                          <div className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                            {schedule.next_due_date
                              ? new Date(schedule.next_due_date + 'T00:00:00').toLocaleDateString()
                              : '-'}
                          </div>
                          {isOverdue && (
                            <span className="text-xs text-red-600">Overdue</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {schedule.assigned_to_name || (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(schedule.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/campus-living/maintenance/preventive/${schedule.id}`}>
                              View
                            </Link>
                          </Button>
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
