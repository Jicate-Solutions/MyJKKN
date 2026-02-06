'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, Download, BarChart3, Layers, Users, Building2, Zap, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  REPORT_DEFINITIONS,
  type ReportType,
  type ReportFormat,
  type ReportConfig,
} from '@/types/usage-analytics';
import { useGenerateReport } from '@/hooks/analytics/use-lifecycle-reports';

interface ReportsTabProps {
  isSuperAdmin: boolean;
  defaultDateFrom: string;
  defaultDateTo: string;
  institutionId?: string;
}

const REPORT_ICONS: Record<string, React.ReactNode> = {
  BarChart3: <BarChart3 className="h-5 w-5" />,
  Layers: <Layers className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  Building2: <Building2 className="h-5 w-5" />,
  Zap: <Zap className="h-5 w-5" />,
  AlertTriangle: <AlertTriangle className="h-5 w-5" />,
};

export function ReportsTab({
  isSuperAdmin,
  defaultDateFrom,
  defaultDateTo,
  institutionId,
}: ReportsTabProps) {
  const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
  const [format, setFormat] = useState<ReportFormat>('excel');
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);

  const generateReport = useGenerateReport();

  // Filter reports based on access
  const availableReports = REPORT_DEFINITIONS.filter(
    (r) => !r.superAdminOnly || isSuperAdmin
  );

  const handleGenerate = () => {
    if (!selectedReport) return;

    const config: ReportConfig = {
      type: selectedReport,
      format,
      date_from: dateFrom,
      date_to: dateTo,
      institution_id: institutionId,
    };

    generateReport.mutate(config, {
      onSuccess: () => {
        toast.success('Report downloaded successfully');
        setSelectedReport(null);
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to generate report');
      },
    });
  };

  const selectedDef = REPORT_DEFINITIONS.find((r) => r.type === selectedReport);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableReports.map((report) => (
          <Card
            key={report.type}
            className="hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => setSelectedReport(report.type)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  {REPORT_ICONS[report.icon] || <BarChart3 className="h-5 w-5" />}
                  <CardTitle className="text-sm">{report.title}</CardTitle>
                </div>
                {report.superAdminOnly && (
                  <Badge variant="outline" className="text-xs">
                    Super Admin
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs">
                {report.description}
              </CardDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedReport(report.type);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Generate
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Generate Report Dialog */}
      <Dialog
        open={!!selectedReport}
        onOpenChange={(open) => {
          if (!open) setSelectedReport(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDef && REPORT_ICONS[selectedDef.icon]}
              {selectedDef?.title || 'Generate Report'}
            </DialogTitle>
            <DialogDescription>
              {selectedDef?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="format" className="text-xs">
                Export Format
              </Label>
              <Select
                value={format}
                onValueChange={(v) => setFormat(v as ReportFormat)}
              >
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedReport(null)}
              disabled={generateReport.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateReport.isPending}
              className="gap-1.5"
            >
              {generateReport.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
