'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DeliverableStatusBadge } from './deliverable-status-badge'
import type { SHContentDeliverableWithDetails } from '@/types/solutions'
import { formatDistanceToNow } from 'date-fns'
import {
  FileText,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  RotateCcw,
  User,
} from 'lucide-react'

interface DeliverableCardProps {
  deliverable: SHContentDeliverableWithDetails
  currentLearnerId?: string
  showClaimButton?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onRequestRevision?: (id: string) => void
  onClaim?: (deliverableId: string, learnerId: string) => void
}

export function DeliverableCard({
  deliverable,
  currentLearnerId,
  showClaimButton = false,
  onApprove,
  onReject,
  onRequestRevision,
  onClaim,
}: DeliverableCardProps) {
  const isAssigned = deliverable.assignments && deliverable.assignments.length > 0
  const assignedLearner = deliverable.assignments?.[0]?.learner

  const canClaim =
    showClaimButton &&
    currentLearnerId &&
    !isAssigned &&
    deliverable.status === 'pending'

  const showActions =
    deliverable.status === 'review' && (onApprove || onReject || onRequestRevision)

  return (
    <Card className="transition-all hover:shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base line-clamp-1">
              {deliverable.title}
            </CardTitle>
          </div>
          <DeliverableStatusBadge
            status={deliverable.status}
            revisionCount={deliverable.revision_count}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Assigned learner */}
        {assignedLearner && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>Assigned to: {assignedLearner.name}</span>
          </div>
        )}

        {/* Notes */}
        {deliverable.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {deliverable.notes}
          </p>
        )}

        {/* File actions */}
        {deliverable.file_url && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={deliverable.file_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Eye className="h-4 w-4 mr-1" />
                Preview
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={deliverable.file_url} download>
                <Download className="h-4 w-4 mr-1" />
                Download
              </a>
            </Button>
          </div>
        )}

        {/* Approval actions */}
        {showActions && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {onApprove && (
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => onApprove(deliverable.id)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
            )}
            {onRequestRevision && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRequestRevision(deliverable.id)}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Request Revision
              </Button>
            )}
            {onReject && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReject(deliverable.id)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            )}
          </div>
        )}

        {/* Claim button */}
        {canClaim && onClaim && (
          <div className="pt-2 border-t">
            <Button
              size="sm"
              className="w-full"
              onClick={() => onClaim(deliverable.id, currentLearnerId)}
            >
              Claim Deliverable
            </Button>
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>
            Created{' '}
            {formatDistanceToNow(new Date(deliverable.created_at), {
              addSuffix: true,
            })}
          </span>
          {deliverable.file_type && (
            <span className="uppercase">{deliverable.file_type}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
