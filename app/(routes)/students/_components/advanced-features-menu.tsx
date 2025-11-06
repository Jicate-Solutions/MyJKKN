'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  FileDown,
  Download,
  Upload,
  FileUp,
  Settings
} from 'lucide-react';
import { StudentFilters } from '@/types/student';
import { usePermissions } from '@/hooks/use-permissions';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

interface AdvancedFeaturesMenuProps {
  filters?: StudentFilters;
  onRefetch?: () => void;
}

export function AdvancedFeaturesMenu({
  filters,
  onRefetch
}: AdvancedFeaturesMenuProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  // Check granular permissions
  const canExportForUpdate = isSuperAdmin || canAccess('students.onboarding.bulk_update', 'export');
  const canImportUpdates = isSuperAdmin || canAccess('students.onboarding.bulk_update', 'import');
  const canExportCreateTemplate = isSuperAdmin || canAccess('students.bulk_create', 'export_template');
  const canImportNewStudents = isSuperAdmin || canAccess('students.bulk_create', 'import');

  // Show bulk update section if user has any update permission
  const showBulkUpdateSection = canExportForUpdate || canImportUpdates;

  // Show bulk create section if user has any create permission
  const showBulkCreateSection = canExportCreateTemplate || canImportNewStudents;

  // If no permissions at all, don't show the menu
  if (!showBulkUpdateSection && !showBulkCreateSection) {
    return null;
  }

  // Handle download empty template for updates
  const handleDownloadUpdateTemplate = async () => {
    setIsDownloading(true);
    try {
      // Fetch reference data
      const response = await fetch('/api/students/export-for-update');
      const referenceData: { academicYears: any[]; semesters: any[]; sections: any[] } = {
        academicYears: [],
        semesters: [],
        sections: []
      };

      if (response.ok) {
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);

        const academicYears = workbook.SheetNames.includes('Academic Years')
          ? XLSX.utils.sheet_to_json(workbook.Sheets['Academic Years'])
          : [];
        const semesters = workbook.SheetNames.includes('Semesters')
          ? XLSX.utils.sheet_to_json(workbook.Sheets['Semesters'])
          : [];
        const sections = workbook.SheetNames.includes('Sections')
          ? XLSX.utils.sheet_to_json(workbook.Sheets['Sections'])
          : [];

        referenceData.academicYears = academicYears;
        referenceData.semesters = semesters;
        referenceData.sections = sections;
      }

      // Create empty template
      const wb = XLSX.utils.book_new();

      const templateData = [
        {
          'Student ID *': 'abc-123-def-456',
          'First Name': 'JOHN',
          'Last Name': 'DOE',
          'Mobile': '9876543210',
          'Roll Number': '2024CS001',
          'College Email': 'john.doe@jkkn.ac.in',
          'Academic Year ID': 'copy-from-reference-sheet',
          'Semester ID': 'copy-from-reference-sheet',
          'Section ID': 'copy-from-reference-sheet',
          'Photo URL': 'https://example.com/photo.jpg'
        }
      ];

      const ws1 = XLSX.utils.json_to_sheet(templateData);
      ws1['!cols'] = Array(10).fill({ wch: 30 });
      XLSX.utils.book_append_sheet(wb, ws1, 'Template');

      if (referenceData.academicYears.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(referenceData.academicYears as any);
        XLSX.utils.book_append_sheet(wb, ws2, 'Academic Years');
      }

      if (referenceData.semesters.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(referenceData.semesters as any);
        XLSX.utils.book_append_sheet(wb, ws3, 'Semesters');
      }

      if (referenceData.sections.length > 0) {
        const ws4 = XLSX.utils.json_to_sheet(referenceData.sections as any);
        XLSX.utils.book_append_sheet(wb, ws4, 'Sections');
      }

      const fileContent = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob2 = new Blob([fileContent], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob2);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'student_update_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Empty template downloaded!');
    } catch (error) {
      toast.error('Failed to download template');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle export for update
  const handleExportForUpdate = async () => {
    setIsDownloading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.institution) params.append('institution', filters.institution);
      if (filters?.department) params.append('department', filters.department);
      if (filters?.program) params.append('program', filters.program);
      if (filters?.semester) params.append('semester', filters.semester);
      if (filters?.section) params.append('section', filters.section);
      if (filters?.status) params.append('status', filters.status);

      const response = await fetch(
        `/api/students/export-for-update?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_for_update_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Students exported for update!');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to export'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle download create template
  const handleDownloadCreateTemplate = () => {
    toast('Use the download option in Bulk Create Students dialog', { icon: 'ℹ️' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto' disabled={isDownloading}>
          <Settings className='mr-2 h-4 w-4' />
          Advanced Features
          <ChevronDown className='ml-2 h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-72' align='end'>
        <DropdownMenuLabel>Bulk Operations</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Bulk Update Section */}
        {showBulkUpdateSection && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className='text-xs text-muted-foreground font-normal px-2 py-1.5'>
              📊 Update Incomplete Students
            </DropdownMenuLabel>

            {canExportForUpdate && (
              <>
                <DropdownMenuItem
                  onClick={handleDownloadUpdateTemplate}
                  className='cursor-pointer'
                  disabled={isDownloading}
                >
                  <FileDown className='mr-2 h-4 w-4' />
                  <div className='flex flex-col'>
                    <span>Download Empty Template</span>
                    <span className='text-xs text-muted-foreground'>
                      Structure for manual entry
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={handleExportForUpdate}
                  className='cursor-pointer'
                  disabled={isDownloading}
                >
                  <Download className='mr-2 h-4 w-4' />
                  <div className='flex flex-col'>
                    <span>Export for Update</span>
                    <span className='text-xs text-muted-foreground'>
                      Get current incomplete students
                    </span>
                  </div>
                </DropdownMenuItem>
              </>
            )}

            {canImportUpdates && (
              <DropdownMenuItem
                onClick={() => {
                  // Trigger the hidden dialog button
                  const btn = document.querySelector(
                    '#update-trigger button'
                  ) as HTMLButtonElement;
                  if (btn) btn.click();
                }}
                className='cursor-pointer'
              >
                <Upload className='mr-2 h-4 w-4 text-green-600' />
                <div className='flex flex-col'>
                  <span className='text-green-600 font-medium'>
                    Bulk Update Students
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    Upload filled update file
                  </span>
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}

        {showBulkUpdateSection && showBulkCreateSection && <DropdownMenuSeparator />}

        {/* Bulk Create Section */}
        {showBulkCreateSection && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className='text-xs text-muted-foreground font-normal px-2 py-1.5'>
              ➕ Create New Students
            </DropdownMenuLabel>

            {canExportCreateTemplate && (
              <DropdownMenuItem
                onClick={handleDownloadCreateTemplate}
                className='cursor-pointer'
              >
                <FileDown className='mr-2 h-4 w-4' />
                <div className='flex flex-col'>
                  <span>Download Create Template</span>
                  <span className='text-xs text-muted-foreground'>
                    For new student entries
                  </span>
                </div>
              </DropdownMenuItem>
            )}

            {canImportNewStudents && (
              <DropdownMenuItem
                onClick={() => {
                  // Trigger the hidden dialog button
                  const btn = document.querySelector(
                    '#create-trigger button'
                  ) as HTMLButtonElement;
                  if (btn) btn.click();
                }}
                className='cursor-pointer'
              >
                <FileUp className='mr-2 h-4 w-4 text-blue-600' />
                <div className='flex flex-col'>
                  <span className='text-blue-600 font-medium'>
                    Bulk Create Students
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    Upload new student data
                  </span>
                </div>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
