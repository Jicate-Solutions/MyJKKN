'use client'

import { Calendar, MapPin, Users, AlertTriangle, Image, ArrowRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SHDiscoveryVisit } from '@/types/solutions'

interface VisitCardProps {
  visit: SHDiscoveryVisit
  departmentName?: string
  solutionCode?: string
  onEdit?: () => void
  onDelete?: () => void
  onLinkToSolution?: () => void
}

export function VisitCard({
  visit,
  departmentName,
  solutionCode,
  onEdit,
  onDelete,
  onLinkToSolution,
}: VisitCardProps) {
  const visitDate = new Date(visit.visit_date)
  const formattedDate = visitDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formattedDate}</span>
              </div>
              {departmentName && (
                <p className="text-sm text-muted-foreground">{departmentName}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {solutionCode && (
              <Badge variant="secondary">{solutionCode}</Badge>
            )}
            {(onEdit || onDelete || onLinkToSolution) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Visit
                    </DropdownMenuItem>
                  )}
                  {onLinkToSolution && !visit.solution_id && (
                    <DropdownMenuItem onClick={onLinkToSolution}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Link to Solution
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onDelete} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Visit
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Visitors */}
        {visit.visitors && visit.visitors.length > 0 && (
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {visit.visitors.map((visitor, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {visitor.name}{visitor.role && ` (${visitor.role})`}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Observations */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Observations</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {visit.observations}
          </p>
        </div>

        {/* Pain Points */}
        {visit.pain_points && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium">Pain Points</p>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {visit.pain_points}
            </p>
          </div>
        )}

        {/* Photos */}
        {visit.photos_urls && visit.photos_urls.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Image className="h-4 w-4" />
            <span>{visit.photos_urls.length} photo{visit.photos_urls.length > 1 ? 's' : ''} attached</span>
          </div>
        )}

        {/* Follow Up */}
        {visit.follow_up_notes && (
          <div className="space-y-1 pt-2 border-t">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Follow Up</p>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {visit.follow_up_notes}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
