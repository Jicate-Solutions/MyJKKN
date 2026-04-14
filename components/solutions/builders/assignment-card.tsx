'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PhaseStatusBadge } from '../phases/phase-status-badge'
import {
  AlertCircle,
  Check,
  X,
  DollarSign,
  Building2,
  Calendar,
} from 'lucide-react'
import { format } from 'date-fns'
import type { SHBuilderAssignmentWithPhase } from '@/types/solutions'

interface AssignmentRequestProps {
  assignment: SHBuilderAssignmentWithPhase & {
    builder?: { id: string; name: string; email: string | null }
  }
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  isProcessing?: boolean
}

function formatCurrency(amount: number | null | undefined): string {
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

export function AssignmentRequest({ assignment, onApprove, onReject, isProcessing }: AssignmentRequestProps) {
  const phase = assignment.phase
  const builder = assignment.builder
  const estimatedValue = phase?.estimated_value || 0
  const requiresMdApproval = estimatedValue > 300000 // > 3 Lakh

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {builder && (
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(builder.name)}
                </AvatarFallback>
              </Avatar>
            )}
            <div>
              <CardTitle className="text-base">{builder?.name || 'Unknown Builder'}</CardTitle>
              <CardDescription className="text-xs">
                Requesting assignment to Phase {phase?.phase_number}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-0">
            {assignment.role === 'lead' ? 'Lead' : 'Contributor'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Phase info */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{phase?.title}</span>
            {phase?.status && <PhaseStatusBadge status={phase.status} />}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {phase?.solution && (
              <div className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                <span>{phase.solution.solution_code}</span>
              </div>
            )}

            {phase?.estimated_value && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>{formatCurrency(phase.estimated_value)}</span>
              </div>
            )}

            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Requested {format(new Date(assignment.requested_at), 'dd MMM yyyy')}</span>
            </div>
          </div>
        </div>

        {/* Approval requirement notice */}
        {requiresMdApproval && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">MD Approval Required</p>
              <p className="text-amber-700">
                Phase value exceeds Rs.3 Lakh threshold. Only MD can approve this assignment.
              </p>
            </div>
          </div>
        )}
      </CardContent>

      {(onApprove || onReject) && (
        <CardFooter className="flex gap-2 pt-2">
          {onReject && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onReject(assignment.id)}
              disabled={isProcessing}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
          )}
          {onApprove && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onApprove(assignment.id)}
              disabled={isProcessing}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

// Compact version for lists
interface AssignmentRequestRowProps {
  assignment: SHBuilderAssignmentWithPhase & {
    builder?: { id: string; name: string; email: string | null }
  }
  onApprove: (id: string) => void
  onReject: (id: string) => void
  isProcessing?: boolean
}

export function AssignmentRequestRow({
  assignment,
  onApprove,
  onReject,
  isProcessing,
}: AssignmentRequestRowProps) {
  const phase = assignment.phase
  const builder = assignment.builder
  const estimatedValue = phase?.estimated_value || 0
  const requiresMdApproval = estimatedValue > 300000

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        {builder && (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {getInitials(builder.name)}
            </AvatarFallback>
          </Avatar>
        )}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{builder?.name}</span>
            <Badge variant="outline" className="text-xs">
              {assignment.role}
            </Badge>
            {requiresMdApproval && (
              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-0">
                MD Required
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Phase {phase?.phase_number}: {phase?.title} ({phase?.solution?.solution_code})
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {formatCurrency(estimatedValue)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onReject(assignment.id)}
          disabled={isProcessing}
        >
          <X className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-green-600 hover:text-green-600"
          onClick={() => onApprove(assignment.id)}
          disabled={isProcessing}
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
