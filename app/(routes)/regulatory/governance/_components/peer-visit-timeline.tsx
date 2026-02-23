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
  UserCheck,
  Search,
  Calendar,
  Clock,
  MapPin,
  FileText,
  ExternalLink,
  Star,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  ChevronDown,
  ChevronRight,
  Users,
} from 'lucide-react'

interface PeerVisitRaw {
  id: string
  // Component field names
  title?: string
  framework_name?: string
  body?: string
  visit_type?: string
  status: string
  visit_date?: string
  end_date?: string
  location?: string
  team_lead?: string
  team_members?: string[]
  team_size?: number
  observations?: string[]
  recommendations?: string | string[]
  grade?: string
  score?: number
  report_url?: string
  created_at?: string
  // DB field names
  scheduled_date?: string
  actual_start_date?: string
  actual_end_date?: string
  team_composition?: { name: string; designation?: string; institution?: string; role?: string }[]
  findings?: Record<string, any>
  grade_awarded?: string
  report_file_url?: string
  submission?: { id?: string; framework_id?: string; academic_year?: string }
  notes?: string
}

// Normalize a raw DB row or pre-mapped row into a consistent shape
function normalizePeerVisit(raw: PeerVisitRaw) {
  // Build title if missing
  const visitType = raw.visit_type?.replace(/_/g, ' ') || 'Visit'
  const title = raw.title || `${visitType.charAt(0).toUpperCase() + visitType.slice(1)}`

  // Map team_composition to team_members / team_lead
  const teamComp = Array.isArray(raw.team_composition) ? raw.team_composition : []
  const teamLead = raw.team_lead || teamComp.find((m: any) => m.role === 'lead' || m.role === 'chairperson')?.name || teamComp[0]?.name
  const teamMembers = raw.team_members || teamComp.map((m: any) => m.name)
  const teamSize = raw.team_size || teamComp.length || undefined

  // Map findings to observations
  let observations = raw.observations
  if (!observations && raw.findings && typeof raw.findings === 'object') {
    observations = Object.entries(raw.findings)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => `${k}: ${v}`)
    if (observations.length === 0) observations = undefined
  }

  // Normalize recommendations
  const recommendations = Array.isArray(raw.recommendations)
    ? raw.recommendations
    : raw.recommendations
    ? [raw.recommendations]
    : undefined

  return {
    id: raw.id,
    title,
    framework_name: raw.framework_name,
    body: raw.body,
    visit_type: raw.visit_type as PeerVisit['visit_type'],
    status: raw.status as PeerVisit['status'],
    visit_date: raw.visit_date || raw.scheduled_date,
    end_date: raw.end_date || raw.actual_end_date,
    location: raw.location,
    team_lead: teamLead,
    team_members: teamMembers.length > 0 ? teamMembers : undefined,
    team_size: teamSize,
    observations,
    recommendations,
    grade: raw.grade || raw.grade_awarded,
    score: raw.score,
    report_url: raw.report_url || raw.report_file_url,
    created_at: raw.created_at,
  }
}

interface PeerVisit {
  id: string
  title: string
  framework_name?: string
  body?: string
  visit_type?: 'peer_review' | 'inspection' | 'accreditation' | 'monitoring'
  status: 'scheduled' | 'in_progress' | 'completed' | 'report_pending' | 'cancelled'
  visit_date?: string
  end_date?: string
  location?: string
  team_lead?: string
  team_members?: string[]
  team_size?: number
  observations?: string[]
  recommendations?: string[]
  grade?: string
  score?: number
  report_url?: string
  created_at?: string
}

interface PeerVisitTimelineProps {
  visits: PeerVisitRaw[]
  institutionId?: string
}

const visitStatusConfig: Record<string, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  label: string
  color: string
  icon: React.ReactNode
}> = {
  scheduled: {
    variant: 'outline',
    label: 'Scheduled',
    color: 'border-blue-300 bg-blue-50',
    icon: <Calendar className="h-4 w-4 text-blue-500" />,
  },
  in_progress: {
    variant: 'default',
    label: 'In Progress',
    color: 'border-amber-300 bg-amber-50',
    icon: <Timer className="h-4 w-4 text-amber-500" />,
  },
  completed: {
    variant: 'default',
    label: 'Completed',
    color: 'border-emerald-300 bg-emerald-50',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  },
  report_pending: {
    variant: 'secondary',
    label: 'Report Pending',
    color: 'border-purple-300 bg-purple-50',
    icon: <FileText className="h-4 w-4 text-purple-500" />,
  },
  cancelled: {
    variant: 'destructive',
    label: 'Cancelled',
    color: 'border-red-300 bg-red-50',
    icon: <XCircle className="h-4 w-4 text-red-500" />,
  },
}

const visitTypeLabels: Record<string, string> = {
  peer_review: 'Peer Review',
  inspection: 'Inspection',
  accreditation: 'Accreditation Visit',
  monitoring: 'Monitoring Visit',
}

