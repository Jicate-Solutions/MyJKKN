'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertBox } from '@/components/ui/alert-box';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import EditableCell from './editable-cell';

interface SchoolWithDefaults {
  school_id: string;
  school_name: string;
  entity_type: string;
  degree_id: string | null;
  degree_name: string | null;
  degree_code: string | null;
  department_id: string | null;
  department_name: string | null;
  department_code: string | null;
  learner_count: number;
}

interface SchoolDefaultsTableProps {
  data: SchoolWithDefaults[];
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectSchool: (schoolId: string, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onViewSchool: (school: SchoolWithDefaults) => void;
  onUpdateDegree?: (schoolId: string, degreeId: string | null, newName: string) => Promise<void>;
  onUpdateDepartment?: (schoolId: string, deptId: string | null, newName: string) => Promise<void>;
}

export default function SchoolDefaultsTable({
  data,
  selectedIds,
  onSelectAll,
  onSelectSchool,
  onRefresh,
  onViewSchool,
  onUpdateDegree,
  onUpdateDepartment,
}: SchoolDefaultsTableProps) {
  const hasDefaults = (school: SchoolWithDefaults) => !!school.degree_id;

  const defaultsCount = data.filter(hasDefaults).length;
  const missingCount = data.filter(s => !hasDefaults(s)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total Schools</div>
          <div className="text-2xl font-bold">{data.length}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">With Defaults</div>
          <div className="text-2xl font-bold text-green-600">{defaultsCount}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Missing Defaults</div>
          <div className="text-2xl font-bold text-amber-600">{missingCount}</div>
        </div>
      </div>

      {missingCount > 0 && (
        <AlertBox
          type="warning"
          message={`${missingCount} school(s) are missing K-12 Program degree assignment. Run the batch auto-fill script to fix: npm run batch:autofill-schools`}
        />
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.size === data.length && data.length > 0}
                  indeterminate={selectedIds.size > 0 && selectedIds.size < data.length ? true : undefined}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <TableHead>School Name</TableHead>
              <TableHead>Learners</TableHead>
              <TableHead>K-12 Program Degree</TableHead>
              <TableHead>Academic Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(school => (
              <TableRow key={school.school_id}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(school.school_id)}
                    onCheckedChange={(checked) => onSelectSchool(school.school_id, checked as boolean)}
                  />
                </TableCell>
                <TableCell className="font-medium">{school.school_name}</TableCell>
                <TableCell>{school.learner_count}</TableCell>
                <TableCell>
                  {school.degree_name ? (
                    <div className="space-y-1">
                      <EditableCell
                        value={school.degree_name}
                        onSave={async (newValue) => {
                          if (onUpdateDegree) {
                            await onUpdateDegree(school.school_id, school.degree_id, newValue);
                          }
                        }}
                        placeholder="Degree name"
                      />
                      <div className="text-xs text-muted-foreground">{school.degree_code}</div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {school.department_name ? (
                    <div className="space-y-1">
                      <EditableCell
                        value={school.department_name}
                        onSave={async (newValue) => {
                          if (onUpdateDepartment) {
                            await onUpdateDepartment(school.school_id, school.department_id, newValue);
                          }
                        }}
                        placeholder="Department name"
                      />
                      <div className="text-xs text-muted-foreground">{school.department_code}</div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {school.degree_id ? (
                    <Badge variant="outline" className="bg-green-50 border-green-300">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 border-amber-300">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Missing
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewSchool(school)}
                  >
                    {school.degree_id ? 'View' : 'Create'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        Schools with &quot;Missing&quot; status can be fixed using: <code className="bg-muted px-2 py-1 rounded">npm run batch:autofill-schools</code>
      </div>
    </div>
  );
}
