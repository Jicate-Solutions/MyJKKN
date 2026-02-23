'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import {
  useManagementSummary,
  useBlockOccupancy,
  useAttendanceTrend,
  useMaintenanceByCategory,
} from '@/hooks/campus-living/use-dashboard'
import {
  Building2,
  UserCheck,
  Wrench,
  Clock,
  AlertTriangle,
  CalendarX2,
  RefreshCw,
  HeartPulse,
  Loader2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'

// ── Color helpers ────────────────────────────────────────────────────────
function slaColor(pct: number) {
  if (pct > 90) return 'text-green-600 bg-green-50 border-green-200'
  if (pct > 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

function wellnessColor(score: number | null) {
  if (score === null) return 'text-muted-foreground bg-muted/50 border-muted'
  if (score > 3.5) return 'text-green-600 bg-green-50 border-green-200'
  if (score > 2.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

function countColor(count: number, dangerTheme: 'red' | 'orange' | 'yellow') {
  if (count <= 0) return 'text-green-600 bg-green-50 border-green-200'
  const map = {
    red: 'text-red-600 bg-red-50 border-red-200',
    orange: 'text-orange-600 bg-orange-50 border-orange-200',
    yellow: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  }
  return map[dangerTheme]
}

// ── Category color dots ──────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  electrical: 'bg-yellow-500',
  plumbing: 'bg-blue-500',
  carpentry: 'bg-amber-700',
  cleaning: 'bg-green-500',
  furniture: 'bg-orange-500',
  pest_control: 'bg-red-500',
  civil: 'bg-gray-500',
  networking: 'bg-purple-500',
  hvac: 'bg-cyan-500',
  other: 'bg-slate-400',
}

function categoryDotColor(category: string) {
  return CATEGORY_COLORS[category.toLowerCase()] ?? 'bg-slate-400'
}

function formatCategoryLabel(raw: string) {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── KPI card type ────────────────────────────────────────────────────────
interface KPICard {
  label: string
  value: string
  subtitle: string
  icon: LucideIcon
  colorClass: string
  href: string
}

// ── Main component ───────────────────────────────────────────────────────
export default function ManagementDashboardPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: summary, isLoading: summaryLoading } = useManagementSummary(institutionId || undefined)
  const { data: blockOccupancy, isLoading: blocksLoading } = useBlockOccupancy(institutionId || undefined)
  const { data: attendanceTrend, isLoading: trendLoading } = useAttendanceTrend(institutionId || undefined, 7)
  const { data: maintenanceCategories, isLoading: catLoading } = useMaintenanceByCategory(institutionId || undefined)

  const isLoading = summaryLoading || blocksLoading || trendLoading || catLoading

  // ── Build KPI cards from summary data ──────────────────────────────────
  const kpiCards: KPICard[] = useMemo(() => {
    if (!summary) return []

    return [
      {
        label: 'Occupancy Rate',
        value: `${summary.occupancy_rate}%`,
        subtitle: `${summary.occupied_beds}/${summary.total_beds} beds`,
        icon: Building2,
        colorClass: 'text-primary bg-primary/10 border-primary/20',
        href: '/campus-living/occupancy',
      },
      {
        label: "Today's Attendance",
        value: `${summary.today_attendance}/${summary.total_residents}`,
        subtitle: summary.total_residents > 0
          ? `${Math.round((summary.today_attendance / summary.total_residents) * 100)}% checked in`
          : 'No residents',
        icon: UserCheck,
        colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
        href: '/campus-living/attendance',
      },
      {
        label: 'Open Maintenance',
        value: `${summary.open_maintenance}`,
        subtitle: 'Active requests',
        icon: Wrench,
        colorClass: countColor(summary.open_maintenance, 'orange'),
        href: '/campus-living/maintenance',
      },
      {
        label: 'SLA Compliance',
        value: `${summary.sla_compliance}%`,
        subtitle: 'Resolution within SLA',
        icon: Clock,
        colorClass: slaColor(summary.sla_compliance),
        href: '/campus-living/maintenance',
      },
      {
        label: 'Active Incidents',
        value: `${summary.active_incidents}`,
        subtitle: 'Unresolved incidents',
        icon: AlertTriangle,
        colorClass: countColor(summary.active_incidents, 'red'),
        href: '/campus-living/incidents',
      },
      {
        label: 'Pending Leave',
        value: `${summary.pending_leave}`,
        subtitle: 'Awaiting approval',
        icon: CalendarX2,
        colorClass: countColor(summary.pending_leave, 'yellow'),
        href: '/campus-living/leave',
      },
      {
        label: 'Overdue PM Tasks',
        value: `${summary.overdue_pm_tasks}`,
        subtitle: 'Past due date',
        icon: RefreshCw,
        colorClass: countColor(summary.overdue_pm_tasks, 'red'),
        href: '/campus-living/maintenance/pm',
      },
      {
        label: 'Wellness Score',
        value: summary.wellness_score !== null ? `${summary.wellness_score}/5` : 'N/A',
        subtitle: summary.wellness_score !== null ? 'Last 30 days avg' : 'No survey data',
        icon: HeartPulse,
        colorClass: wellnessColor(summary.wellness_score),
        href: '/campus-living/wellness',
      },
    ]
  }, [summary])

  // ── Attendance trend chart helpers ─────────────────────────────────────
  const trendMax = useMemo(() => {
    if (!attendanceTrend || attendanceTrend.length === 0) return 1
    return Math.max(...attendanceTrend.map((d) => d.count), 1)
  }, [attendanceTrend])

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ContentLayout title="Management Dashboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  // ── Empty / error state ────────────────────────────────────────────────
  if (!summary) {
    return (
      <ContentLayout title="Management Dashboard">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Management Dashboard</h1>
            <p className="text-muted-foreground">
              Executive overview of hostel operations
            </p>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4 opacity-40" />
              <p className="text-muted-foreground text-sm">No data available</p>
              <p className="text-xs text-muted-foreground mt-1">
                Configure hostel blocks and rooms to see dashboard metrics
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Management Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Management Dashboard</h1>
          <p className="text-muted-foreground">
            Executive overview of hostel operations
          </p>
        </div>

        {/* ── KPI Cards ── 4 cols desktop, 2 cols mobile ────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Link key={kpi.label} href={kpi.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`rounded-lg p-2 ${kpi.colorClass}`}>
                      <kpi.icon className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{kpi.subtitle}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* ── Charts Row ── 2 columns ──────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Block-wise Occupancy — horizontal bars */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Block-wise Occupancy</CardTitle>
            </CardHeader>
            <CardContent>
              {!blockOccupancy || blockOccupancy.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No block data available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockOccupancy.map((block) => (
                    <div key={block.block_id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate mr-2">{block.block_name}</span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap">
                          {block.occupied_beds}/{block.total_beds} ({block.rate}%)
                        </span>
                      </div>
                      <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            block.rate >= 90
                              ? 'bg-red-500'
                              : block.rate >= 70
                                ? 'bg-yellow-500'
                                : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(block.rate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 7-Day Attendance Trend — vertical bars */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">7-Day Attendance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {!attendanceTrend || attendanceTrend.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <UserCheck className="h-8 w-8 text-muted-foreground mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No attendance data available</p>
                </div>
              ) : (
                <div className="flex items-end gap-2 h-40">
                  {attendanceTrend.map((day) => {
                    const heightPct = trendMax > 0 ? (day.count / trendMax) * 100 : 0
                    const dateObj = new Date(day.date + 'T00:00:00')
                    const dayLabel = dateObj.toLocaleDateString('en-IN', { weekday: 'short' })
                    const dateLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        {/* Count label */}
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {day.count}
                        </span>
                        {/* Bar */}
                        <div className="w-full flex justify-center" style={{ height: '120px' }}>
                          <div className="relative w-full max-w-[32px] bg-muted rounded-t overflow-hidden flex items-end">
                            <div
                              className="w-full bg-blue-500 rounded-t transition-all"
                              style={{ height: `${Math.max(heightPct, 4)}%` }}
                            />
                          </div>
                        </div>
                        {/* Date labels */}
                        <span className="text-[10px] text-muted-foreground leading-tight">{dayLabel}</span>
                        <span className="text-[9px] text-muted-foreground/70 leading-tight">{dateLabel}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Bottom Row ── Maintenance + Quick Stats ──────────────── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Maintenance by Category */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Maintenance by Category</CardTitle>
              <Link
                href="/campus-living/maintenance"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {!maintenanceCategories || maintenanceCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Wrench className="h-8 w-8 text-muted-foreground mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">No open maintenance requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {maintenanceCategories.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-2.5 w-2.5 rounded-full ${categoryDotColor(cat.category)}`} />
                        <span className="text-sm">{formatCategoryLabel(cat.category)}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{cat.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Active Health Cases */}
                <Link href="/campus-living/wellness" className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${summary.active_health_cases > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                        <HeartPulse className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Active Health Cases</p>
                        <p className="text-xs text-muted-foreground">Students requiring medical attention</p>
                      </div>
                    </div>
                    <span className={`text-lg font-bold ${summary.active_health_cases > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {summary.active_health_cases}
                    </span>
                  </div>
                </Link>

                {/* Expiring Contracts */}
                <Link href="/campus-living/maintenance/amc" className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${summary.expiring_contracts > 0 ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'}`}>
                        <Clock className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Expiring Contracts</p>
                        <p className="text-xs text-muted-foreground">AMC contracts expiring within 30 days</p>
                      </div>
                    </div>
                    <span className={`text-lg font-bold ${summary.expiring_contracts > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {summary.expiring_contracts}
                    </span>
                  </div>
                </Link>

                {/* Bed availability summary */}
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="rounded-lg p-2 bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium">Bed Availability</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{summary.total_beds}</p>
                      <p className="text-[11px] text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">{summary.total_beds - summary.occupied_beds}</p>
                      <p className="text-[11px] text-muted-foreground">Available</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-orange-600">{summary.occupied_beds}</p>
                      <p className="text-[11px] text-muted-foreground">Occupied</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  )
}
