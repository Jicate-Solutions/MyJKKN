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
import { useAdmissionAccreditationEnrollmentReport } from '@/hooks/admission/use-admission-accreditation-report';

export function NAACReportGenerator() {
  const [showReport, setShowReport] = useState(false);
  const { data: report, isLoading, isError } = useAdmissionAccreditationEnrollmentReport();

  const exportCSV = () => {
    if (!report?.rows?.length) return;

    // A not-recorded sanctioned intake exports as an EMPTY cell, never 0 — this
    // file is quoted in accreditation submissions, where 0 is a claim.
    const cell = (v: number | null) => (v === null ? '' : String(v));

    const header = 'Institution,Academic Year,Sanctioned Intake,Students Admitted,Enrollment %';
    const rows = report.rows.map(
      (r) => `"${r.institution_name}",${r.academic_year},${cell(r.sanctioned_intake)},${cell(r.students_admitted)},${cell(r.enrollment_percentage)}`
    );

    // Add average rows
    const avgRows = (report.averages || []).map(
      (a) => `"${a.institution_name}",Average,,,${cell(a.avg_enrollment_percentage)}`
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
            NAAC 8.1 — Student Enrolment (Binary framework)
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
              {!report.seatSource.ok ? (
                <p className="text-sm text-destructive">
                  Sanctioned intake could not be read from{' '}
                  <code>{report.seatSource.table}</code>
                  {report.seatSource.error ? ` (${report.seatSource.error})` : ''}. Every
                  row below shows a dash — do not read it as an intake of zero.
                </p>
              ) : report.seatSource.rowsWithIntake < report.seatSource.totalRows ? (
                <p className="text-sm text-muted-foreground">
                  Sanctioned intake is recorded for {report.seatSource.rowsWithIntake} of{' '}
                  {report.seatSource.totalRows} institution-year rows. A dash means not
                  recorded in <code>{report.seatSource.table}</code> — not zero seats.
                </p>
              ) : null}

              {!report.enrolmentSource.usable ? (
                <p className="text-sm text-destructive">
                  Learners admitted is not measuring anything:{' '}
                  {report.enrolmentSource.error
                    ? `the read from ${report.enrolmentSource.table} failed (${report.enrolmentSource.error})`
                    : report.enrolmentSource.leadsRead === 0
                      ? `no ${report.enrolmentSource.table} row sits at funnel stage "${report.enrolmentSource.funnelStage}"`
                      : `none of the ${report.enrolmentSource.leadsRead} leads read fall in an academic year this report covers`}
                  . The column and the enrolment % show a dash — do not read either as zero
                  admissions.
                </p>
              ) : null}

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
                        <TableCell className="text-right">
                          {row.sanctioned_intake === null ? (
                            <span
                              className="text-muted-foreground"
                              title="Not recorded in intake_history for this institution and year"
                            >
                              —
                            </span>
                          ) : (
                            row.sanctioned_intake
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.students_admitted === null ? (
                            <span
                              className="text-muted-foreground"
                              title="No admission lead reached the enrolment stage in a year this report covers"
                            >
                              —
                            </span>
                          ) : (
                            row.students_admitted
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {row.enrollment_percentage === null ? (
                            <span
                              className="text-muted-foreground font-normal"
                              title="Cannot be stated without a positive sanctioned intake"
                            >
                              —
                            </span>
                          ) : (
                            `${row.enrollment_percentage}%`
                          )}
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
                        <span className="font-medium">
                          {avg.avg_enrollment_percentage === null
                            ? '—'
                            : `${avg.avg_enrollment_percentage}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-2 border-t">
                Sanctioned intake: <code>intake_history</code>, summed over each
                college&apos;s programme rows for the year. Learners admitted:{' '}
                <code>admission_leads</code> at funnel stage <code>enrolled</code>,
                bucketed by the date the lead last changed.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