export function PeerVisitTimeline({ visits, institutionId }: PeerVisitTimelineProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null)

  const filteredVisits = useMemo(() => {
    return visits
      .filter((v) => {
        const matchesSearch = searchQuery === '' ||
          v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.framework_name && v.framework_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (v.team_lead && v.team_lead.toLowerCase().includes(searchQuery.toLowerCase()))

        const matchesStatus = statusFilter === 'all' || v.status === statusFilter

        return matchesSearch && matchesStatus
      })
      .sort((a, b) => {
        const dateA = a.visit_date ? new Date(a.visit_date).getTime() : 0
        const dateB = b.visit_date ? new Date(b.visit_date).getTime() : 0
        return dateB - dateA
      })
  }, [visits, searchQuery, statusFilter])

  const completedVisits = visits.filter((v) => v.status === 'completed').length
  const scheduledVisits = visits.filter((v) => v.status === 'scheduled' || v.status === 'in_progress').length

  return (
    <div className="space-y-4">
      {/* Stats + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserCheck className="h-4 w-4" />
            {visits.length} total visits
          </span>
          <Badge variant="default" className="text-xs">{completedVisits} completed</Badge>
          <Badge variant="outline" className="text-xs">{scheduledVisits} upcoming</Badge>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search visits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search peer visits"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="report_pending">Report Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty State */}
      {filteredVisits.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <h3 className="font-medium mb-1">No Peer Visits Found</h3>
              <p className="text-sm">
                {searchQuery || statusFilter !== 'all'
                  ? 'No visits match your current filters.'
                  : 'No peer review visits have been recorded yet.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-[27px] top-0 bottom-0 w-0.5 bg-border hidden sm:block" />

          {/* Visit Cards */}
          <div className="space-y-4">
            {filteredVisits.map((visit) => {
              const statusConf = visitStatusConfig[visit.status]
              const isExpanded = expandedVisit === visit.id
              const visitDate = visit.visit_date ? new Date(visit.visit_date) : null

              return (
                <div key={visit.id} className="flex gap-4">
                  {/* Timeline Dot */}
                  <div className="hidden sm:flex flex-col items-center">
                    <div className={`w-[54px] shrink-0 p-3 rounded-full border-2 z-10 bg-background ${
                      statusConf?.color || 'border-gray-300 bg-gray-50'
                    }`}>
                      {statusConf?.icon || <Calendar className="h-4 w-4 text-gray-500" />}
                    </div>
                  </div>

                  {/* Visit Card */}
                  <Card className="flex-1 hover:border-primary/30 transition-colors">
                    <CardContent className="pt-4 pb-4">
                      {/* Main Row */}
                      <div
                        className="flex items-start justify-between cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedVisit(isExpanded ? null : visit.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedVisit(isExpanded ? null : visit.id) } }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium">{visit.title}</h4>
                            <Badge variant={statusConf?.variant || 'secondary'} className="text-xs">
                              {statusConf?.label || visit.status}
                            </Badge>
                            {visit.visit_type && (
                              <Badge variant="outline" className="text-xs">
                                {visitTypeLabels[visit.visit_type] || visit.visit_type}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
                            {visitDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {visitDate.toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                                {visit.end_date && (
                                  <> - {new Date(visit.end_date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}</>
                                )}
                              </span>
                            )}
                            {visit.framework_name && (
                              <span className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {visit.framework_name}
                              </span>
                            )}
                            {visit.team_lead && (
                              <span className="flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                Lead: {visit.team_lead}
                              </span>
                            )}
                            {(visit.team_size || visit.team_members?.length) && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {visit.team_size || visit.team_members?.length} members
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 ml-4">
                          {visit.grade && (
                            <Badge
                              variant="default"
                              className={`text-sm font-bold px-3 ${
                                visit.grade === 'A++' || visit.grade === 'A+' ? 'bg-emerald-600' :
                                visit.grade === 'A' ? 'bg-blue-600' :
                                visit.grade === 'B++' || visit.grade === 'B+' ? 'bg-amber-600' :
                                'bg-gray-600'
                              }`}
                            >
                              {visit.grade}
                            </Badge>
                          )}
                          {visit.score != null && !visit.grade && (
                            <Badge variant="outline" className="text-sm font-bold">
                              <Star className="h-3 w-3 mr-1" />
                              {visit.score}
                            </Badge>
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
                        <div className="mt-4 pt-4 border-t space-y-4">
                          {/* Team Members */}
                          {visit.team_members && visit.team_members.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Review Team</p>
                              <div className="flex flex-wrap gap-2">
                                {visit.team_members.map((member, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    <UserCheck className="h-3 w-3 mr-1" />
                                    {member}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Location */}
                          {visit.location && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Location</p>
                              <p className="text-sm flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                {visit.location}
                              </p>
                            </div>
                          )}

                          {/* Observations */}
                          {visit.observations && visit.observations.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Key Observations</p>
                              <ul className="space-y-1.5">
                                {visit.observations.map((obs, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-sm">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                                    <span>{obs}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Recommendations */}
                          {visit.recommendations && visit.recommendations.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Recommendations</p>
                              <ul className="space-y-1.5">
                                {visit.recommendations.map((rec, idx) => (
                                  <li key={idx} className="flex items-start gap-2 text-sm">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Score + Grade Detail */}
                          {(visit.score != null || visit.grade) && (
                            <div className="flex items-center gap-6 bg-muted/50 p-3 rounded-lg">
                              {visit.score != null && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Score</p>
                                  <p className="text-lg font-bold">{visit.score}</p>
                                </div>
                              )}
                              {visit.grade && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Grade</p>
                                  <p className="text-lg font-bold">{visit.grade}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Report Link */}
                          {visit.report_url && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={visit.report_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                View Full Report
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
