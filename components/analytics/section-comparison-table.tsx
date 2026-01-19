'use client';

import { useState, useMemo } from 'react';
import type { SectionComparison } from '@/types/analytics';
import { useSectionComparison } from '@/hooks/analytics/use-section-comparison';
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Award,
  AlertTriangle
} from 'lucide-react';

interface SectionComparisonTableProps {
  semesterId: string;
  onSectionClick?: (sectionId: string) => void;
}

type SortField =
  | 'section_name'
  | 'total_students'
  | 'active_last_7d'
  | 'at_risk_count'
  | 'avg_logins_7d'
  | 'avg_session_duration'
  | 'engagement_score';

type SortDirection = 'asc' | 'desc';

export function SectionComparisonTable({
  semesterId,
  onSectionClick
}: SectionComparisonTableProps) {
  const { data: sections, isLoading, error } = useSectionComparison({
    semesterId,
    enabled: !!semesterId
  });

  const [sortField, setSortField] = useState<SortField>('engagement_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Sort sections
  const sortedSections = useMemo(() => {
    if (!sections) return [];

    return [...sections].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      // Handle null/undefined
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // String comparison
      if (typeof aValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      // Number comparison
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });
  }, [sections, sortField, sortDirection]);

  // Calculate best and worst sections for highlighting
  const bestSection = useMemo(() => {
    if (!sortedSections || sortedSections.length === 0) return null;
    return sortedSections.reduce((best, current) =>
      current.engagement_score > best.engagement_score ? current : best
    );
  }, [sortedSections]);

  const worstSection = useMemo(() => {
    if (!sortedSections || sortedSections.length === 0) return null;
    return sortedSections.reduce((worst, current) =>
      current.engagement_score < worst.engagement_score ? current : worst
    );
  }, [sortedSections]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  const getEngagementScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-700 bg-green-100';
    if (score >= 60) return 'text-blue-700 bg-blue-100';
    if (score >= 40) return 'text-yellow-700 bg-yellow-100';
    return 'text-red-700 bg-red-100';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-4 text-gray-600">Loading section comparison...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900">Failed to load section comparison</p>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!sortedSections || sortedSections.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">No sections found</p>
          <p className="text-gray-600 mt-2">No data available for comparison in this semester</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Section Comparison</h3>
            <p className="text-sm text-gray-600 mt-1">
              Comparing {sortedSections.length} section{sortedSections.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th
                onClick={() => handleSort('section_name')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Section
                  <SortIcon field="section_name" />
                </div>
              </th>
              <th
                onClick={() => handleSort('total_students')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Total Students
                  <SortIcon field="total_students" />
                </div>
              </th>
              <th
                onClick={() => handleSort('active_last_7d')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Active (7d)
                  <SortIcon field="active_last_7d" />
                </div>
              </th>
              <th
                onClick={() => handleSort('at_risk_count')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  At-Risk
                  <SortIcon field="at_risk_count" />
                </div>
              </th>
              <th
                onClick={() => handleSort('avg_logins_7d')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Avg Logins (7d)
                  <SortIcon field="avg_logins_7d" />
                </div>
              </th>
              <th
                onClick={() => handleSort('avg_session_duration')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Avg Duration
                  <SortIcon field="avg_session_duration" />
                </div>
              </th>
              <th
                onClick={() => handleSort('engagement_score')}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
              >
                <div className="flex items-center gap-1">
                  Engagement Score
                  <SortIcon field="engagement_score" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedSections.map((section) => {
              const isBest = bestSection?.section_id === section.section_id;
              const isWorst =
                worstSection?.section_id === section.section_id &&
                sortedSections.length > 1;
              const activePercentage =
                section.total_students > 0
                  ? Math.round((section.active_last_7d / section.total_students) * 100)
                  : 0;
              const atRiskPercentage =
                section.total_students > 0
                  ? Math.round((section.at_risk_count / section.total_students) * 100)
                  : 0;

              return (
                <tr
                  key={section.section_id}
                  onClick={() => onSectionClick?.(section.section_id)}
                  className={`hover:bg-gray-50 transition-colors ${
                    onSectionClick ? 'cursor-pointer' : ''
                  } ${isBest ? 'bg-green-50' : ''} ${isWorst ? 'bg-red-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {section.section_name}
                      </div>
                      {isBest && (
                        <Award className="h-4 w-4 text-green-600" />
                      )}
                      {isWorst && (
                        <TrendingDown
                          className="h-4 w-4 text-red-600"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {section.total_students}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {section.active_last_7d}
                      </span>
                      <span className="text-xs text-gray-500">({activePercentage}%)</span>
                      {activePercentage >= 80 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : activePercentage < 50 ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          section.at_risk_count > 0 ? 'text-red-700' : 'text-gray-900'
                        }`}
                      >
                        {section.at_risk_count}
                      </span>
                      <span className="text-xs text-gray-500">({atRiskPercentage}%)</span>
                      {section.at_risk_count > 0 && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {section.avg_logins_7d.toFixed(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {Math.round(section.avg_session_duration)} min
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${getEngagementScoreColor(
                          section.engagement_score
                        )}`}
                      >
                        {section.engagement_score}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Total Students</p>
            <p className="text-lg font-bold text-gray-900">
              {sortedSections.reduce((sum, s) => sum + s.total_students, 0)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Active Last 7 Days</p>
            <p className="text-lg font-bold text-green-700">
              {sortedSections.reduce((sum, s) => sum + s.active_last_7d, 0)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">At-Risk Students</p>
            <p className="text-lg font-bold text-red-700">
              {sortedSections.reduce((sum, s) => sum + s.at_risk_count, 0)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Avg Engagement Score</p>
            <p className="text-lg font-bold text-blue-700">
              {(
                sortedSections.reduce((sum, s) => sum + s.engagement_score, 0) /
                sortedSections.length
              ).toFixed(0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
