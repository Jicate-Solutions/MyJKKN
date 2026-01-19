'use client';

import { useState, useMemo } from 'react';
import type { StudentEngagement, EngagementLevel } from '@/types/analytics';
import { ENGAGEMENT_LEVEL_CONFIG } from '@/types/analytics';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  User,
  Calendar,
  Clock,
  Activity,
  Award
} from 'lucide-react';

interface StudentEngagementTableProps {
  students: StudentEngagement[];
  onStudentClick?: (studentId: string) => void;
  isLoading?: boolean;
}

export function StudentEngagementTable({
  students,
  onStudentClick,
  isLoading = false
}: StudentEngagementTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filterLevel, setFilterLevel] = useState<EngagementLevel | 'all'>('all');

  // Filter students by engagement level
  const filteredStudents = useMemo(() => {
    if (filterLevel === 'all') return students;
    return students.filter((s) => s.engagement_level === filterLevel);
  }, [students, filterLevel]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // Define columns for DataTable
  const columns: PermissionColumnDef<StudentEngagement, any>[] = [
    {
      id: 'student',
      header: 'Student',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-700 font-medium text-sm">
                {row.original.name.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900">
              {row.original.name}
            </div>
            <div className="text-sm text-gray-500">{row.original.student_id}</div>
          </div>
        </div>
      ),
      accessorKey: 'name'
    },
    {
      id: 'section',
      header: 'Section',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm text-gray-900">{row.original.section_name}</div>
      )
    },
    {
      id: 'last_login',
      header: 'Last Login',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-900">
            {formatDate(row.original.last_login_at)}
          </span>
        </div>
      ),
      accessorKey: 'last_login_at'
    },
    {
      id: 'logins_7d',
      header: 'Logins (7d)',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {row.original.logins_last_7_days || 0}
          </span>
          {(row.original.logins_last_7_days || 0) > (row.original.section_avg_logins_7d || 0) ? (
            <TrendingUp className="h-4 w-4 text-green-500" title="Above section average" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" title="Below section average" />
          )}
        </div>
      ),
      accessorKey: 'logins_last_7_days'
    },
    {
      id: 'avg_duration',
      header: 'Avg Duration',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-900">
            {row.original.avg_session_duration_minutes
              ? `${Math.round(row.original.avg_session_duration_minutes)} min`
              : 'N/A'}
          </span>
        </div>
      ),
      accessorKey: 'avg_session_duration_minutes'
    },
    {
      id: 'modules',
      header: 'Modules',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-900">
            {row.original.modules_accessed_count || 0}
          </span>
        </div>
      ),
      accessorKey: 'modules_accessed_count'
    },
    {
      id: 'percentile',
      header: 'Percentile',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-full bg-gray-200 rounded-full h-2 max-w-[60px]">
            <div
              className={`h-2 rounded-full transition-all ${
                (row.original.percentile_rank || 0) >= 75
                  ? 'bg-green-500'
                  : (row.original.percentile_rank || 0) >= 40
                  ? 'bg-blue-500'
                  : (row.original.percentile_rank || 0) >= 20
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${row.original.percentile_rank || 0}%` }}
            ></div>
          </div>
          <span className="text-sm font-medium text-gray-900">
            {row.original.percentile_rank || 0}%
          </span>
        </div>
      ),
      accessorKey: 'percentile_rank'
    },
    {
      id: 'engagement_level',
      header: 'Engagement',
      enableSorting: true,
      cell: ({ row }) => {
        const engagementConfig = ENGAGEMENT_LEVEL_CONFIG[row.original.engagement_level];
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${engagementConfig.bgColor} ${engagementConfig.color}`}
            >
              {engagementConfig.label}
            </Badge>
            {row.original.is_at_risk && (
              <AlertTriangle className="h-4 w-4 text-red-500" title="At Risk" />
            )}
          </div>
        );
      },
      accessorKey: 'engagement_level'
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onStudentClick?.(row.original.user_id)}
          className="text-blue-600 hover:text-blue-900 hover:bg-blue-50"
        >
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
      )
    }
  ];

  // Handle page changes
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  // Server-side pagination configuration
  const serverSidePagination = {
    currentPage,
    totalPages,
    pageSize,
    totalItems: filteredStudents.length,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
    isLoading
  };

  // Filter Controls
  const tableTools = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-gray-700">Filter:</span>
      <Button
        variant={filterLevel === 'all' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setFilterLevel('all')}
        className="transition-all"
      >
        All ({students.length})
      </Button>
      {(['high', 'medium', 'low', 'at_risk'] as EngagementLevel[]).map((level) => {
        const count = students.filter((s) => s.engagement_level === level).length;
        const config = ENGAGEMENT_LEVEL_CONFIG[level];
        return (
          <Button
            key={level}
            variant="outline"
            size="sm"
            onClick={() => setFilterLevel(level)}
            className={`transition-all ${
              filterLevel === level
                ? `${config.bgColor} ${config.color} border-transparent`
                : ''
            }`}
          >
            {config.label} ({count})
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={paginatedStudents}
        searchPlaceholder="Search students by name or ID..."
        filterColumn="name"
        permissions={{
          module: 'analytics',
          actions: {
            view: true,
            create: false,
            edit: false,
            delete: false
          },
          showPermissionError: false
        }}
        tableTools={tableTools}
        serverSidePagination={serverSidePagination}
        showRefresh={false}
      />
    </div>
  );
}
