'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Edit, Trash2, Send, CheckCircle } from 'lucide-react';
import { MaturityStageBadge } from './maturity-stage-badge';
import type { MaturityAssessment, AssessmentStatus } from '@/types/maturity-assessment';

interface AssessmentListProps {
  assessments: MaturityAssessment[];
  onSubmit?: (id: string) => void;
  onApprove?: (id: string) => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

const statusColors: Record<AssessmentStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  archived: 'bg-gray-100 text-gray-500'
};

export function AssessmentList({
  assessments,
  onSubmit,
  onApprove,
  onDelete,
  isLoading
}: AssessmentListProps) {
  if (assessments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No assessments found.</p>
        <Button asChild className="mt-4">
          <Link href="/maturity-assessment/new">Create First Assessment</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assessor</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assessments.map((assessment) => (
            <TableRow key={assessment.id}>
              <TableCell className="font-medium">
                {format(new Date(assessment.assessment_date), 'MMM d, yyyy')}
              </TableCell>
              <TableCell>
                {assessment.department?.department_name || (
                  <span className="text-muted-foreground">Institution-wide</span>
                )}
              </TableCell>
              <TableCell>
                <MaturityStageBadge
                  stage={assessment.overall_stage}
                  showDescription
                  size="sm"
                />
              </TableCell>
              <TableCell>
                <Badge className={statusColors[assessment.status]} variant="outline">
                  {assessment.status.charAt(0).toUpperCase() + assessment.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>
                {assessment.assessor?.full_name || (
                  <span className="text-muted-foreground">Unknown</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/maturity-assessment/${assessment.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </Link>
                    </DropdownMenuItem>

                    {assessment.status === 'draft' && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href={`/maturity-assessment/${assessment.id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        {onSubmit && (
                          <DropdownMenuItem onClick={() => onSubmit(assessment.id)}>
                            <Send className="mr-2 h-4 w-4" />
                            Submit for Review
                          </DropdownMenuItem>
                        )}
                      </>
                    )}

                    {assessment.status === 'submitted' && onApprove && (
                      <DropdownMenuItem onClick={() => onApprove(assessment.id)}>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve
                      </DropdownMenuItem>
                    )}

                    {assessment.status === 'draft' && onDelete && (
                      <DropdownMenuItem
                        onClick={() => onDelete(assessment.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
