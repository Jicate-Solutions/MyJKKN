'use client'

import { useDeclarationSummary, useEventDeclarations } from '@/hooks/startup-studio/use-track-declarations'
import { useEventStats } from '@/hooks/startup-studio/use-events'
import { TRACKS } from '@/lib/constants/startup-studio/tracks'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { format } from 'date-fns'

interface Props {
  eventId: string
}

export function DeclarationsTab({ eventId }: Props) {
  const { data: summary, isLoading: summaryLoading } = useDeclarationSummary(eventId)
  const { data: declarations, isLoading: declLoading } = useEventDeclarations(eventId)
  const { data: stats } = useEventStats(eventId)

  const totalTeams = stats?.total_teams ?? 0
  const declared = declarations?.length ?? 0
  const notDeclared = Math.max(0, totalTeams - declared)

  if (summaryLoading || declLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards — one per track + not declared */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TRACKS.map(track => {
          const s = summary?.find(s => s.track === track.id)
          return (
            <Card key={track.id}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground truncate">
                  {track.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{s?.count ?? 0}</p>
                <p className="text-xs text-muted-foreground">{s?.percentage ?? 0}% of declared</p>
              </CardContent>
            </Card>
          )
        })}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Not Declared
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{notDeclared}</p>
            <p className="text-xs text-muted-foreground">of {totalTeams} teams</p>
          </CardContent>
        </Card>
      </div>

      {/* Full declarations table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Declarations ({declared})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Declared</TableHead>
                <TableHead>Mentor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(declarations ?? []).map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.team_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {d.institution_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {d.track.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(d.declared_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    {d.mentor_approved === null ? (
                      <span className="text-muted-foreground text-xs">Pending</span>
                    ) : d.mentor_approved ? (
                      <Badge variant="default" className="text-xs">Approved</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Rejected</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(declarations ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    No declarations yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
