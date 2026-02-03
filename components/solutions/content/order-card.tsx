'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, FileVideo, Palette, FileText, Mic, Package, Hash } from 'lucide-react'
import type { SHContentOrderWithSolution, ContentOrderType, ContentDivision } from '@/types/solutions'
import { formatDistanceToNow, format } from 'date-fns'

interface OrderCardProps {
  order: SHContentOrderWithSolution
  showSolution?: boolean
}

const typeConfig: Record<ContentOrderType, { icon: React.ElementType; label: string; color: string }> = {
  video: { icon: FileVideo, label: 'Video', color: 'text-red-600' },
  social_media: { icon: Hash, label: 'Social Media', color: 'text-pink-600' },
  presentation: { icon: FileText, label: 'Presentation', color: 'text-orange-600' },
  writing: { icon: FileText, label: 'Writing', color: 'text-blue-600' },
  branding: { icon: Palette, label: 'Branding', color: 'text-purple-600' },
  podcast: { icon: Mic, label: 'Podcast', color: 'text-green-600' },
  package: { icon: Package, label: 'Package', color: 'text-gray-600' },
}

const divisionConfig: Record<ContentDivision, { label: string; color: string }> = {
  video: { label: 'Video', color: 'bg-red-100 text-red-800' },
  graphics: { label: 'Graphics', color: 'bg-purple-100 text-purple-800' },
  content: { label: 'Content', color: 'bg-blue-100 text-blue-800' },
  education: { label: 'Education', color: 'bg-green-100 text-green-800' },
  translation: { label: 'Translation', color: 'bg-yellow-100 text-yellow-800' },
  research: { label: 'Research', color: 'bg-gray-100 text-gray-800' },
}

export function OrderCard({ order, showSolution = true }: OrderCardProps) {
  const typeInfo = order.order_type ? typeConfig[order.order_type] : null
  const divisionInfo = order.division ? divisionConfig[order.division] : null
  const Icon = typeInfo?.icon || Package

  return (
    <Link href={`/solutions/content/${order.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${typeInfo?.color || 'text-gray-600'}`} />
              {typeInfo && (
                <Badge variant="outline" className="text-xs">
                  {typeInfo.label}
                </Badge>
              )}
            </div>
            {divisionInfo && (
              <Badge className={`text-xs ${divisionInfo.color}`}>
                {divisionInfo.label}
              </Badge>
            )}
          </div>
          <CardTitle className="text-lg line-clamp-1 mt-2">
            {showSolution && order.solution?.title
              ? order.solution.title
              : `Order #${order.id.slice(0, 8)}`}
          </CardTitle>
          {showSolution && order.solution?.client && (
            <CardDescription>
              {order.solution.client.name}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Package className="h-4 w-4" />
              <span>Qty: {order.quantity}</span>
            </div>

            {order.due_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>Due: {format(new Date(order.due_date), 'MMM d, yyyy')}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Created {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
            </span>
            <span>{order.revision_rounds} revision rounds</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
