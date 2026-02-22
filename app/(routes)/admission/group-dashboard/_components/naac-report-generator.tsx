'use client';

import { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useNAACEnrollmentReport } from '@/hooks/admission/use-naac-report';

export function NAACReportGenerator() {
  const [showReport, setShowReport] = useState(false);
  const { data: report, isLoading, isError } = useNAACEnrollmentReport();

  const exportCSV = () => {
    if (!report?.rows?.length) return;

    const header = 'Institution,Academic Year,Sanctioned Intake,Students Admitted,Enrollment %';
    const rows = report.rows.map(
      (r) => `"${r.institution_name}",${r.academic_year},${r.sanctioned_intake},${r.students_admitted},${r.enrollment_percentage}`
    );

    // Add average rows
    const avgRows = (report.averages || []).map(
      (a) => `"${a.institution_name}",Average,,,${a.avg_enrollment_percentage}`
    );

    const csv = [header, ...rows, '', ...avgRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naac-enrollment-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            NAAC Criteria 2.1.1 Report
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowReport(!showReport)}
            >
              {showReport ? 'Hide' : 'Generate'}
            </Button>
            {showReport && report?.rows?.length ? (
              <Button size="sm" variant="outline" onClick={exportCSV}>
                <Download className="h-3 w-3 mr-1" />
                CSV
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      {showReport && (
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Failed to generate report.</p>
          ) : !report?.rows?.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No enrollment data available.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="border rounded-md overflow-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Sanctioned</TableHead>
                      <TableHead className="text-right">Admitted</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.rows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">{row.institution_name}</TableCell>
                        <TableCell className="text-sm">{row.academic_year}</TableCell>
                        <TableCell className="text-right">{row.sanctioned_intake}</TableCell>
                        <TableCell className="text-right">{row.students_admitted}</TableCell>
                        <TableCell className="text-right font-medium">
                          {row.enrollment_percentage}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {report.averages.length > 0 && (
                <div className="pt-2 border-t">
                  <h4 className="text-sm font-medium mb-2">Average Enrollment %</h4>
                  <div className="space-y-1">
                    {report.averages.map((avg) => (
                      <div
                        key={avg.institution_name}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{avg.institution_name}</span>
                        <span className="font-medium">{avg.avg_enrollment_percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
