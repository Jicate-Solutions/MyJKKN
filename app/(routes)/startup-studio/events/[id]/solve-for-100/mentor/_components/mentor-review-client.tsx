'use client'

import { useState } from 'react'
import { useUnreviewedCheckins, useMentorReview, useSolve100TeamOverviews } from '@/hooks/startup-studio/use-solve100-weekly'
import { getCurrentWeekNumber, APP_STATUS_OPTIONS, STATUS_COLORS } from '@/lib/constants/startup-studio/solve100'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, AlertTriangle, Clock, TrendingUp, Users, Loader2 } from 'lucide-react'
import type { Solve100WeeklyCheckin, Solve100AppStatus } from '@/types/startup-studio'

interface Props {
  eventId: string
  eventStartDate: string | null
}

function ReviewCard({ checkin, eventId }: { checkin: Solve100WeeklyCheckin; eventId: string }) {
  const [notes, setNotes] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const mentorReviewMutation = useMentorReview(eventId)

  const handleReview = () => {
    mentorReviewMutation.mutate({
      checkinId: checkin.id,
      dto: { mentor_notes: notes.trim() },
    })
  }

  return (
    <Card className="border-l-4 border-l-amber-400">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{checkin.team_name || 'Unknown Team'}</CardTitle>
            <CardDescription className="text-xs">
              {checkin.institution_name} — Week {checkin.week_number}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {checkin.app_status && (
              <Badge className={STATUS_COLORS[checkin.app_status]} variant="secondary">
                {APP_STATUS_OPTIONS.find(o => o.value === checkin.app_status)?.label}
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="h-3 w-3" /> {checkin.verified_paid_users} paid
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Commitment */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Commitment</p>
          <p className="text-sm">&ldquo;{checkin.commitment}&rdquo;</p>
        </div>

        {/* Results from previous commitment */}
        {checkin.commitment_met !== null && (
          <div className="flex items-center gap-2">
            {checkin.commitment_met ? (
              <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> Met</Badge>
            ) : (
              <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Not Met</Badge>
            )}
            {checkin.commitment_result && (
              <span className="text-sm text-muted-foreground">{checkin.commitment_result}</span>
            )}
          </div>
        )}

        {/* Metrics Row */}
        <div className="flex gap-4 text-sm">
          <span>Users: <strong>{checkin.total_users}</strong></span>
          <span>Active: <strong>{checkin.active_users}</strong></span>
          <span>Paid: <strong>{checkin.verified_paid_users}</strong></span>
        </div>

        {/* Blocker */}
        {checkin.biggest_blocker && (
          <div className="bg-red-50 dark:bg-red-900/10 p-2 rounded text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            {checkin.biggest_blocker}
          </div>
        )}

        {/* Review Section */}
        {!isOpen ? (
          <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
            Add Review
          </Button>
        ) : (
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm">Mentor Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Your feedback for this team..."
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleReview}
                disabled={mentorReviewMutation.isPending || !notes.trim()}
                className="gap-1"
              >
                {mentorReviewMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                <CheckCircle2 className="h-3 w-3" /> Mark Reviewed
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
            </div>
            {mentorReviewMutation.isError && (
              <p className="text-xs text-red-600">Failed to save review. Please try again.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function MentorReviewClient({ eventId, eventStartDate }: Props) {
  const { data: unreviewed, isLoading: unreviewedLoading } = useUnreviewedCheckins(eventId)
  const { data: teams, isLoading: teamsLoading } = useSolve100TeamOverviews(eventId)

  const currentWeek = eventStartDate ? getCurrentWeekNumber(eventStartDate) : 1
  const isLoading = unreviewedLoading || teamsLoading

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />

  const unreviewedCount = unreviewed?.length ?? 0

  // Alerts: teams with 0 progress for 2+ weeks, unresolved blockers
  const alerts = (teams ?? []).filter(t => {
    const weeksMissing = currentWeek - t.current_week
    const hasUnresolvedBlocker = !!t.biggest_blocker
    return weeksMissing >= 2 || hasUnresolvedBlocker
  })

  return (
    <Tabs defaultValue="unreviewed" className="space-y-4">
      <TabsList>
        <TabsTrigger value="unreviewed" className="gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Needs Review
          {unreviewedCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{unreviewedCount}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="alerts" className="gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Alerts
          {alerts.length > 0 && (
            <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{alerts.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="teams" className="gap-1.5">
          <Users className="h-3.5 w-3.5" />
          All Teams
        </TabsTrigger>
      </TabsList>

      {/* Unreviewed Tab */}
      <TabsContent value="unreviewed" className="space-y-4">
        {unreviewedCount === 0 ? (
          <Card>
            <CardContent className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p>All check-ins have been reviewed!</p>
            </CardContent>
          </Card>
        ) : (
          (unreviewed ?? []).map(checkin => (
            <ReviewCard key={checkin.id} checkin={checkin} eventId={eventId} />
          ))
        )}
      </TabsContent>

      {/* Alerts Tab */}
      <TabsContent value="alerts" className="space-y-4">
        {alerts.length === 0 ? (
          <Card>
            <CardContent className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
              <p>No alerts — all teams are on track.</p>
            </CardContent>
          </Card>
        ) : (
          alerts.map(team => {
            const weeksMissing = currentWeek - team.current_week
            return (
              <Card key={team.team_id} className="border-l-4 border-l-red-400">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{team.team_name}</p>
                      <p className="text-xs text-muted-foreground">{team.institution_name}</p>
                    </div>
                    <div className="flex gap-2">
                      {weeksMissing >= 2 && (
                        <Badge variant="destructive" className="gap-1">
                          <Clock className="h-3 w-3" /> {weeksMissing} weeks behind
                        </Badge>
                      )}
                      {team.biggest_blocker && (
                        <Badge variant="outline" className="text-red-600 border-red-200 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Blocker
                        </Badge>
                      )}
                    </div>
                  </div>
                  {team.biggest_blocker && (
                    <p className="text-sm text-red-600 dark:text-red-400">{team.biggest_blocker}</p>
                  )}
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Paid: {team.verified_paid_users}</span>
                    <span>Active: {team.active_users}</span>
                    <span>Weeks submitted: {team.weeks_submitted}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </TabsContent>

      {/* All Teams Tab */}
      <TabsContent value="teams" className="space-y-3">
        {(teams ?? []).length === 0 ? (
          <Card>
            <CardContent className="text-center py-10 text-muted-foreground">
              No teams in Solve for 100 yet.
            </CardContent>
          </Card>
        ) : (
          (teams ?? []).map(team => (
            <Card key={team.team_id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{team.team_name}</p>
                    <p className="text-xs text-muted-foreground">{team.institution_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {team.app_status && (
                      <Badge className={STATUS_COLORS[team.app_status]} variant="secondary">
                        {APP_STATUS_OPTIONS.find(o => o.value === team.app_status)?.label}
                      </Badge>
                    )}
                    <Badge variant="outline">{team.verified_paid_users} paid</Badge>
                    <Badge variant="outline">{team.weeks_submitted} weeks</Badge>
                    {team.has_icp && (
                      <Badge variant="outline" className="text-green-600 border-green-200">ICP</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>
    </Tabs>
  )
}
