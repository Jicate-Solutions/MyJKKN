'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BuilderSkills } from './builder-skills'
import { Mail, Phone, Building2, Star, DollarSign, CheckCircle } from 'lucide-react'
import type { SHBuilderWithDetails } from '@/types/solutions'

interface BuilderCardProps {
  builder: SHBuilderWithDetails
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
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

export function BuilderCard({ builder }: BuilderCardProps) {
  const levelLabel = builder.level === 1 ? 'Junior' : builder.level === 2 ? 'Mid' : 'Senior'
  const levelColor =
    builder.level === 1
      ? 'bg-slate-100 text-slate-700'
      : builder.level === 2
        ? 'bg-blue-100 text-blue-700'
        : 'bg-purple-100 text-purple-700'

  return (
    <Link href={`/solutions/builders/${builder.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={builder.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(builder.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg line-clamp-1">{builder.name}</CardTitle>
              <CardDescription className="text-xs truncate">
                {builder.email}
              </CardDescription>
            </div>
            <Badge className={levelColor}>L{builder.level}: {levelLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Contact Info */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {builder.phone && (
              <div className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                <span>{builder.phone}</span>
              </div>
            )}
            {builder.department && (
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                <span className="truncate max-w-[100px]">{builder.department.name}</span>
              </div>
            )}
          </div>

          {/* Skills */}
          {builder.skills && builder.skills.length > 0 && (
            <BuilderSkills skills={builder.skills} maxDisplay={4} />
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <CheckCircle className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">{builder.phases_completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">{formatCurrency(builder.total_earnings)}</p>
              <p className="text-xs text-muted-foreground">Earnings</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground">
                <Star className="h-3 w-3" />
              </div>
              <p className="text-lg font-semibold">
                {builder.average_rating ? builder.average_rating.toFixed(1) : '-'}
              </p>
              <p className="text-xs text-muted-foreground">Rating</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Badge variant={builder.availability_status === 'available' ? 'default' : 'secondary'}>
              {builder.availability_status === 'available'
                ? 'Available'
                : builder.availability_status === 'busy'
                  ? 'Busy'
                  : 'Unavailable'}
            </Badge>
            {builder.active_assignments_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {builder.active_assignments_count} active assignment(s)
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
