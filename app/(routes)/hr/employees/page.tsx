'use client';

/**
 * HR Employees List — Sprint 1 Phase D (simplified for v1 foundation).
 *
 * Shows polymorphic employees across all JKKN institutions (RLS-bound).
 * Includes filters: employment_type, active status, search by name/code/email.
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
import { Users, Plus, AlertCircle } from 'lucide-react';
import { useHREmployees } from '@/hooks/hr/use-employees';
import type { HREmploymentType } from '@/types/hr';
import { EMPLOYMENT_TYPE_LABELS } from '@/types/hr';

type EmploymentTypeFilter = HREmploymentType | 'all';

export default function HREmployeesPage() {
  const [search, setSearch] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentTypeFilter>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useHREmployees({
    search: search || undefined,
    employment_type: employmentType === 'all' ? undefined : employmentType,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active',
    page,
    pageSize: 25,
  });

  return (
    <ContentLayout title="HR — Employees">
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
            <BreadcrumbPage>Employees</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-6 w-6" />
              Employees
            </h1>
            <p className="text-sm text-muted-foreground">
              {data ? `${data.metadata.total} total` : 'Loading...'}
            </p>
          </div>
          <Button asChild>
            <Link href="/hr/employees/new">
              <Plus className="mr-2 h-4 w-4" />
              New Employee
            </Link>
          </Button>
        </div>

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
                  setEmploymentType(v as EmploymentTypeFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Employment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="full_time">{EMPLOYMENT_TYPE_LABELS.full_time}</SelectItem>
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
            <CardTitle>Employee List</CardTitle>
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
              <div className="text-center py-8 text-muted-foreground">
                No employees found.
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
                            {EMPLOYMENT_TYPE_LABELS[emp.employment_type as HREmploymentType] ?? emp.employment_type}
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
