'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useAuth } from '@/hooks/use-auth'
import {
  usePulseConfigs,
  useActivatePulse,
  usePausePulse,
} from '@/hooks/campus-living/use-wellness'
import type { PulseStatus } from '@/types/campus-living'
import {
  Plus,
  Loader2,
  ClipboardList,
  Eye,
  Play,
  Pause,
  Calendar,
} from 'lucide-react'

const statusBadge = (status: string) => {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
    case 'active':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
    case 'paused':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>
    case 'completed':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Completed</Badge>
    case 'archived':
      return <Badge variant="secondary">Archived</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

const frequencyLabel = (freq: string) => {
  switch (freq) {
    case 'weekly': return 'Weekly'
    case 'biweekly': return 'Bi-weekly'
    case 'monthly': return 'Monthly'
    default: return freq
  }
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function WellnessSurveysPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filters = statusFilter !== 'all' ? { status: statusFilter as PulseStatus } : undefined
  const { data: configsData, isLoading } = usePulseConfigs(institutionId, filters)
  const configs = configsData?.data || []

  const activateMutation = useActivatePulse()
  const pauseMutation = usePausePulse()

  const handleActivate = (id: string) => {
    activateMutation.mutate(id)
  }

  const handlePause = (id: string) => {
    pauseMutation.mutate(id)
  }

  if (isLoading) {
    return (
      <ContentLayout title="Wellness Surveys">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Wellness Surveys">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Student Wellness', href: '/campus-living/wellness' },
          { label: 'Surveys' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Wellness Surveys</h1>
            <p className="text-muted-foreground">
              Manage pulse survey configurations and track responses
            </p>
          </div>
          <Button asChild>
            <Link href="/campus-living/wellness/surveys/new">
              <Plus className="mr-2 h-4 w-4" />
              New Survey
            </Link>
          </Button>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {configs.length} survey{configs.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No surveys found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {statusFilter !== 'all'
                    ? 'Try a different status filter or create a new survey'
                    : 'Create your first wellness pulse survey to get started'}
                </p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/campus-living/wellness/surveys/new">
                    <Plus className="mr-1 h-3 w-3" />
                    Create Survey
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Target Blocks</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config: any) => (
                    <TableRow key={config.id}>
                      <TableCell>
                        <div className="font-medium">{config.title}</div>
                        {config.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                            {config.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {frequencyLabel(config.frequency)}
                        </Badge>
                      </TableCell>
                      <TableCell>{statusBadge(config.status)}</TableCell>
                      <TableCell>
                        {config.target_blocks
                          ? <span className="text-sm">{config.target_blocks.length} block{config.target_blocks.length !== 1 ? 's' : ''}</span>
                          : <span className="text-sm text-muted-foreground">All blocks</span>
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatDate(config.starts_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(config.ends_at)}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{config.questions?.length || 0}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/campus-living/wellness/surveys/${config.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {config.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleActivate(config.id)}
                              disabled={activateMutation.isPending}
                              title="Activate"
                            >
                              <Play className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {config.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePause(config.id)}
                              disabled={pauseMutation.isPending}
                              title="Pause"
                            >
                              <Pause className="h-4 w-4 text-yellow-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
