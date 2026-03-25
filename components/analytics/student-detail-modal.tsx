'use client';

import { useState } from 'react';
import type { StudentEngagementDetail, RiskFactor } from '@/types/analytics';
import { ENGAGEMENT_LEVEL_CONFIG, RISK_FACTOR_CONFIG } from '@/types/analytics';
import { useStudentEngagement } from '@/hooks/analytics/use-student-engagement';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  User,
  Mail,
  Phone,
  Calendar,
  Clock,
  TrendingUp,
  Activity,
  AlertTriangle,
  X,
  Monitor,
  Smartphone,
  Tablet
} from 'lucide-react';

interface StudentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
}

type TabType = 'overview' | 'sessions' | 'modules';

export function StudentDetailModal({
  isOpen,
  onClose,
  studentId
}: StudentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const { data: studentDetail, isLoading, error } = useStudentEngagement({
    studentId,
    enabled: isOpen && !!studentId
  });

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Tablet className="h-4 w-4" />;
      case 'desktop':
        return <Monitor className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString()
    };
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading Student Details</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-4 text-gray-600">Loading student details...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !studentDetail) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Error Loading Student Details</DialogTitle>
          </DialogHeader>
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900">Failed to load student details</p>
            <p className="text-gray-600 mt-2">{error?.message || 'Unknown error'}</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { student, currentScore, sessionHistory, moduleUsage } = studentDetail;
  const engagementConfig = ENGAGEMENT_LEVEL_CONFIG[currentScore.engagement_level];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-700 font-bold text-2xl">
                  {student.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900">
                  {student.name}
                </DialogTitle>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                  <span>{student.student_id}</span>
                  <span>•</span>
                  <span>{student.section_name}</span>
                </div>
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

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'sessions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Session History ({sessionHistory.sessions.length})
            </button>
            <button
              onClick={() => setActiveTab('modules')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'modules'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Module Usage
            </button>
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Contact Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Contact Information</h3>
              <div className="grid grid-cols-2 gap-4">
                {student.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <a
                      href={`mailto:${student.email}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {student.email}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Engagement Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <p className="text-xs text-gray-600">Logins (7d)</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {currentScore.logins_last_7_days || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {currentScore.logins_last_30_days || 0} in 30 days
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  <p className="text-xs text-gray-600">Avg Duration</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(currentScore.avg_session_duration_minutes || 0)}m
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {(currentScore.total_time_spent_hours || 0).toFixed(1)}h total
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-purple-500" />
                  <p className="text-xs text-gray-600">Modules</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {currentScore.modules_accessed_count || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">accessed</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-yellow-500" />
                  <p className="text-xs text-gray-600">Percentile</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {currentScore.percentile_rank || 0}%
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full ${
                      (currentScore.percentile_rank || 0) >= 75
                        ? 'bg-green-500'
                        : (currentScore.percentile_rank || 0) >= 40
                        ? 'bg-blue-500'
                        : 'bg-yellow-500'
                    }`}
                    style={{ width: `${currentScore.percentile_rank || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Engagement Level */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Engagement Level</h3>
              <div className="flex items-center gap-4">
                <span
                  className={`px-4 py-2 inline-flex text-sm leading-5 font-semibold rounded-full ${engagementConfig.bgColor} ${engagementConfig.color}`}
                >
                  {engagementConfig.label}
                </span>
                {currentScore.last_login_at && (
                  <div className="text-sm text-gray-600">
                    Last active:{' '}
                    {new Date(currentScore.last_login_at).toLocaleDateString()}{' '}
                    {currentScore.days_since_last_login !== undefined && (
                      <span className="text-gray-500">
                        ({currentScore.days_since_last_login} days ago)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Risk Factors (if at-risk) */}
            {currentScore.is_at_risk && currentScore.risk_factors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <h3 className="text-sm font-medium text-red-900">Risk Factors</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentScore.risk_factors.map((factor: RiskFactor) => {
                    const config = RISK_FACTOR_CONFIG[factor];
                    return (
                      <span
                        key={factor}
                        className={`px-3 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}
                      >
                        {config.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comparative Metrics */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Section Comparison
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Logins vs Section Avg</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">
                      {currentScore.logins_last_7_days || 0}
                    </span>
                    <span className="text-sm text-gray-500">vs</span>
                    <span className="text-lg text-gray-600">
                      {Math.round(currentScore.section_avg_logins_7d || 0)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Duration vs Section Avg</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">
                      {Math.round(currentScore.avg_session_duration_minutes || 0)}m
                    </span>
                    <span className="text-sm text-gray-500">vs</span>
                    <span className="text-lg text-gray-600">
                      {Math.round(currentScore.section_avg_duration || 0)}m
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Session History Tab */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {sessionHistory.sessions.length} session{sessionHistory.sessions.length !== 1 ? 's' : ''}
              </p>
            </div>

            {sessionHistory.sessions.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No session history available</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Login Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Logout Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Device
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Modules Accessed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sessionHistory.sessions.map((session) => {
                      const loginDt = formatDateTime(session.login_at);
                      const logoutDt = session.logout_at
                        ? formatDateTime(session.logout_at)
                        : null;
                      return (
                        <tr key={session.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{loginDt.date}</div>
                            <div className="text-xs text-gray-500">{loginDt.time}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {logoutDt ? (
                              <>
                                <div className="text-sm text-gray-900">{logoutDt.date}</div>
                                <div className="text-xs text-gray-500">{logoutDt.time}</div>
                              </>
                            ) : (
                              <span className="text-sm text-gray-500">Active</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDuration(session.duration_seconds)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {getDeviceIcon(session.device_type)}
                              <span className="text-sm text-gray-900 capitalize">
                                {session.device_type || 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {session.modules_accessed.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {session.modules_accessed.slice(0, 3).map((module, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                                    >
                                      {module}
                                    </span>
                                  ))}
                                  {session.modules_accessed.length > 3 && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                                      +{session.modules_accessed.length - 3} more
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500">None</span>
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
          </div>
        )}

        {/* Module Usage Tab */}
        {activeTab === 'modules' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {moduleUsage.length} module{moduleUsage.length !== 1 ? 's' : ''} accessed
              </p>
            </div>

            {moduleUsage.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No module usage data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {moduleUsage.map((module) => {
                  const maxCount = Math.max(...moduleUsage.map((m) => m.accessCount));
                  const percentage = (module.accessCount / maxCount) * 100;
                  return (
                    <div key={module.moduleName} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">
                            {module.moduleName}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            Last accessed:{' '}
                            {new Date(module.lastAccessedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {module.accessCount}
                          </p>
                          <p className="text-xs text-gray-500">times</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
