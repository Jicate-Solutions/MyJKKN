'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import {
  MoreHorizontal,
  Eye,
  Edit,
  Play,
  Square,
  Archive,
  Trash2,
  Download,
  ExternalLink
} from 'lucide-react';
import { SurveyStatusBadge } from './survey-status-badge';
import { StakeholderTypeBadge } from './stakeholder-type-badge';
import type { NPSSurvey } from '@/types/stakeholder-nps';
import {
  useActivateSurvey,
  useCloseSurvey,
  useArchiveSurvey,
  useDeleteNPSSurvey
} from '@/hooks/stakeholder-nps';
import { useExportResponses } from '@/hooks/stakeholder-nps/use-nps-responses';

interface SurveyListProps {
  surveys: NPSSurvey[];
}

export function SurveyList({ surveys }: SurveyListProps) {
  const { activateSurvey, loading: activating } = useActivateSurvey();
  const { closeSurvey, loading: closing } = useCloseSurvey();
  const { archiveSurvey, loading: archiving } = useArchiveSurvey();
  const { deleteSurvey, loading: deleting } = useDeleteNPSSurvey();
  const { exportResponses, loading: exporting } = useExportResponses();

  if (surveys.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">No surveys found</p>
          <Button asChild className="mt-4">
            <Link href="/stakeholder-nps/surveys/new">Create your first survey</Link>
          </Button>
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
              <TableHead>Title</TableHead>
              <TableHead>Stakeholder</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-center">Responses</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.map((survey) => (
              <TableRow key={survey.id}>
                <TableCell>
                  <Link
                    href={`/stakeholder-nps/surveys/${survey.id}`}
                    className="font-medium hover:underline"
                  >
                    {survey.title}
                  </Link>
                  {survey.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {survey.description}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <StakeholderTypeBadge type={survey.stakeholder_type} />
                </TableCell>
                <TableCell>
                  <SurveyStatusBadge status={survey.status} />
                </TableCell>
                <TableCell className="text-sm">
                  <div>{format(new Date(survey.start_date), 'MMM d, yyyy')}</div>
                  <div className="text-muted-foreground">
                    to {format(new Date(survey.end_date), 'MMM d, yyyy')}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-medium">{survey.response_count || 0}</span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/stakeholder-nps/surveys/${survey.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Link>
                      </DropdownMenuItem>

                      {survey.status === 'draft' && (
                        <DropdownMenuItem asChild>
                          <Link href={`/stakeholder-nps/surveys/${survey.id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit Survey
                          </Link>
                        </DropdownMenuItem>
                      )}

                      {survey.status === 'active' && (
                        <DropdownMenuItem asChild>
                          <Link href={`/stakeholder-nps/respond?survey=${survey.id}`} target="_blank">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Survey Link
                          </Link>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      {survey.status === 'draft' && (
                        <DropdownMenuItem
                          onClick={() => activateSurvey(survey.id)}
                          disabled={activating}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Activate Survey
                        </DropdownMenuItem>
                      )}

                      {survey.status === 'active' && (
                        <DropdownMenuItem
                          onClick={() => closeSurvey(survey.id)}
                          disabled={closing}
                        >
                          <Square className="mr-2 h-4 w-4" />
                          Close Survey
                        </DropdownMenuItem>
                      )}

                      {survey.status === 'closed' && (
                        <DropdownMenuItem
                          onClick={() => archiveSurvey(survey.id)}
                          disabled={archiving}
                        >
                          <Archive className="mr-2 h-4 w-4" />
                          Archive Survey
                        </DropdownMenuItem>
                      )}

                      {(survey.response_count || 0) > 0 && (
                        <DropdownMenuItem
                          onClick={() => exportResponses(survey.id, survey.title)}
                          disabled={exporting}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export Responses
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this survey? This action cannot be undone.')) {
                            deleteSurvey(survey.id);
                          }
                        }}
                        disabled={deleting}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Survey
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
