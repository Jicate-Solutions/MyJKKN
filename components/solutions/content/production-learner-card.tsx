'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { SHProductionLearnerWithAssignments, ContentDivision, SkillLevel } from '@/types/solutions'
import { DollarSign, CheckCircle, Star, Mail, Phone } from 'lucide-react'

interface ProductionLearnerCardProps {
  learner: SHProductionLearnerWithAssignments
}

const divisionConfig: Record<ContentDivision, { label: string; color: string }> = {
  video: { label: 'Video', color: 'bg-red-100 text-red-800' },
  graphics: { label: 'Graphics', color: 'bg-purple-100 text-purple-800' },
  content: { label: 'Content', color: 'bg-blue-100 text-blue-800' },
  education: { label: 'Education', color: 'bg-green-100 text-green-800' },
  translation: { label: 'Translation', color: 'bg-yellow-100 text-yellow-800' },
  research: { label: 'Research', color: 'bg-gray-100 text-gray-800' },
}

const skillLevelConfig: Record<SkillLevel, { label: string; color: string }> = {
  beginner: { label: 'Beginner', color: 'bg-gray-100 text-gray-800' },
  intermediate: { label: 'Intermediate', color: 'bg-blue-100 text-blue-800' },
  advanced: { label: 'Advanced', color: 'bg-purple-100 text-purple-800' },
  expert: { label: 'Expert', color: 'bg-green-100 text-green-800' },
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function ProductionLearnerCard({ learner }: ProductionLearnerCardProps) {
  const divisionInfo = learner.division ? divisionConfig[learner.division] : null
  const skillInfo = skillLevelConfig[learner.skill_level]
  const activeAssignments =
    learner.assignments?.filter((a) => !a.completed_at)?.length || 0

  return (
    <Link href={`/solutions/content/production/${learner.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(learner.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base line-clamp-1">
                {learner.name}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {divisionInfo && (
                  <Badge className={`text-xs ${divisionInfo.color}`}>
                    {divisionInfo.label}
                  </Badge>
                )}
                <Badge className={`text-xs ${skillInfo.color}`}>
                  {skillInfo.label}
                </Badge>
              </div>
            </div>
            <Badge
              variant={learner.is_active === true ? 'default' : 'secondary'}
              className={
                learner.is_active === true
                  ? 'bg-green-100 text-green-800'
                  : ''
              }
            >
              {learner.is_active ? 'active' : 'inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Contact info */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {learner.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <span className="truncate max-w-[150px]">{learner.email}</span>
              </div>
            )}
            {learner.phone && (
              <div className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                <span>{learner.phone}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <CheckCircle className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">{learner.orders_completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">
                {formatCurrency(learner.total_earnings)}
              </p>
              <p className="text-xs text-muted-foreground">Earnings</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Star className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">
                {learner.average_rating?.toFixed(1) || '-'}
              </p>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
          </div>

          {/* Active assignments */}
          {activeAssignments > 0 && (
            <div className="pt-2 border-t">
              <Badge variant="outline" className="text-xs">
                {activeAssignments} active assignment
                {activeAssignments > 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
