'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  User,
  CheckCircle,
  AlertCircle,
  Users,
  Loader2,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StaffProfileAnalytics, StaffDashboardFilters } from '@/types/staff';
import { useIncompleteStaffProfiles } from '@/hooks/staff/use-staff';

interface ProfileAnalyticsProps {
  data?: StaffProfileAnalytics;
  isLoading: boolean;
  filters?: StaffDashboardFilters;
}

// Color map for missing field badges (grouped by field type)
const MISSING_FIELD_COLORS: Record<string, string> = {
  // Required fields - warmer/more urgent colors
  'First Name': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Last Name': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Email': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Phone': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Designation': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Date of Birth': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Date of Joining': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  // Optional fields - cooler/less urgent colors
  'Staff ID': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  'Profile Picture': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  'Address': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'State': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'District': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Pincode': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Institution Email': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Blood Group': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
};

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#ec4899',
  '#6366f1'
];

// Move CustomTooltip outside the component to prevent recreation on every render
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className='bg-background border rounded-lg shadow-lg p-3'>
        <p className='font-medium'>{data.field || data.categoryName}</p>
        <div className='space-y-1 mt-2'>
          {data.completedCount !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Completed:</span>
              <span className='font-medium'>
                {data.completedCount.toLocaleString()}
              </span>
            </div>
          )}
          {data.totalCount !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Total:</span>
              <span className='font-medium'>
                {data.totalCount.toLocaleString()}
              </span>
            </div>
          )}
          {data.percentage !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Completion:</span>
              <span className='font-medium'>{data.percentage.toFixed(1)}%</span>
            </div>
          )}
          {data.missingCount !== undefined && (
            <div className='flex items-center justify-between gap-4'>
              <span className='text-sm text-muted-foreground'>Missing:</span>
              <span className='font-medium'>
                {data.missingCount.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export function ProfileAnalytics({ data, isLoading, filters }: ProfileAnalyticsProps) {
  const completionData = useMemo(() => {
    if (!data?.profileCompletionBreakdown) return [];

    return data.profileCompletionBreakdown.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.profileCompletionBreakdown]);

  const categoryCompletionData = useMemo(() => {
    if (!data?.profileCompletionByCategory) return [];

    return data.profileCompletionByCategory.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.profileCompletionByCategory]);

  const missingFieldsData = useMemo(() => {
    if (!data?.missingFields) return [];

    return data.missingFields.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data?.missingFields]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-64' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[350px] w-full' />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <User className='h-5 w-5' />
            Profile Analytics
          </CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center justify-center h-[350px] text-muted-foreground'>
            <div className='text-center'>
              <User className='h-12 w-12 mx-auto mb-4 opacity-50' />
              <p>No profile data available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <User className='h-5 w-5' />
              Profile Analytics
            </CardTitle>
            <CardDescription>
              Facilitators profile completion analysis and insights
            </CardDescription>
          </div>
          <Badge variant='outline'>Profile Insights</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='completion' className='space-y-4'>
          <TabsList>
            <TabsTrigger value='completion'>Field Completion</TabsTrigger>
            <TabsTrigger value='categories'>By Category</TabsTrigger>
            <TabsTrigger value='missing'>Missing Fields</TabsTrigger>
          </TabsList>

          <TabsContent value='completion' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <CheckCircle className='h-4 w-4' />
                Profile Field Completion
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={completionData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='field'
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      angle={-45}
                      textAnchor='end'
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey='percentage' radius={[4, 4, 0, 0]}>
                      {completionData.map((entry, index) => (
                        <Cell
                          key={`completion-cell-${entry.field}-${index}`}
                          fill={entry.fill}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg'>
                      Completion Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      {completionData.slice(0, 5).map((item) => (
                        <div
                          key={`completion-summary-${item.field}`}
                          className='flex justify-between items-center'
                        >
                          <span className='text-sm'>{item.field}:</span>
                          <div className='text-right'>
                            <div className='font-medium'>
                              {item.percentage.toFixed(1)}%
                            </div>
                            <div className='text-xs text-muted-foreground'>
                              {item.completedCount}/{item.totalCount}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-lg'>Key Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Highest Completion:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {completionData.length > 0
                              ? Math.max(
                                  ...completionData.map(
                                    (item) => item.percentage
                                  )
                                ).toFixed(1)
                              : '0'}
                            %
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {completionData.find(
                              (item) =>
                                item.percentage ===
                                Math.max(
                                  ...completionData.map((i) => i.percentage)
                                )
                            )?.field || 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Average Completion:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {completionData.length > 0
                              ? (
                                  completionData.reduce(
                                    (sum, item) => sum + item.percentage,
                                    0
                                  ) / completionData.length
                                ).toFixed(1)
                              : '0'}
                            %
                          </div>
                        </div>
                      </div>
                      <div className='flex justify-between items-center'>
                        <span className='text-sm'>Fields Tracked:</span>
                        <div className='text-right'>
                          <div className='font-medium'>
                            {completionData.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='categories' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <Users className='h-4 w-4' />
                Profile Completion by Category
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={categoryCompletionData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='categoryName'
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      angle={-45}
                      textAnchor='end'
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey='percentage'
                      radius={[4, 4, 0, 0]}
                      fill='#10b981'
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-3'>
                {categoryCompletionData.map((category) => (
                  <div
                    key={category.categoryName}
                    className='flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors'
                  >
                    <div>
                      <h3 className='font-medium'>{category.categoryName}</h3>
                      <div className='text-sm text-muted-foreground'>
                        {category.completedCount} of {category.totalCount}{' '}
                        profiles completed
                      </div>
                    </div>
                    <div className='text-right'>
                      <div className='text-lg font-bold text-green-600'>
                        {category.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value='missing' className='space-y-4'>
            <div className='space-y-4'>
              <h4 className='text-lg font-semibold flex items-center gap-2'>
                <AlertCircle className='h-4 w-4' />
                Most Missing Profile Fields
              </h4>
              <div className='h-[300px]'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart
                    data={missingFieldsData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray='3 3'
                      className='opacity-30'
                    />
                    <XAxis
                      dataKey='field'
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      angle={-45}
                      textAnchor='end'
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey='missingCount'
                      radius={[4, 4, 0, 0]}
                      fill='#ef4444'
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className='space-y-3'>
                <h4 className='font-semibold'>Priority Fields to Complete</h4>
                {missingFieldsData.slice(0, 5).map((field, index) => (
                  <div
                    key={field.field}
                    className='flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg'
                  >
                    <div className='flex items-center gap-3'>
                      <div className='flex items-center justify-center w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold'>
                        {index + 1}
                      </div>
                      <div>
                        <h3 className='font-medium'>{field.field}</h3>
                        <div className='text-sm text-muted-foreground'>
                          High priority for completion
                        </div>
                      </div>
                    </div>
                    <div className='text-right'>
                      <div className='text-lg font-bold text-red-600'>
                        {field.missingCount.toLocaleString()}
                      </div>
                      <div className='text-sm text-muted-foreground'>
                        {field.percentage.toFixed(1)}% missing
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Incomplete Staff Detail Table */}
              <IncompleteStaffTable filters={filters} />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ============================================
// INCOMPLETE STAFF DETAIL TABLE
// ============================================

function IncompleteStaffTable({ filters }: { filters?: StaffDashboardFilters }) {
  const [requiredOnly, setRequiredOnly] = useState(false);

  const { data, isLoading, isError } = useIncompleteStaffProfiles({
    institutionId: filters?.institutionId,
    departmentId: filters?.departmentId,
    categoryId: filters?.categoryId,
    requiredOnly,
    limit: 50,
  });

  return (
    <Card className='mt-6'>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 text-orange-600' />
              Facilitators with Incomplete Profiles
            </CardTitle>
            <CardDescription className='mt-1'>
              Individual facilitators and their missing fields
              {data?.total ? ` (showing ${data.profiles.length} of ${data.total})` : ''}
            </CardDescription>
          </div>
          <div className='flex items-center gap-4'>
            <div className='flex items-center gap-2'>
              <Switch
                id='required-only'
                checked={requiredOnly}
                onCheckedChange={setRequiredOnly}
              />
              <Label htmlFor='required-only' className='text-sm'>
                Required fields only
              </Label>
            </div>
            <Button variant='outline' size='sm' asChild>
              <Link href='/staff/list'>
                View All
                <ExternalLink className='ml-1 h-3 w-3' />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className='flex items-center justify-center py-8'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            <span className='ml-2 text-sm text-muted-foreground'>
              Loading incomplete profiles...
            </span>
          </div>
        )}

        {isError && (
          <div className='flex items-center justify-center py-8 text-sm text-destructive'>
            Failed to load incomplete profiles. Please try again.
          </div>
        )}

        {data && data.profiles.length > 0 && (
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Missing Fields</TableHead>
                  <TableHead className='w-[60px]'>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div>
                        <p className='font-medium'>
                          {profile.first_name} {profile.last_name}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {profile.email}
                        </p>
                        {profile.staff_id && (
                          <p className='text-xs text-muted-foreground'>
                            {profile.staff_id}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className='text-sm'>{profile.designation || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className='text-sm'>
                          {profile.department_name || <span className='text-muted-foreground italic'>—</span>}
                        </span>
                        {profile.institution_name && (
                          <p className='text-xs text-muted-foreground'>
                            {profile.institution_name}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1 max-w-[300px]'>
                        {profile.missingFields.map((field) => (
                          <Badge
                            key={field}
                            variant='secondary'
                            className={`text-xs ${MISSING_FIELD_COLORS[field] || ''}`}
                          >
                            {field}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant='ghost' size='icon' asChild>
                        <Link href={`/staff/list/${profile.id}`}>
                          <Eye className='h-4 w-4' />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data && data.profiles.length === 0 && (
          <div className='flex items-center justify-center py-8 text-muted-foreground'>
            <CheckCircle className='mr-2 h-5 w-5 text-green-500' />
            <span className='text-sm'>
              {requiredOnly
                ? 'All facilitators have complete required fields!'
                : 'All facilitator profiles are complete!'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
