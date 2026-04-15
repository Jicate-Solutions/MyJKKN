'use client';

/**
 * HR Non-Staff Workforce — guests, vendors, student TAs, unpaid volunteers.
 *
 * Scoped to the hr_employees table only (include_staff=false). Full-time
 * staff are managed at /staff/list — showing them here too produced visible
 * duplication (the two URLs returned the same 393 staff rows). Two URLs,
 * two personas, two data sources, no overlap.
 */

import Link from 'next/link';
import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BeatLoader } from 'react-spinners';
import { UsersRound, Plus, AlertCircle, ArrowRight } from 'lucide-react';
import { useHREmployees } from '@/hooks/hr/use-employees';
import type { HRNonStaffEmploymentType } from '@/types/hr';
import { EMPLOYMENT_TYPE_LABELS } from '@/types/hr';

type NonStaffTypeFilter = HRNonStaffEmploymentType | 'all';

export default function HRNonStaffWorkforcePage() {
  const [search, setSearch] = useState('');
  const [employmentType, setEmploymentType] = useState<NonStaffTypeFilter>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useHREmployees({
    search: search || undefined,
    employment_type: employmentType === 'all' ? undefined : employmentType,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
    page,
    pageSize: 25,
    include_staff: false,
  });

  return (
    <ContentLayout title="HR — Non-Staff Workforce">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Non-Staff Workforce</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UsersRound className="h-6 w-6" />
              Non-Staff Workforce
            </h1>
            <p className="text-sm text-muted-foreground">
              Guest faculty, vendor-monitored workers, student TAs, and unpaid volunteers
              {data ? ` — ${data.metadata.total} total` : ' — loading…'}
            </p>
          </div>
          <Button asChild>
            <Link href="/hr/employees/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Non-Staff Employee
            </Link>
          </Button>
        </div>

        {/* Cross-link to staff module — explicit because users expect "Employees"
            here and we want to redirect that mental model to /staff/list. */}
        <Card className="bg-muted/40 border-dashed">
          <CardContent className="py-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Looking for full-time JKKN staff (393 employees)?
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/staff/list">
                Go to Employee Management
                <ArrowRight className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Search name / code / email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <Select
                value={employmentType}
                onValueChange={(v) => {
                  setEmploymentType(v as NonStaffTypeFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All non-staff types</SelectItem>
                  <SelectItem value="guest">{EMPLOYMENT_TYPE_LABELS.guest}</SelectItem>
                  <SelectItem value="student_ta">{EMPLOYMENT_TYPE_LABELS.student_ta}</SelectItem>
                  <SelectItem value="vendor_monitored">{EMPLOYMENT_TYPE_LABELS.vendor_monitored}</SelectItem>
                  <SelectItem value="unpaid_volunteer">{EMPLOYMENT_TYPE_LABELS.unpaid_volunteer}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={activeFilter}
                onValueChange={(v) => {
                  setActiveFilter(v as 'all' | 'active' | 'inactive');
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Non-Staff Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex justify-center py-8">
                <BeatLoader color="#3b82f6" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 py-4">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load: {error instanceof Error ? error.message : 'Unknown error'}</span>
              </div>
            )}
            {data && data.data.length === 0 && (
              <div className="text-center py-12 text-muted-foreground space-y-3">
                <UsersRound className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-medium">No non-staff employees yet.</p>
                <p className="text-xs max-w-md mx-auto">
                  Use this page to onboard guest lecturers, vendor-monitored workers,
                  paid student TAs, and unpaid volunteer ambassadors. Full-time JKKN
                  staff are managed at <Link href="/staff/list" className="underline">Employee Management</Link>.
                </p>
                <Button asChild size="sm" className="mt-2">
                  <Link href="/hr/employees/new">
                    <Plus className="mr-2 h-3 w-3" />
                    Add your first non-staff employee
                  </Link>
                </Button>
              </div>
            )}
            {data && data.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Designation</th>
                      <th className="py-2 pr-3">Institution</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((emp) => (
                      <tr key={emp.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-3 font-mono text-xs">
                          <Link href={`/hr/employees/${emp.id}?source=${emp.source}`} className="underline-offset-2 hover:underline">
                            {emp.employee_code ?? '—'}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <Link href={`/hr/employees/${emp.id}?source=${emp.source}`} className="hover:underline">
                            {emp.first_name} {emp.last_name ?? ''}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="secondary">
                            {EMPLOYMENT_TYPE_LABELS[emp.employment_type as HRNonStaffEmploymentType] ?? emp.employment_type}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">{emp.designation_name ?? '—'}</td>
                        <td className="py-2 pr-3">{emp.organization_name ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {emp.is_active ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data && data.metadata.totalPages > 1 && (
              <div className="flex justify-between items-center pt-4">
                <span className="text-xs text-muted-foreground">
                  Page {data.metadata.page} of {data.metadata.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.metadata.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
