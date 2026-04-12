'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Users, TrendingUp, AlertTriangle, AppWindow, ClipboardCheck, FileText, Eye, UserCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSolve100Dashboard, useSolve100TeamOverviews } from '@/hooks/startup-studio/use-solve100-weekly'
import { APP_STATUS_OPTIONS, getCurrentWeekNumber, STATUS_COLORS } from '@/lib/constants/startup-studio/solve100'
import type { Solve100AppStatus } from '@/types/startup-studio'

interface Props {
  eventId: string
  eventStartDate: string | null
}

export function Solve100HubClient({ eventId, eventStartDate }: Props) {
  const { data: stats, isLoading: statsLoading } = useSolve100Dashboard(eventId)
  const { data: teams, isLoading: teamsLoading } = useSolve100TeamOverviews(eventId)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const currentWeek = eventStartDate ? getCurrentWeekNumber(eventStartDate) : 1
  const isLoading = statsLoading || teamsLoading

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />

  const filteredTeams = (teams ?? []).filter(t => {
    if (search && !(t.team_name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter !== 'all' && t.app_status !== statusFilter) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total_teams ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" /> Avg Paid Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.average_paid_users ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4" /> Week {currentWeek} Check-ins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stats?.checkins_this_week ?? 0}
              <span className="text-sm text-muted-foreground font-normal">/{stats?.total_teams ?? 0}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats?.teams_with_blockers ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* App Status Breakdown */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {APP_STATUS_OPTIONS.map(opt => (
            <Badge key={opt.value} variant="outline" className="gap-1.5 text-xs">
              <AppWindow className="h-3 w-3" />
              {opt.label}: {stats.teams_by_app_status[opt.value as Solve100AppStatus] ?? 0}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters + Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="App status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {APP_STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 sm:ml-auto">
          <Link href={`/startup-studio/events/${eventId}/solve-for-100/weekly`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <FileText className="h-4 w-4" /> Weekly Check-in
            </Button>
          </Link>
          <Link href={`/startup-studio/events/${eventId}/solve-for-100/icp`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Eye className="h-4 w-4" /> ICP Builder
            </Button>
          </Link>
        </div>
      </div>

      {/* Team Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">Week</TableHead>
                <TableHead className="text-center">Paid Users</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead>App Status</TableHead>
                <TableHead>Blocker</TableHead>
                <TableHead className="text-center">ICP</TableHead>
                <TableHead className="text-center">Weeks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {(teams ?? []).length === 0
                      ? 'No teams have declared Solve for 100 yet.'
                      : 'No teams match your filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTeams.map(team => (
                  <TableRow key={team.team_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{team.team_name}</p>
                        {team.institution_name && (
                          <p className="text-xs text-muted-foreground">{team.institution_name}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{team.current_week || '—'}</TableCell>
                    <TableCell className="text-center font-semibold">{team.verified_paid_users}</TableCell>
                    <TableCell className="text-center">{team.active_users}</TableCell>
                    <TableCell>
                      {team.app_status ? (
                        <Badge className={STATUS_COLORS[team.app_status]} variant="secondary">
                          {APP_STATUS_OPTIONS.find(o => o.value === team.app_status)?.label ?? team.app_status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {team.biggest_blocker ? (
                        <span className="text-sm text-red-600 dark:text-red-400 line-clamp-1">
                          {team.biggest_blocker}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {team.has_icp ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">Yes</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{team.weeks_submitted}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
