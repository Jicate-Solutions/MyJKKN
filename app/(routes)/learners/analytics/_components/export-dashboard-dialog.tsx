// ============================================
// EXPORT DASHBOARD DIALOG - COMPREHENSIVE
// ============================================
// Created: 2025-01-23
// Purpose: Export dashboard data to PDF, Excel, or CSV
// Libraries: jsPDF, html2canvas, xlsx
// ============================================

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, FileSpreadsheet, FileText, Image, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { LearnerDashboardStats, LearnerDashboardFilters } from '@/types/learner-dashboard';

interface ExportDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardData: LearnerDashboardStats;
  filters: LearnerDashboardFilters;
}

type ExportFormat = 'pdf' | 'excel' | 'csv';

export function ExportDashboardDialog({
  open,
  onOpenChange,
  dashboardData,
  filters
}: ExportDashboardDialogProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTabs, setSelectedTabs] = useState<string[]>([
    'overview',
    'organizational',
    'demographics',
    'geographic',
    'trends',
    'profileCompletion'
  ]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'organizational', label: 'Organizational', icon: '🏢' },
    { id: 'demographics', label: 'Demographics', icon: '👥' },
    { id: 'geographic', label: 'Geographic', icon: '🗺️' },
    { id: 'trends', label: 'Trends', icon: '📈' },
    { id: 'profileCompletion', label: 'Profile Completion', icon: '✓' }
  ];

  const toggleTab = (tabId: string) => {
    setSelectedTabs((prev) =>
      prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId]
    );
  };

  const handleExport = async () => {
    if (selectedTabs.length === 0) {
      toast.error('Please select at least one tab to export');
      return;
    }

    setIsExporting(true);

    try {
      if (exportFormat === 'pdf') {
        await exportAsPDF();
      } else if (exportFormat === 'excel') {
        await exportAsExcel();
      } else if (exportFormat === 'csv') {
        await exportAsCSV();
      }

      toast.success(`Dashboard exported successfully as ${exportFormat.toUpperCase()}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export dashboard. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsPDF = async () => {
    // Dynamically import jsPDF and html2canvas
    const { default: jsPDF } = await import('jspdf');
    const html2canvas = (await import('html2canvas')).default;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yOffset = 20;

    // Add title
    doc.setFontSize(20);
    doc.text('Learners Analytics Dashboard', pageWidth / 2, yOffset, { align: 'center' });
    yOffset += 10;

    // Add date
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, yOffset, { align: 'center' });
    yOffset += 15;

    // Add summary data for each selected tab
    doc.setFontSize(12);

    if (selectedTabs.includes('overview')) {
      doc.text('Overview', 20, yOffset);
      yOffset += 7;
      doc.setFontSize(10);
      doc.text(`Total Learners: ${dashboardData.totalCount.toLocaleString()}`, 25, yOffset);
      yOffset += 5;
      doc.text(`Active Students: ${dashboardData.activeCount.toLocaleString()}`, 25, yOffset);
      yOffset += 5;
      doc.text(`New Enquiries (30 Days): ${dashboardData.newEnquiries30Days.current.toLocaleString()}`, 25, yOffset);
      yOffset += 5;
      doc.text(`Awaiting Activation: ${dashboardData.profileCompletion.awaitingActivation.toLocaleString()}`, 25, yOffset);
      yOffset += 10;
    }

    if (selectedTabs.includes('organizational')) {
      doc.setFontSize(12);
      doc.text('Organizational', 20, yOffset);
      yOffset += 7;
      doc.setFontSize(10);
      doc.text(`Institutions: ${dashboardData.byInstitution.length}`, 25, yOffset);
      yOffset += 5;
      doc.text(`Departments: ${dashboardData.byDepartment.length}`, 25, yOffset);
      yOffset += 5;
      doc.text(`Programs: ${dashboardData.byProgram.length}`, 25, yOffset);
      yOffset += 10;
    }

    if (selectedTabs.includes('demographics')) {
      doc.setFontSize(12);
      doc.text('Demographics', 20, yOffset);
      yOffset += 7;
      doc.setFontSize(10);
      dashboardData.byGender.slice(0, 5).forEach((gender) => {
        doc.text(`${gender.name}: ${gender.count.toLocaleString()} (${gender.percentage.toFixed(1)}%)`, 25, yOffset);
        yOffset += 5;
      });
      yOffset += 5;
    }

    if (selectedTabs.includes('profileCompletion')) {
      doc.setFontSize(12);
      doc.text('Profile Completion', 20, yOffset);
      yOffset += 7;
      doc.setFontSize(10);
      doc.text(`Completion Rate: ${dashboardData.profileCompletion.completionRate.toFixed(1)}%`, 25, yOffset);
      yOffset += 5;
      doc.text(`Complete Profiles: ${dashboardData.profileCompletion.completeProfiles.toLocaleString()}`, 25, yOffset);
      yOffset += 5;
      doc.text(`Awaiting Activation: ${dashboardData.profileCompletion.awaitingActivation.toLocaleString()}`, 25, yOffset);
      yOffset += 10;
    }

    // Save PDF
    doc.save(`learners-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportAsExcel = async () => {
    // Dynamically import xlsx
    const XLSX = await import('xlsx');

    const workbook = XLSX.utils.book_new();

    if (selectedTabs.includes('overview')) {
      const overviewData = [
        ['Metric', 'Value'],
        ['Total Learners', dashboardData.totalCount],
        ['Enquiries', dashboardData.enquiriesCount],
        ['Pending', dashboardData.pendingCount],
        ['Approved', dashboardData.approvedCount],
        ['Active Students', dashboardData.activeCount],
        ['Inactive', dashboardData.inactiveCount],
        ['Graduated', dashboardData.graduatedCount],
        ['Exited', dashboardData.exitedCount],
        ['New Enquiries (30 Days)', dashboardData.newEnquiries30Days.current],
        ['New Enquiries Trend', `${dashboardData.newEnquiries30Days.change > 0 ? '+' : ''}${dashboardData.newEnquiries30Days.change.toFixed(1)}%`],
        ['Awaiting Activation', dashboardData.profileCompletion.awaitingActivation]
      ];
      const ws = XLSX.utils.aoa_to_sheet(overviewData);
      XLSX.utils.book_append_sheet(workbook, ws, 'Overview');
    }

    if (selectedTabs.includes('organizational')) {
      const institutionData = [
        ['Institution', 'Count', 'Percentage'],
        ...dashboardData.byInstitution.map((item) => [item.name, item.count, `${item.percentage.toFixed(1)}%`])
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(institutionData);
      XLSX.utils.book_append_sheet(workbook, ws1, 'Institutions');

      const departmentData = [
        ['Department', 'Count', 'Percentage'],
        ...dashboardData.byDepartment.map((item) => [item.name, item.count, `${item.percentage.toFixed(1)}%`])
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(departmentData);
      XLSX.utils.book_append_sheet(workbook, ws2, 'Departments');
    }

    if (selectedTabs.includes('demographics')) {
      const genderData = [
        ['Gender', 'Count', 'Percentage'],
        ...dashboardData.byGender.map((item) => [item.name, item.count, `${item.percentage.toFixed(1)}%`])
      ];
      const ws = XLSX.utils.aoa_to_sheet(genderData);
      XLSX.utils.book_append_sheet(workbook, ws, 'Gender Distribution');
    }

    if (selectedTabs.includes('geographic')) {
      const stateData = [
        ['State', 'Count', 'Percentage'],
        ...dashboardData.byState.map((item) => [item.name, item.count, `${item.percentage.toFixed(1)}%`])
      ];
      const ws = XLSX.utils.aoa_to_sheet(stateData);
      XLSX.utils.book_append_sheet(workbook, ws, 'States');
    }

    if (selectedTabs.includes('profileCompletion')) {
      const completionData = [
        ['Metric', 'Value'],
        ['Total Profiles', dashboardData.profileCompletion.totalProfiles],
        ['Complete Profiles', dashboardData.profileCompletion.completeProfiles],
        ['Incomplete Profiles', dashboardData.profileCompletion.incompleteProfiles],
        ['Completion Rate', `${dashboardData.profileCompletion.completionRate.toFixed(1)}%`],
        ['Awaiting Activation', dashboardData.profileCompletion.awaitingActivation],
        ['Missing College Email', dashboardData.profileCompletion.missingCollegeEmail],
        ['Missing Academic Year', dashboardData.profileCompletion.missingAcademicYear],
        ['Missing Semester', dashboardData.profileCompletion.missingSemester],
        ['Missing Section', dashboardData.profileCompletion.missingSection]
      ];
      const ws = XLSX.utils.aoa_to_sheet(completionData);
      XLSX.utils.book_append_sheet(workbook, ws, 'Profile Completion');
    }

    // Write file
    XLSX.writeFile(workbook, `learners-dashboard-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportAsCSV = async () => {
    // Dynamically import xlsx for CSV export
    const XLSX = await import('xlsx');

    // Combine all selected data into single CSV
    let csvContent = 'Learners Analytics Dashboard\n';
    csvContent += `Generated on: ${new Date().toLocaleDateString()}\n\n`;

    if (selectedTabs.includes('overview')) {
      csvContent += 'OVERVIEW\n';
      csvContent += 'Metric,Value\n';
      csvContent += `Total Learners,${dashboardData.totalCount}\n`;
      csvContent += `Enquiries,${dashboardData.enquiriesCount}\n`;
      csvContent += `Pending,${dashboardData.pendingCount}\n`;
      csvContent += `Approved,${dashboardData.approvedCount}\n`;
      csvContent += `Active Students,${dashboardData.activeCount}\n`;
      csvContent += `Inactive,${dashboardData.inactiveCount}\n`;
      csvContent += `Graduated,${dashboardData.graduatedCount}\n`;
      csvContent += `Exited,${dashboardData.exitedCount}\n`;
      csvContent += `New Enquiries (30 Days),${dashboardData.newEnquiries30Days.current}\n`;
      csvContent += `Awaiting Activation,${dashboardData.profileCompletion.awaitingActivation}\n\n`;
    }

    if (selectedTabs.includes('organizational')) {
      csvContent += 'INSTITUTIONS\n';
      csvContent += 'Institution,Count,Percentage\n';
      dashboardData.byInstitution.forEach((item) => {
        csvContent += `${item.name},${item.count},${item.percentage.toFixed(1)}%\n`;
      });
      csvContent += '\n';
    }

    if (selectedTabs.includes('demographics')) {
      csvContent += 'GENDER DISTRIBUTION\n';
      csvContent += 'Gender,Count,Percentage\n';
      dashboardData.byGender.forEach((item) => {
        csvContent += `${item.name},${item.count},${item.percentage.toFixed(1)}%\n`;
      });
      csvContent += '\n';
    }

    if (selectedTabs.includes('profileCompletion')) {
      csvContent += 'PROFILE COMPLETION\n';
      csvContent += 'Metric,Value\n';
      csvContent += `Total Profiles,${dashboardData.profileCompletion.totalProfiles}\n`;
      csvContent += `Complete Profiles,${dashboardData.profileCompletion.completeProfiles}\n`;
      csvContent += `Completion Rate,${dashboardData.profileCompletion.completionRate.toFixed(1)}%\n`;
      csvContent += `Awaiting Activation,${dashboardData.profileCompletion.awaitingActivation}\n\n`;
    }

    // Create and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `learners-dashboard-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Dashboard</DialogTitle>
          <DialogDescription>
            Choose export format and select tabs to include in the export
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Export Format</Label>
            <RadioGroup value={exportFormat} onValueChange={(value) => setExportFormat(value as ExportFormat)}>
              <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileText className="h-4 w-4 text-red-600" />
                  <div>
                    <p className="font-medium">PDF Document</p>
                    <p className="text-xs text-muted-foreground">
                      Export as formatted PDF with summary data
                    </p>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="excel" id="excel" />
                <Label htmlFor="excel" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileSpreadsheet className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="font-medium">Excel Spreadsheet</p>
                    <p className="text-xs text-muted-foreground">
                      Export data tables as Excel workbook with multiple sheets
                    </p>
                  </div>
                </Label>
              </div>

              <div className="flex items-center space-x-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="font-medium">CSV File</p>
                    <p className="text-xs text-muted-foreground">
                      Export as comma-separated values for data analysis
                    </p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Tab Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Include Tabs</Label>
            <div className="space-y-2">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-muted/50"
                >
                  <Checkbox
                    id={tab.id}
                    checked={selectedTabs.includes(tab.id)}
                    onCheckedChange={() => toggleTab(tab.id)}
                  />
                  <Label
                    htmlFor={tab.id}
                    className="flex items-center gap-2 cursor-pointer flex-1 text-sm"
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || selectedTabs.length === 0}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
