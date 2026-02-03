'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Mail, Phone, Building2, TrendingUp, Award, BookOpen, Users } from 'lucide-react'
import type { SHCohortMemberWithDetails, CohortMemberLevel, TrainingTrack } from '@/types/solutions'

interface CohortMemberCardProps {
  member: SHCohortMemberWithDetails
  showLevelUp?: boolean
  onLevelUp?: () => void
  isLevelingUp?: boolean
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const levelInfo: Record<CohortMemberLevel, { title: string; color: string }> = {
  0: { title: 'Observer', color: 'bg-slate-100 text-slate-800' },
  1: { title: 'Co-Leader', color: 'bg-blue-100 text-blue-800' },
  2: { title: 'Leader', color: 'bg-purple-100 text-purple-800' },
  3: { title: 'Master', color: 'bg-emerald-100 text-emerald-800' },
}

const trackLabels: Record<TrainingTrack, string> = {
  track_a: 'Track A - Community',
  track_b: 'Track B - Corporate',
}

export function CohortMemberCard({
  member,
  showLevelUp = false,
  onLevelUp,
  isLevelingUp = false,
}: CohortMemberCardProps) {
  const levelConfig = levelInfo[member.level]
  const totalSessions =
    member.sessions_observed + member.sessions_co_led + member.sessions_led

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-green-100 text-green-700">
              {getInitials(member.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg truncate">{member.name}</CardTitle>
              <Badge className={levelConfig.color}>
                Level {member.level}: {levelConfig.title}
              </Badge>
            </div>
            {member.track && (
              <CardDescription className="text-xs mt-1">
                {trackLabels[member.track]}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Contact Info */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {member.email && (
            <div className="flex items-center gap-1">
              <Mail className="h-4 w-4" />
              <span className="truncate max-w-[150px]">{member.email}</span>
            </div>
          )}

          {member.phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-4 w-4" />
              <span>{member.phone}</span>
            </div>
          )}

          {member.department && (
            <div className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              <span className="truncate max-w-[120px]">{member.department.name}</span>
            </div>
          )}
        </div>

        {/* Session Stats */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t">
          <div className="text-center">
            <div className="text-lg font-bold">{member.sessions_observed}</div>
            <div className="text-xs text-muted-foreground">Observed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{member.sessions_co_led}</div>
            <div className="text-xs text-muted-foreground">Co-Led</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{member.sessions_led}</div>
            <div className="text-xs text-muted-foreground">Led</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{totalSessions}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>

        {/* Earnings */}
        {member.total_earnings > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span>Total Earnings</span>
            </div>
            <span className="font-semibold text-green-600">
              {formatCurrency(member.total_earnings)}
            </span>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
            {member.status === 'active' ? 'Active' : 'Inactive'}
          </Badge>

          {/* Level Up Button */}
          {showLevelUp && member.level < 3 && member.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              onClick={onLevelUp}
              disabled={isLevelingUp}
              className="gap-1"
            >
              <Award className="h-4 w-4" />
              {isLevelingUp ? 'Promoting...' : 'Level Up'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
