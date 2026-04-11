'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  AlertCircle,
  Users,
  MapPin,
  Clock,
  Laptop,
  User,
  Presentation,
  Send,
  UserCheck,
  TrendingUp,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useMyTeam } from '@/hooks/startup-studio';
import { calculateScore, getTierColor } from '@/lib/utils/tier-calculator';

interface MyTeamViewProps {
  eventId: string;
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'confirmed':
    case 'checked_in':
      return 'default';
    case 'registered':
      return 'secondary';
    default:
      return 'outline';
  }
}

function formatSlotTime(isoTime: string): string {
  const date = new Date(isoTime);
  return date.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function VenueCard({
  title,
  venue,
}: {
  title: string;
  venue: any;
}) {
  if (!venue) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not yet assigned</p>
        </CardContent>
      </Card>
    );
  }

  const resource = venue.resource;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-medium">{venue.venue_name}</p>
        {resource && (
          <div className="text-sm text-muted-foreground space-y-1">
            {resource.building_number && (
              <p>Building: {resource.building_number}</p>
            )}
            {resource.room_number && <p>Room: {resource.room_number}</p>}
          </div>
        )}
        {venue.location_info && (
          <p className="text-sm text-muted-foreground">{venue.location_info}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function MyTeamView({ eventId }: MyTeamViewProps) {
  const { data, isLoading, error } = useMyTeam(eventId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load your team details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href={`/startup-studio/events/${eventId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Event
          </Link>
        </Button>
      </div>
    );
  }

  const team = data?.team;

  // No team found
  if (!team) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/startup-studio/events/${eventId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">My Team</h1>
        </div>

        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">
                You haven&apos;t registered for this event yet
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Register your team to participate in the event.
              </p>
            </div>
            <Button asChild>
              <Link href={`/startup-studio/events/${eventId}/register`}>
                Register Your Team
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/startup-studio/events/${eventId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <p className="text-sm text-muted-foreground">
              {team.institution?.name || 'Team Details'}
            </p>
          </div>
        </div>
        <Badge variant={statusBadgeVariant(team.registration_status)}>
          {team.registration_status?.replace('_', ' ') || 'Registered'}
        </Badge>
      </div>

      {/* Problem Idea */}
      {team.problem_idea && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Problem Idea</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{team.problem_idea}</p>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Team Members ({team.members?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {(team.members || []).map((member: any) => (
              <div key={member.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {member.user?.full_name || 'Member'}
                      {member.is_anchor && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Lead
                        </Badge>
                      )}
                    </p>
                    {member.department && (
                      <p className="text-xs text-muted-foreground">{member.department}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.has_laptop && (
                    <Badge variant="secondary" className="text-xs">
                      <Laptop className="mr-1 h-3 w-3" />
                      Laptop
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Venue Info - Build Day & Demo Day side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <VenueCard title="Build Day Venue" venue={team.build_venue} />
        <VenueCard title="Demo Day Venue" venue={team.demo_venue} />
      </div>

      {/* Presentation Slot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Presentation className="h-4 w-4" />
            Presentation Slot
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.presentation_slot ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {formatSlotTime(team.presentation_slot.slot_time)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Duration: {team.presentation_slot.duration_mins} minutes
              </p>
              {team.presentation_slot.room && (
                <p className="text-sm text-muted-foreground">
                  Room: {team.presentation_slot.room}
                </p>
              )}
              <Badge variant={team.presentation_slot.status === 'completed' ? 'default' : 'secondary'}>
                {team.presentation_slot.status}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not yet scheduled</p>
          )}
        </CardContent>
      </Card>

      {/* Mentor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" />
            Mentor
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.mentor ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{team.mentor.full_name}</p>
                <p className="text-sm text-muted-foreground">{team.mentor.email}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No mentor assigned yet</p>
          )}
        </CardContent>
      </Card>

      {/* Submission Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" />
            Submission
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.submission ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">{team.submission.app_name}</p>
                <Badge variant={team.submission.status === 'submitted' ? 'default' : 'secondary'}>
                  {team.submission.status}
                </Badge>
              </div>
              {team.submission.live_url && (
                <a
                  href={team.submission.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Live App
                </a>
              )}
              {team.submission.submitted_at && (
                <p className="text-xs text-muted-foreground">
                  Submitted: {new Date(team.submission.submitted_at).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">No submission yet</p>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/startup-studio/events/${eventId}/submit`}>
                  Submit Project
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tier & Metrics */}
      {team.submission && (() => {
        const scoring = calculateScore(team.submission);
        return (
          <Card className={team.submission.metrics_updated_at ? 'border-green-200' : 'border-amber-200'}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Your Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {team.submission.metrics_updated_at ? (
                <>
                  {/* Tier + Score Summary */}
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${getTierColor(scoring.tier.level)}`}>
                      Level {scoring.tier.level}: {scoring.tier.label}
                    </span>
                    <span className="text-2xl font-bold text-green-700">{scoring.totalScore} pts</span>
                    {scoring.mrrBonus > 0 && (
                      <span className="text-sm text-green-600">(+{scoring.mrrBonus} MRR bonus)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">MRR</p>
                      <p className="text-lg font-bold text-green-700">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          maximumFractionDigits: 0,
                        }).format(team.submission.mrr_amount ?? 0)}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Paying Users</p>
                      <p className="text-lg font-bold text-blue-700">
                        {team.submission.paying_users_count ?? 0}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-indigo-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Total Users</p>
                      <p className="text-lg font-bold text-indigo-700">
                        {team.submission.total_users ?? 0}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-muted-foreground">Active Users</p>
                      <p className="text-lg font-bold text-purple-700">
                        {team.submission.active_users ?? 0}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Metrics pending -- update before Monday morning!
                  </span>
                </div>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/startup-studio/events/${eventId}/submit`}>
                  {team.submission.metrics_updated_at ? 'Update Metrics' : 'Enter Metrics'}
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
