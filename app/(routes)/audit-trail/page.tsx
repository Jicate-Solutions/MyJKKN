// app/(routes)/audit-trail/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { FileText, Download } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  useActivityTimeline,
  useAuditStats
} from '@/hooks/audit-trail/use-audit-trail';
import { useAuth } from '@/hooks/use-auth';
import { AuditAction, AuditModule, AuditSeverity } from '@/types/audit-trail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ActivityTimelineView } from './_components/activity-timeline-view';
import { exportToCSV } from '@/lib/utils/export-utils';

export default function AuditTrailPage() {
  const { profile: user } = useAuth();
  const [activeTab, setActiveTab] = useState('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const filters = useMemo(() => {
    const f: any = {};
    if (searchQuery) f.search = searchQuery;
    if (actionFilter !== 'all') f.action = actionFilter;
    if (moduleFilter !== 'all') f.module = moduleFilter;
    if (severityFilter !== 'all') f.severity = severityFilter;
    return f;
  }, [searchQuery, actionFilter, moduleFilter, severityFilter]);

  const { data: timeline = [], isLoading: timelineLoading } =
    useActivityTimeline(filters);
  const { data: stats, isLoading: statsLoading } = useAuditStats(filters);

  const handleExport = () => {
    // Flatten all logs from the timeline groups
    const allLogs = timeline.flatMap((group) => group.logs);
    if (allLogs.length === 0) return;
    exportToCSV(allLogs, 'audit-trail', [
      { key: 'created_at', label: 'Timestamp' },
      { key: 'action', label: 'Action' },
      { key: 'module', label: 'Module' },
      { key: 'severity', label: 'Severity' },
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'entity_name', label: 'Entity Name' },
      { key: 'description', label: 'Description' },
      { key: 'user_id', label: 'User ID' },
      { key: 'ip_address', label: 'IP Address' },
    ]);
  };

  return (
    <ContentLayout title='Audit Trail'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Audit Trail</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <FileText className='h-8 w-8' />
            Audit Trail
          </h1>
          <p className='text-muted-foreground'>
            Track all system activities and changes
          </p>
        </div>
        <Button variant='outline' onClick={handleExport}>
          <Download className='mr-2 h-4 w-4' />
          Export Logs
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Total Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {statsLoading ? '...' : stats?.total_logs || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Top Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold capitalize'>
              {statsLoading ? '...' : stats?.by_action[0]?.action || 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Top Module
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold capitalize'>
              {statsLoading ? '...' : stats?.by_module[0]?.module || 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {statsLoading ? '...' : stats?.by_user.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className='flex items-center gap-4 mb-6 flex-wrap'>
        <Input
          placeholder='Search logs...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='max-w-sm'
        />

        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Action' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Actions</SelectItem>
            {Object.values(AuditAction).map((action) => (
              <SelectItem key={action} value={action}>
                {action.replace('_', ' ').toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Module' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Modules</SelectItem>
            {Object.values(AuditModule).map((module) => (
              <SelectItem key={module} value={module}>
                {module.charAt(0).toUpperCase() + module.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Severity' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Severities</SelectItem>
            {Object.values(AuditSeverity).map((severity) => (
              <SelectItem key={severity} value={severity}>
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(searchQuery ||
          actionFilter !== 'all' ||
          moduleFilter !== 'all' ||
          severityFilter !== 'all') && (
          <Button
            variant='ghost'
            onClick={() => {
              setSearchQuery('');
              setActionFilter('all');
              setModuleFilter('all');
              setSeverityFilter('all');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <TabsList>
          <TabsTrigger value='timeline'>Timeline View</TabsTrigger>
          <TabsTrigger value='statistics'>Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value='timeline'>
          <ActivityTimelineView
            timeline={timeline}
            isLoading={timelineLoading}
          />
        </TabsContent>

        <TabsContent value='statistics'>
          <div className='grid gap-6 md:grid-cols-2'>
            {/* By Action */}
            <Card>
              <CardHeader>
                <CardTitle>Actions Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {stats?.by_action.slice(0, 10).map((item) => (
                    <div
                      key={item.action}
                      className='flex items-center justify-between'
                    >
                      <span className='capitalize'>
                        {item.action.replace('_', ' ')}
                      </span>
                      <Badge variant='secondary'>{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By Module */}
            <Card>
              <CardHeader>
                <CardTitle>Modules Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {stats?.by_module.map((item) => (
                    <div
                      key={item.module}
                      className='flex items-center justify-between'
                    >
                      <span className='capitalize'>{item.module}</span>
                      <Badge variant='secondary'>{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By Severity */}
            <Card>
              <CardHeader>
                <CardTitle>Severity Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {stats?.by_severity.map((item) => (
                    <div
                      key={item.severity}
                      className='flex items-center justify-between'
                    >
                      <span className='capitalize'>{item.severity}</span>
                      <Badge variant='secondary'>{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By User */}
            <Card>
              <CardHeader>
                <CardTitle>Top Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {stats?.by_user.slice(0, 10).map((item) => (
                    <div
                      key={item.user_id}
                      className='flex items-center justify-between'
                    >
                      <span className='truncate'>{item.user_name}</span>
                      <Badge variant='secondary'>{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </ContentLayout>
  );
}
