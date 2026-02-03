'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Calendar,
  BookOpen,
  ExternalLink,
  Users,
} from 'lucide-react'
import type { SHPublicationWithSolution, PaperType, JournalType, PublicationStatus } from '@/types/solutions'
import { formatDistanceToNow } from 'date-fns'

interface PublicationCardProps {
  publication: SHPublicationWithSolution
}

const paperTypeConfig: Record<PaperType, { label: string; color: string }> = {
  problem: { label: 'Problem Paper', color: 'bg-red-100 text-red-700' },
  design: { label: 'Design Paper', color: 'bg-blue-100 text-blue-700' },
  technical: { label: 'Technical Paper', color: 'bg-purple-100 text-purple-700' },
  data: { label: 'Data Paper', color: 'bg-green-100 text-green-700' },
  impact: { label: 'Impact Paper', color: 'bg-yellow-100 text-yellow-700' },
}

const journalTypeConfig: Record<JournalType, { label: string; color: string }> = {
  scopus: { label: 'Scopus', color: 'bg-orange-100 text-orange-700' },
  ugc_care: { label: 'UGC-CARE', color: 'bg-indigo-100 text-indigo-700' },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-700' },
}

const statusConfig: Record<PublicationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  identified: { label: 'Identified', variant: 'outline' },
  drafting: { label: 'Drafting', variant: 'secondary' },
  submitted: { label: 'Submitted', variant: 'secondary' },
  under_review: { label: 'Under Review', variant: 'secondary' },
  revision: { label: 'Revision', variant: 'secondary' },
  accepted: { label: 'Accepted', variant: 'default' },
  published: { label: 'Published', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

export function PublicationCard({ publication }: PublicationCardProps) {
  const paperConfig = publication.paper_type ? paperTypeConfig[publication.paper_type] : null
  const journalConfig = publication.journal_type ? journalTypeConfig[publication.journal_type] : null
  const statusCfg = statusConfig[publication.status]

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:border-muted-foreground/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {paperConfig && (
              <Badge className={paperConfig.color} variant="secondary">
                {paperConfig.label}
              </Badge>
            )}
            {journalConfig && (
              <Badge className={journalConfig.color} variant="secondary">
                {journalConfig.label}
              </Badge>
            )}
          </div>
          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
        </div>
        <CardTitle className="text-lg line-clamp-2 mt-2">{publication.title}</CardTitle>
        {publication.journal_name && (
          <CardDescription className="flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {publication.journal_name}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {publication.abstract && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {publication.abstract}
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {publication.authors && publication.authors.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span className="truncate max-w-[200px]">
                {publication.authors.map((a) => a.name).join(', ')}
              </span>
            </div>
          )}

          {publication.solution && (
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span className="truncate max-w-[120px]">
                {publication.solution.solution_code}
              </span>
            </div>
          )}

          {publication.created_at && (
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>
                {formatDistanceToNow(new Date(publication.created_at), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {publication.nirf_category && (
            <Badge variant="outline" className="text-xs">
              NIRF: {publication.nirf_category}
            </Badge>
          )}
          {publication.naac_criterion && (
            <Badge variant="outline" className="text-xs">
              NAAC: {publication.naac_criterion}
            </Badge>
          )}
          {publication.doi && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              DOI <ExternalLink className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
