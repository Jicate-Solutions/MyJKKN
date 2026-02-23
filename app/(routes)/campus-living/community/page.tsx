'use client'

import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import { useCommunityFeed } from '@/hooks/campus-living/use-community'
import {
  Calendar,
  Megaphone,
  Vote,
  Settings,
  Loader2,
  ArrowRight,
  MapPin,
  Users,
  Clock,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

const URGENCY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  normal: 'bg-blue-100 text-blue-700 border-blue-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
}

const ADMIN_ROLES = ['admin', 'super_admin', 'institution_admin', 'administrator']

export default function CommunityHubPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: feed, isLoading } = useCommunityFeed(institutionId)

  const isAdmin = profile?.role && ADMIN_ROLES.includes(profile.role)

  if (isLoading) {
    return (
      <ContentLayout title="Community">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const events = feed?.events ?? []
  const announcements = feed?.announcements ?? []
  const polls = feed?.polls ?? []

  return (
    <ContentLayout title="Community">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold py-1">Community Hub</h1>
          <p className="text-sm text-muted-foreground">
            Stay updated with campus events, announcements, and polls from the Learners Council
          </p>
        </div>

        {/* Three-column responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* ── Section 1: Upcoming Events ─────────────────────────── */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base">Upcoming Events</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/learners-council/events">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No upcoming events
                </p>
              ) : (
                events.map((event) => (
                  <Link
                    key={event.id}
                    href={`/learners-council/events/${event.id}`}
                    className="block p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    <h4 className="text-sm font-medium leading-tight mb-1.5">
                      {event.title}
                    </h4>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {event.venue_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {event.venue_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        {format(new Date(event.starts_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Badge variant="secondary" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {event.current_participants}
                        {event.max_participants ? ` / ${event.max_participants}` : ''} joined
                      </Badge>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* ── Section 2: Announcements ───────────────────────────── */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <div className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-base">Announcements</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/learners-council/communication">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No recent announcements
                </p>
              ) : (
                announcements.map((announcement) => (
                  <Link
                    key={announcement.id}
                    href="/learners-council/communication"
                    className="block p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="text-sm font-medium leading-tight">
                        {announcement.title}
                      </h4>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-xs ${URGENCY_COLORS[announcement.urgency ?? 'normal'] || URGENCY_COLORS.normal}`}
                      >
                        {announcement.urgency ?? 'normal'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                      {announcement.content.length > 100
                        ? `${announcement.content.slice(0, 100)}...`
                        : announcement.content}
                    </p>
                    {announcement.published_at && (
                      <span className="text-xs text-muted-foreground/70">
                        {formatDistanceToNow(new Date(announcement.published_at), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* ── Section 3: Active Polls ────────────────────────────── */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-3 space-y-0">
              <div className="flex items-center gap-2">
                <Vote className="h-5 w-5 text-green-600" />
                <CardTitle className="text-base">Active Polls</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/learners-council/communication">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {polls.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No active polls
                </p>
              ) : (
                polls.map((poll) => {
                  const endsAt = new Date(poll.ends_at)
                  const endsIn = formatDistanceToNow(endsAt, { addSuffix: true })

                  return (
                    <Link
                      key={poll.id}
                      href="/learners-council/communication"
                      className="block p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <h4 className="text-sm font-medium leading-tight mb-1.5">
                        {poll.title}
                      </h4>
                      {poll.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {poll.description.length > 100
                            ? `${poll.description.slice(0, 100)}...`
                            : poll.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Ends {endsIn}
                        </span>
                      </div>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Admin Settings Link ─────────────────────────────────── */}
        {isAdmin && (
          <div className="pt-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/community/settings">
                <Settings className="mr-2 h-4 w-4" />
                Community Settings
              </Link>
            </Button>
          </div>
        )}
      </div>
    </ContentLayout>
  )
}
