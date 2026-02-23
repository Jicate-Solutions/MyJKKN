'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { useRecentActivity } from '@/hooks/campus-living/use-activity-hub'
import type { ActivityType } from '@/types/campus-living'
import {
  Wrench,
  DoorOpen,
  ShieldAlert,
  HeartPulse,
  ClipboardCheck,
  SprayCan,
  WashingMachine,
  ClipboardPlus,
  Loader2,
  Search,
  Activity,
  type LucideIcon,
} from 'lucide-react'

// ── Icon + color config per activity type ──────────────────────────────
const ACTIVITY_CONFIG: Record<
  ActivityType,
  { icon: LucideIcon; dotColor: string; borderColor: string; bgColor: string; label: string }
> = {
  maintenance: {
    icon: Wrench,
    dotColor: 'bg-orange-500',
    borderColor: 'border-l-orange-500',
    bgColor: 'bg-orange-50 text-orange-600',
    label: 'Maintenance',
  },
  leave: {
    icon: DoorOpen,
    dotColor: 'bg-blue-500',
    borderColor: 'border-l-blue-500',
    bgColor: 'bg-blue-50 text-blue-600',
    label: 'Leave',
  },
  incident: {
    icon: ShieldAlert,
    dotColor: 'bg-red-500',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-50 text-red-600',
    label: 'Incident',
  },
  health: {
    icon: HeartPulse,
    dotColor: 'bg-pink-500',
    borderColor: 'border-l-pink-500',
    bgColor: 'bg-pink-50 text-pink-600',
    label: 'Health',
  },
  pm_task: {
    icon: ClipboardCheck,
    dotColor: 'bg-purple-500',
    borderColor: 'border-l-purple-500',
    bgColor: 'bg-purple-50 text-purple-600',
    label: 'PM Task',
  },
  cleaning: {
    icon: SprayCan,
    dotColor: 'bg-green-500',
    borderColor: 'border-l-green-500',
    bgColor: 'bg-green-50 text-green-600',
    label: 'Cleaning',
  },
  laundry: {
    icon: WashingMachine,
    dotColor: 'bg-cyan-500',
    borderColor: 'border-l-cyan-500',
    bgColor: 'bg-cyan-50 text-cyan-600',
    label: 'Laundry',
  },
  onboarding: {
    icon: ClipboardPlus,
    dotColor: 'bg-indigo-500',
    borderColor: 'border-l-indigo-500',
    bgColor: 'bg-indigo-50 text-indigo-600',
    label: 'Onboarding',
  },
}

// ── Status badge color mapping ─────────────────────────────────────────
function statusBadgeVariant(status: string) {
  const s = status?.toLowerCase() ?? ''
  if (['resolved', 'completed', 'approved', 'done', 'delivered'].includes(s))
    return 'bg-green-100 text-green-700 border-green-200'
  if (['in_progress', 'in-progress', 'processing', 'assigned', 'active'].includes(s))
    return 'bg-blue-100 text-blue-700 border-blue-200'
  if (['pending', 'submitted', 'new', 'open', 'requested'].includes(s))
    return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  if (['rejected', 'cancelled', 'failed', 'overdue'].includes(s))
    return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-700 border-gray-200'
}

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Filter options ─────────────────────────────────────────────────────
const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'leave', label: 'Leave' },
  { value: 'incident', label: 'Incident' },
  { value: 'health', label: 'Health' },
  { value: 'pm_task', label: 'PM Task' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'onboarding', label: 'Onboarding' },
]

// ── Page Component ─────────────────────────────────────────────────────
export default function ActivityFeedPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const [activityType, setActivityType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: activities, isLoading } = useRecentActivity(institutionId, {
    activity_type: activityType === 'all' ? undefined : (activityType as ActivityType),
    limit: 100,
  })

  // Client-side search filter
  const filteredActivities = useMemo(() => {
    if (!activities) return []
    if (!searchQuery.trim()) return activities

    const q = searchQuery.toLowerCase()
    return activities.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.block_name && item.block_name.toLowerCase().includes(q))
    )
  }, [activities, searchQuery])

  return (
    <ContentLayout title="Activity Feed">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Activity Feed</h1>
          <p className="text-muted-foreground">
            Recent activity across all campus living modules
          </p>
        </div>

        {/* Filter Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, description, or block..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredActivities.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Activity className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
              <p className="text-muted-foreground text-sm font-medium">
                No activity found
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery
                  ? 'Try adjusting your search or filter criteria'
                  : 'Activity from maintenance, leave, incidents, and other modules will appear here'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Activity Timeline */}
        {!isLoading && filteredActivities.length > 0 && (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

            <div className="space-y-1">
              {filteredActivities.map((item) => {
                const config = ACTIVITY_CONFIG[item.type]
                const Icon = config.icon

                return (
                  <Link key={`${item.type}-${item.id}`} href={item.link} className="block group">
                    <div className="relative flex items-start gap-4 py-3 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                      {/* Timeline dot */}
                      <div className="relative z-10 flex-shrink-0 mt-0.5">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center ${config.bgColor}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                              {item.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {item.description}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-5 ${statusBadgeVariant(item.status)}`}
                            >
                              {formatStatus(item.status)}
                            </Badge>
                          </div>
                        </div>

                        {/* Meta row: type label + block name */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.bgColor}`}
                          >
                            {config.label}
                          </span>
                          {item.block_name && (
                            <span className="text-[11px] text-muted-foreground">
                              {item.block_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  )
}
