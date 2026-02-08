'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SolutionStatusBadge } from '../solutions/solution-status-badge'
import { BookOpen, Calendar, MapPin, Users, Building2 } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { SHTrainingProgramWithDetails, TrainingProgramType, TrainingTrack, LocationPreference } from '@/types/solutions'

interface ProgramCardProps {
  program: SHTrainingProgramWithDetails
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const programTypeLabels: Record<TrainingProgramType, string> = {
  workshop: 'Workshop',
  seminar: 'Seminar',
  bootcamp: 'Bootcamp',
  certification: 'Certification',
  transformation: 'AI Transformation',
}

const trackLabels: Record<TrainingTrack, string> = {
  track_a: 'Track A - Community',
  track_b: 'Track B - Corporate',
}

const locationLabels: Record<LocationPreference, string> = {
  client_site: 'Client Site',
  jkkn_campus: 'JKKN Campus',
  online: 'Online',
  hybrid: 'Hybrid',
}

export function ProgramCard({ program }: ProgramCardProps) {
  const trackColor = program.track === 'track_a' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'

  return (
    <Link href={`/solutions/${program.solution_id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-green-600" />
              <Badge variant="outline" className="text-xs">
                {programTypeLabels[program.program_type]}
              </Badge>
            </div>
            {program.solution && (
              <SolutionStatusBadge status={program.solution.status} />
            )}
          </div>
          <CardTitle className="text-lg line-clamp-1 mt-2">
            {program.solution?.title || 'Training Program'}
          </CardTitle>
          <CardDescription className="text-xs font-mono">
            {program.solution?.solution_code}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Track Badge */}
          {program.track && (
            <Badge className={trackColor}>
              {trackLabels[program.track]}
            </Badge>
          )}

          {/* Details Grid */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {program.solution?.client && (
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                <span className="truncate max-w-[120px]">
                  {program.solution.client.name}
                </span>
              </div>
            )}

            {program.participant_count && (
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{program.participant_count} participants</span>
              </div>
            )}

            {program.location_preference && (
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span>{locationLabels[program.location_preference]}</span>
              </div>
            )}

            {program.start_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(program.start_date), 'MMM dd, yyyy')}</span>
              </div>
            )}
          </div>

          {/* Duration */}
          {program.start_date && program.end_date && (
            <div className="text-xs text-muted-foreground">
              {format(new Date(program.start_date), 'MMM dd')} -{' '}
              {format(new Date(program.end_date), 'MMM dd, yyyy')}
            </div>
          )}

          {/* Pricing */}
          {program.solution?.final_price && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium">
                {formatCurrency(program.solution.final_price)}
              </span>
              {program.solution.discount_percentage && program.solution.discount_percentage > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {program.solution.discount_percentage}% Discount
                </Badge>
              )}
            </div>
          )}

          {/* Created Time */}
          <div className="text-xs text-muted-foreground">
            Created{' '}
            {formatDistanceToNow(new Date(program.created_at), { addSuffix: true })}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
