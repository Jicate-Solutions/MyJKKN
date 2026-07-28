'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { HRPersonView } from '@/types/hr';

interface Props {
  rows: HRPersonView[];
}

export function HREmployeesTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr className="text-left text-muted-foreground">
            <th className="py-2 pr-3">Code</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Phone</th>
            <th className="py-2 pr-3">Designation</th>
            <th className="py-2 pr-3">Cadre</th>
            <th className="py-2 pr-3">Organization</th>
            <th className="py-2 pr-3">Institution</th>
            <th className="py-2 pr-3">Department</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((emp) => (
            <tr key={emp.id} className="border-b hover:bg-muted/40">
              <td className="py-2 pr-3 font-mono text-xs">
                <Link href={`/hr/employees/${emp.id}`} className="underline-offset-2 hover:underline">
                  {emp.employee_code ?? '—'}
                </Link>
              </td>
              <td className="py-2 pr-3">
                <Link href={`/hr/employees/${emp.id}`} className="hover:underline">
                  {emp.first_name} {emp.last_name ?? ''}
                </Link>
              </td>
              <td className="py-2 pr-3">{emp.email ?? '—'}</td>
              <td className="py-2 pr-3">{emp.phone ?? '—'}</td>
              <td className="py-2 pr-3">{emp.designation_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.cadre_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.organization_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.institution_name ?? '—'}</td>
              <td className="py-2 pr-3">{emp.department_name ?? '—'}</td>
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
  );
}
