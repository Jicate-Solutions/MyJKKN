/**
 * NPS Response List Component
 * Displays list of NPS responses with filtering
 */

'use client';

import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { StakeholderTypeBadge } from './stakeholder-type-badge';
import type { NPSResponse, NPSSegment } from '@/types/stakeholder-nps';
import { getNPSSegment } from '@/types/stakeholder-nps';

interface ResponseListProps {
  responses: NPSResponse[];
}

// Get sentiment badge
function SentimentBadge({ sentiment }: { sentiment: NPSSegment }) {
  const config = {
    promoter: {
      label: 'Promoter',
      className: 'bg-green-100 text-green-700 hover:bg-green-100',
      icon: ThumbsUp,
    },
    passive: {
      label: 'Passive',
      className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
      icon: Minus,
    },
    detractor: {
      label: 'Detractor',
      className: 'bg-red-100 text-red-700 hover:bg-red-100',
      icon: ThumbsDown,
    },
  };

  const { label, className, icon: Icon } = config[sentiment];

  return (
    <Badge variant="secondary" className={className}>
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

// Get score badge
function ScoreBadge({ score }: { score: number }) {
  const segment = getNPSSegment(score as any);
  const colorClass =
    segment === 'promoter'
      ? 'bg-green-600 hover:bg-green-600'
      : segment === 'passive'
      ? 'bg-yellow-600 hover:bg-yellow-600'
      : 'bg-red-600 hover:bg-red-600';

  return (
    <Badge className={colorClass}>
      {score}/10
    </Badge>
  );
}

export function ResponseList({ responses }: ResponseListProps) {
  if (responses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No responses found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Responses will appear here once stakeholders submit surveys
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Stakeholder</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead>Feedback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses.map((response) => (
              <TableRow key={response.id}>
                <TableCell className="text-sm">
                  {format(new Date(response.created_at), 'MMM d, yyyy')}
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(response.created_at), 'h:mm a')}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <StakeholderTypeBadge type={response.stakeholder_type} />
                    {response.stakeholder_name && (
                      <div className="text-xs text-muted-foreground">
                        {response.stakeholder_name}
                      </div>
                    )}
                    {response.stakeholder_email && (
                      <div className="text-xs text-muted-foreground">
                        {response.stakeholder_email}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <ScoreBadge score={response.score} />
                </TableCell>
                <TableCell>
                  <SentimentBadge sentiment={response.sentiment} />
                </TableCell>
                <TableCell className="max-w-md">
                  {response.feedback ? (
                    <div className="text-sm line-clamp-2">
                      {response.feedback}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      No feedback provided
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
