'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calendar,
  Clock,
  FileText,
  MapPin,
  Search,
  Users,
  ExternalLink,
  Video,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface Meeting {
  id: string
  title: string
  body_name?: string
  body_id?: string
  date: string
  time?: string
  location?: string
  meeting_type?: 'physical' | 'virtual' | 'hybrid'
  status?: 'scheduled' | 'completed' | 'cancelled' | 'postponed'
  minutes_url?: string
  agenda?: string
  attendees_count?: number
  key_decisions?: string[]
  created_at?: string
}

interface MeetingListProps {
  meetings: Meeting[]
  institutionId?: string
}

const meetingStatusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  scheduled: { variant: 'outline', label: 'Scheduled' },
  completed: { variant: 'default', label: 'Completed' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
  postponed: { variant: 'secondary', label: 'Postponed' },
}

const meetingTypeConfig: Record<string, { icon: React.ReactNode; label: string }> = {
  physical: { icon: <MapPin className="h-3.5 w-3.5" />, label: 'Physical' },
  virtual: { icon: <Video className="h-3.5 w-3.5" />, label: 'Virtual' },
  hybrid: { icon: <Users className="h-3.5 w-3.5" />, label: 'Hybrid' },
}

export function MeetingList({ meetings, institutionId }: MeetingListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null)

  // Unique body names for filter
  const bodyNames = useMemo(() => {
    return [...new Set(meetings.map((m) => m.body_name).filter(Boolean))] as string[]
  }, [meetings])

  // Filtered + sorted meetings
  const filteredMeetings = useMemo(() => {
    return meetings
      .filter((m) => {
        const matchesSearch = searchQuery === '' ||
          m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.body_name && m.body_name.toLowerCase().includes(searchQuery.toLowerCase()))

        const matchesStatus = statusFilter === 'all' || m.status === statusFilter

        return matchesSearch && matchesStatus
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [meetings, searchQuery, statusFilter])

  // Group by month for display
  const groupedByMonth = useMemo(() => {
    const groups: Record<string, Meeting[]> = {}
    filteredMeetings.forEach((m) => {
      const date = new Date(m.date)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      if (!groups[label]) groups[label] = []
      groups[label].push(m)
    })
    return groups
  }, [filteredMeetings])

  const completedCount = meetings.filter((m) => m.status === 'completed').length
  const scheduledCount = meetings.filter((m) => m.status === 'scheduled').length

  return (
    <div className="space-y-4">
      {/* Stats + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {meetings.length} total meetings
          </span>
          <Badge variant="default" className="text-xs">{completedCount} completed</Badge>
          <Badge variant="outline" className="text-xs">{scheduledCount} scheduled</Badge>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="postponed">Postponed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty State */}
      {filteredMeetings.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <h3 className="font-medium mb-1">No Meetings Found</h3>
              <p className="text-sm">
                {searchQuery || statusFilter !== 'all'
                  ? 'No meetings match your current filters.'
                  : 'No meetings have been recorded yet.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedByMonth).map(([monthLabel, monthMeetings]) => (
            <div key={monthLabel} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{monthLabel}</h3>
              <div className="space-y-3">
                {monthMeetings.map((meeting) => {
                  const statusConf = meeting.status
                    ? meetingStatusConfig[meeting.status]
                    : null
                  const typeConf = meeting.meeting_type
                    ? meetingTypeConfig[meeting.meeting_type]
                    : null
                  const isExpanded = expandedMeeting === meeting.id
                  const meetingDate = new Date(meeting.date)
                  const isPast = meetingDate < new Date()

                  return (
                    <Card key={meeting.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="pt-4 pb-4">
                        {/* Main Row */}
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedMeeting(isExpanded ? null : meeting.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedMeeting(isExpanded ? null : meeting.id) } }}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            {/* Date Badge */}
                            <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border shrink-0 ${
                              meeting.status === 'cancelled' ? 'bg-red-50 border-red-200' :
                              isPast ? 'bg-muted' : 'bg-blue-50 border-blue-200'
                            }`}>
                              <span className={`text-xs font-medium ${
                                meeting.status === 'cancelled' ? 'text-red-600' :
                                isPast ? 'text-muted-foreground' : 'text-blue-600'
                              }`}>
                                {meetingDate.toLocaleDateString('en-IN', { month: 'short' })}
                              </span>
                              <span className={`text-lg font-bold ${
                                meeting.status === 'cancelled' ? 'text-red-700' :
                                isPast ? 'text-foreground' : 'text-blue-700'
                              }`}>
                                {meetingDate.getDate()}
                              </span>
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-sm">{meeting.title}</h4>
                                {statusConf && (
                                  <Badge variant={statusConf.variant} className="text-xs">
                                    {statusConf.label}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                                {meeting.body_name && (
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {meeting.body_name}
                                  </span>
                                )}
                                {meeting.time && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {meeting.time}
                                  </span>
                                )}
                                {typeConf && (
                                  <span className="flex items-center gap-1">
                                    {typeConf.icon}
                                    {typeConf.label}
                                  </span>
                                )}
                                {meeting.location && (
                                  <span className="flex items-center gap-1 hidden sm:flex">
                                    <MapPin className="h-3 w-3" />
                                    {meeting.location}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            {meeting.minutes_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 hidden sm:flex"
                                asChild
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a href={meeting.minutes_url} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-3.5 w-3.5 mr-1" />
                                  Minutes
                                </a>
                              </Button>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t space-y-3">
                            {meeting.agenda && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Agenda</p>
                                <p className="text-sm">{meeting.agenda}</p>
                              </div>
                            )}

                            {meeting.key_decisions && meeting.key_decisions.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Key Decisions</p>
                                <ul className="space-y-1">
                                  {meeting.key_decisions.map((decision, idx) => (
                                    <li key={idx} className="text-sm flex items-start gap-2">
                                      <span className="text-muted-foreground mt-0.5">-</span>
                                      <span>{decision}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {meeting.attendees_count != null && (
                              <p className="text-xs text-muted-foreground">
                                {meeting.attendees_count} attendee{meeting.attendees_count !== 1 ? 's' : ''}
                              </p>
                            )}

                            {meeting.minutes_url && (
                              <Button variant="outline" size="sm" asChild>
                                <a href={meeting.minutes_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                  View Meeting Minutes
                                </a>
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
