'use client';

import { useState } from 'react';
import type { AtRiskStudent, RiskFactor } from '@/types/analytics';
import { RISK_FACTOR_CONFIG } from '@/types/analytics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Download,
  Mail,
  Phone,
  AlertTriangle,
  Calendar,
  TrendingDown,
  X,
  Link
} from 'lucide-react';

interface AtRiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: AtRiskStudent[];
  isLoading?: boolean;
}

export function AtRiskModal({
  isOpen,
  onClose,
  students,
  isLoading = false
}: AtRiskModalProps) {
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  const handleSelectAll = () => {
    if (selectedStudents.size === students.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map((s) => s.user_id)));
    }
  };

  const handleSelectStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const exportToCSV = () => {
    // Prepare CSV headers
    const headers = [
      'Student Name',
      'Student ID',
      'Email',
      'Phone',
      'Section',
      'Last Login',
      'Days Inactive',
      'Percentile',
      'Logins (7d)',
      'Risk Factors'
    ];

    // Prepare CSV rows
    const rows = students.map((student) => [
      student.name,
      student.student_id,
      student.contact_email || 'N/A',
      student.contact_phone || 'N/A',
      student.section_name,
      student.last_login_at
        ? new Date(student.last_login_at).toLocaleDateString()
        : 'Never',
      student.days_since_last_login?.toString() || 'N/A',
      student.percentile_rank.toString(),
      student.logins_last_7_days.toString(),
      student.risk_factors
        .map((rf) => RISK_FACTOR_CONFIG[rf].label)
        .join('; ')
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `at-risk-students-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const getRiskLevelColor = (riskFactorCount: number) => {
    if (riskFactorCount >= 4) return 'text-red-700 bg-red-100 border-red-300';
    if (riskFactorCount >= 3) return 'text-orange-700 bg-orange-100 border-orange-300';
    if (riskFactorCount >= 2) return 'text-yellow-700 bg-yellow-100 border-yellow-300';
    return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            <span className="ml-4 text-gray-600">Loading at-risk students...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900">
                  At-Risk Students
                </DialogTitle>
                <DialogDescription className="text-gray-600 mt-1">
                  Students requiring attention and early intervention
                </DialogDescription>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Total At-Risk</p>
                <p className="text-3xl font-bold text-red-700 mt-1">
                  {students.length}
                </p>
              </div>
              <AlertTriangle className="h-10 w-10 text-red-400" />
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">No Recent Login</p>
                <p className="text-3xl font-bold text-orange-700 mt-1">
                  {
                    students.filter((s) =>
                      s.risk_factors.includes('no_login_7d' as RiskFactor)
                    ).length
                  }
                </p>
              </div>
              <Calendar className="h-10 w-10 text-orange-400" />
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 font-medium">Bottom 20%</p>
                <p className="text-3xl font-bold text-yellow-700 mt-1">
                  {
                    students.filter((s) =>
                      s.risk_factors.includes('below_20_percentile' as RiskFactor)
                    ).length
                  }
                </p>
              </div>
              <TrendingDown className="h-10 w-10 text-yellow-400" />
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedStudents.size === students.length && students.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {selectedStudents.size > 0
                ? `${selectedStudents.size} selected`
                : 'Select all'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportToCSV}
              disabled={students.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Students Table */}
        {students.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <AlertTriangle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-medium text-gray-900">No at-risk students found</p>
            <p className="text-gray-600 mt-2">
              All students are showing healthy engagement levels
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedStudents.size === students.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Section
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Percentile
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Risk Factors
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {students.map((student) => {
                  const riskLevel = getRiskLevelColor(student.risk_factors.length);
                  return (
                    <tr
                      key={student.user_id}
                      className={`hover:bg-gray-50 transition-colors ${
                        selectedStudents.has(student.user_id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.user_id)}
                          onChange={() => handleSelectStudent(student.user_id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div
                              className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${riskLevel}`}
                            >
                              <span className="font-medium text-sm">
                                {student.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {student.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {student.student_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {student.section_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(student.last_login_at)}
                        </div>
                        {student.days_since_last_login !== undefined && (
                          <div className="text-xs text-gray-500">
                            {student.days_since_last_login} days ago
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-gray-200 rounded-full h-2 max-w-[60px]">
                            <div
                              className="h-2 rounded-full bg-red-500"
                              style={{ width: `${student.percentile_rank}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {student.percentile_rank}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {student.risk_factors.map((factor) => {
                            const config = RISK_FACTOR_CONFIG[factor];
                            return (
                              <span
                                key={factor}
                                className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}
                              >
                                {config.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col gap-1">
                          {student.contact_email && (
                            <Link
                              href={`mailto:${student.contact_email}`}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            >
                              <Mail className="h-3 w-3" />
                              <span className="text-xs">Email</span>
                            </Link>
                          )}
                          {student.contact_phone && (
                            <Link
                              href={`tel:${student.contact_phone}`}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            >
                              <Phone className="h-3 w-3" />
                              <span className="text-xs">Call</span>
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{students.length}</span> students requiring
              attention
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
