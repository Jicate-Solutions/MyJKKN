'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, MapPin, Users, CheckCircle2, XCircle } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import type { SHTrainingSessionWithDetails, SessionStatus } from '@/types/solutions'

interface SessionCardProps {
  session: SHTrainingSessionWithDetails
  showClaimButton?: boolean
  onClaim?: () => void
  isClaiming?: boolean
  canClaim?: boolean
}

const sessionStatusConfig: Record<SessionStatus, { label: string; color: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  rescheduled: { label: 'Rescheduled', color: 'bg-orange-100 text-orange-800' },
}

export function SessionCard({
  session,
  showClaimButton = false,
  onClaim,
  isClaiming = false,
  canClaim = true,
}: SessionCardProps) {
  const statusInfo = sessionStatusConfig[session.status]
  const isScheduled = session.status === 'scheduled'
  const scheduledDate = session.session_date ? new Date(session.session_date + 'T00:00:00') : null
  const isSessionToday = scheduledDate && isToday(scheduledDate)
  const isSessionPast = scheduledDate && isPast(scheduledDate) && !isToday(scheduledDate)

  // Get assigned members count
  const assignedCount = session.assignments?.length || 0

  return (
    <Card className={isSessionToday ? 'border-green-500 border-2' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Session {session.session_number}
            </span>
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </div>
          {isSessionToday && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Today
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg">
          {session.title || `Session ${session.session_number}`}
        </CardTitle>
        {session.notes && (
          <CardDescription className="line-clamp-2">{session.notes}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Schedule Details */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {scheduledDate && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{format(scheduledDate, 'MMM dd, yyyy')}</span>
            </div>
          )}

          {scheduledDate && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{format(scheduledDate, 'h:mm a')}</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{session.duration_minutes} mins</span>
          </div>

          {session.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span className="truncate max-w-[150px]">{session.location}</span>
            </div>
          )}
        </div>

        {/* Assigned Members */}
        {session.assignments && session.assignments.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-sm font-medium mb-2 flex items-center gap-1">
              <Users className="h-4 w-4" />
              Assigned ({assignedCount})
            </div>
            <div className="flex flex-wrap gap-2">
              {session.assignments.map((assignment) => (
                <Badge
                  key={assignment.id}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {assignment.cohort_member?.name || 'Unknown'}
                  <span className="text-xs opacity-75">({assignment.role})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Completion Status */}
        {session.status === 'completed' && (
          <div className="pt-2 border-t flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Completed</span>
            </div>
            {session.attendance_count !== null && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{session.attendance_count} attended</span>
              </div>
            )}
          </div>
        )}

        {session.status === 'cancelled' && (
          <div className="pt-2 border-t flex items-center gap-1 text-sm text-red-600">
            <XCircle className="h-4 w-4" />
            <span>Session was cancelled</span>
          </div>
        )}

        {/* Claim Button */}
        {showClaimButton && isScheduled && !isSessionPast && canClaim && (
          <div className="pt-2 border-t">
            <Button
              className="w-full"
              onClick={onClaim}
              disabled={isClaiming || assignedCount > 0}
            >
              {isClaiming ? 'Claiming...' : assignedCount > 0 ? 'Already Assigned' : 'Claim Session'}
            </Button>
          </div>
        )}

        {showClaimButton && isScheduled && !isSessionPast && !canClaim && (
          <div className="pt-2 border-t">
            <p className="text-sm text-amber-600 text-center">
              This session requires HOD/MD approval to claim
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
