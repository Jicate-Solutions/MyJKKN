'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Users,
  Search,
  Plus,
  Calendar,
  UserCircle,
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  Briefcase,
  Building,
} from 'lucide-react'

interface GoverningBody {
  id: string
  name: string
  type?: string
  description?: string
  member_count?: number
  meeting_frequency?: string
  chairperson_name?: string
  chairperson_email?: string
  is_active?: boolean
  created_at?: string
  last_meeting_date?: string
  members?: {
    id: string
    name: string
    role?: string
    designation?: string
    email?: string
    phone?: string
    is_external?: boolean
  }[]
}

interface BodyListProps {
  bodies: GoverningBody[]
  institutionId?: string
}

export function BodyList({ bodies, institutionId }: BodyListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBody, setExpandedBody] = useState<string | null>(null)

  const filteredBodies = useMemo(() => {
    if (!searchQuery) return bodies
    return bodies.filter(
      (b) =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.type && b.type.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.chairperson_name && b.chairperson_name.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [bodies, searchQuery])

  const activeBodies = bodies.filter((b) => b.is_active !== false)
  const totalMembers = bodies.reduce((sum, b) => sum + (b.member_count || b.members?.length || 0), 0)

  return (
    <div className="space-y-4">
      {/* Stats + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Building className="h-4 w-4" />
            {activeBodies.length} active bodies
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {totalMembers} total members
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bodies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredBodies.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <h3 className="font-medium mb-1">No Governing Bodies Found</h3>
              <p className="text-sm">
                {searchQuery
                  ? 'No bodies match your search. Try adjusting your query.'
                  : 'No governing bodies have been configured yet.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBodies.map((body) => {
            const isExpanded = expandedBody === body.id
            const memberCount = body.member_count || body.members?.length || 0

            return (
              <Card key={body.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="pt-5 pb-5">
                  {/* Main Row */}
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedBody(isExpanded ? null : body.id)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2.5 rounded-lg bg-blue-50 shrink-0">
                        <Users className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{body.name}</h3>
                          {body.type && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {body.type}
                            </Badge>
                          )}
                          {body.is_active === false && (
                            <Badge variant="secondary" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <UserCircle className="h-3.5 w-3.5" />
                            {memberCount} member{memberCount !== 1 ? 's' : ''}
                          </span>
                          {body.meeting_frequency && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {body.meeting_frequency}
                            </span>
                          )}
                          {body.chairperson_name && (
                            <span className="flex items-center gap-1 hidden sm:flex">
                              <Briefcase className="h-3.5 w-3.5" />
                              Chair: {body.chairperson_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {body.last_meeting_date && (
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-muted-foreground">Last Meeting</p>
                          <p className="text-sm font-medium">
                            {new Date(body.last_meeting_date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content: Members */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t">
                      {body.description && (
                        <p className="text-sm text-muted-foreground mb-4">{body.description}</p>
                      )}

                      {body.members && body.members.length > 0 ? (
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium">Members</h4>
                          <div className="grid gap-2 md:grid-cols-2">
                            {body.members.map((member) => (
                              <div
                                key={member.id}
                                className="flex items-center gap-3 p-3 border rounded-lg"
                              >
                                <div className="p-2 rounded-full bg-muted shrink-0">
                                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium truncate">{member.name}</p>
                                    {member.is_external && (
                                      <Badge variant="outline" className="text-xs">
                                        External
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                    {member.role && <span>{member.role}</span>}
                                    {member.designation && <span>{member.designation}</span>}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                    {member.email && (
                                      <span className="flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        {member.email}
                                      </span>
                                    )}
                                    {member.phone && (
                                      <span className="flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        {member.phone}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No member details available.
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
