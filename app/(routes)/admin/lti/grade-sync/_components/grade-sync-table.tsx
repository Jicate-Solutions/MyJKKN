/**
 * Grade Sync Table Component
 * Display grade sync records with search, sort, and retry functionality
 *
 * Created: 2026-01-12
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Search,
  AlertCircle
} from 'lucide-react';

// Type matching the data structure from Supabase query
type GradeRecord = {
  id: string;
  resource_link_title: string;
  score: number;
  score_maximum: number;
  score_percentage: number;
  graded_at: string;
  received_at: string;
  synced_to_gradebook: boolean;
  sync_error: string | null;
  synced_at: string | null;
  user_id: string;
  lti_tools: {
    id: string;
    name: string;
    tool_type: string;
  };
  learners_profiles: {
    first_name: string;
    last_name: string;
    roll_number: string;
  };
};

interface GradeSyncTableProps {
  grades: GradeRecord[];
}

export function GradeSyncTable({ grades }: GradeSyncTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // Filter grades based on search query
  const filteredGrades = grades.filter((grade) => {
    const searchLower = searchQuery.toLowerCase();
    const studentName =
      `${grade.learners_profiles.first_name} ${grade.learners_profiles.last_name}`.toLowerCase();
    const rollNumber = grade.learners_profiles.roll_number.toLowerCase();
    const assignmentName = grade.resource_link_title.toLowerCase();

    return (
      studentName.includes(searchLower) ||
      rollNumber.includes(searchLower) ||
      assignmentName.includes(searchLower)
    );
  });

  const handleRetry = async (gradeId: string) => {
    setRetryingIds((prev) => new Set(prev).add(gradeId));

    try {
      const response = await fetch(`/api/lti/grades/${gradeId}/retry`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Retry failed');
      }

      // Refresh the page to show updated status
      window.location.reload();
    } catch (error) {
      console.error('[Grade Sync] Retry failed:', error);
      alert('Failed to retry grade sync. Please try again.');
    } finally {
      setRetryingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(gradeId);
        return newSet;
      });
    }
  };

  const getSyncStatusBadge = (grade: GradeRecord) => {
    if (grade.synced_to_gradebook) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Synced
        </Badge>
      );
    }

    if (grade.sync_error) {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
        <Clock className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  };

  if (grades.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">
          No grade sync records found for the selected date range
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by student name, roll number, or assignment..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Roll Number</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Graded At</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredGrades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No results found for "{searchQuery}"
                </TableCell>
              </TableRow>
            ) : (
              filteredGrades.map((grade) => (
                <TableRow key={grade.id}>
                  {/* Student Name */}
                  <TableCell className="font-medium">
                    {grade.learners_profiles.first_name}{' '}
                    {grade.learners_profiles.last_name}
                  </TableCell>

                  {/* Roll Number */}
                  <TableCell>{grade.learners_profiles.roll_number}</TableCell>

                  {/* Assignment */}
                  <TableCell>
                    <div className="max-w-xs truncate" title={grade.resource_link_title}>
                      {grade.resource_link_title}
                    </div>
                  </TableCell>

                  {/* Score */}
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">
                        {grade.score}/{grade.score_maximum}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {grade.score_percentage.toFixed(1)}%
                      </div>
                    </div>
                  </TableCell>

                  {/* Tool */}
                  <TableCell>
                    <div className="text-sm">{grade.lti_tools.name}</div>
                  </TableCell>

                  {/* Graded At */}
                  <TableCell>
                    <div className="text-sm">
                      {format(new Date(grade.graded_at), 'MMM dd, yyyy')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(grade.graded_at), 'HH:mm')}
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <div className="space-y-2">
                      {getSyncStatusBadge(grade)}

                      {/* Error Message */}
                      {grade.sync_error && (
                        <div className="text-xs text-red-600 max-w-xs">
                          {grade.sync_error}
                        </div>
                      )}

                      {/* Synced At */}
                      {grade.synced_at && (
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(grade.synced_at), 'MMM dd, HH:mm')}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    {grade.sync_error && !grade.synced_to_gradebook && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(grade.id)}
                        disabled={retryingIds.has(grade.id)}
                      >
                        <RefreshCw
                          className={`h-3 w-3 mr-1 ${
                            retryingIds.has(grade.id) ? 'animate-spin' : ''
                          }`}
                        />
                        Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results Summary */}
      {searchQuery && (
        <p className="text-sm text-muted-foreground">
          Showing {filteredGrades.length} of {grades.length} records
        </p>
      )}
    </div>
  );
}
