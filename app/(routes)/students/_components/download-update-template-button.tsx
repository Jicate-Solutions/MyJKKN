'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileDown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export function DownloadUpdateTemplateButton() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [referenceData, setReferenceData] = useState<{
    academicYears: any[];
    semesters: any[];
    sections: any[];
  } | null>(null);

  // Fetch reference data on mount
  useEffect(() => {
    const fetchReferenceData = async () => {
      try {
        // Fetch from the export API but we'll only use reference data
        const response = await fetch('/api/students/export-for-update');
        if (response.ok) {
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);

          // Extract reference data from sheets
          const academicYears = workbook.SheetNames.includes('Academic Years')
            ? XLSX.utils.sheet_to_json(workbook.Sheets['Academic Years'])
            : [];
          const semesters = workbook.SheetNames.includes('Semesters')
            ? XLSX.utils.sheet_to_json(workbook.Sheets['Semesters'])
            : [];
          const sections = workbook.SheetNames.includes('Sections')
            ? XLSX.utils.sheet_to_json(workbook.Sheets['Sections'])
            : [];

          setReferenceData({ academicYears, semesters, sections });
        }
      } catch (error) {
        console.error('Error fetching reference data:', error);
      }
    };

    fetchReferenceData();
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Create empty template with example row
      const wb = XLSX.utils.book_new();

      // Sheet 1: Empty Template with Example
      const templateData = [
        {
          'Student ID *': 'abc-123-def-456 (copy from database)',
          'First Name': 'JOHN (read-only reference)',
          'Last Name': 'DOE (read-only reference)',
          'Mobile': '9876543210 (read-only reference)',
          'Personal Email': 'john@example.com (read-only reference)',
          'Current Program': 'B.Tech CSE (read-only reference)',
          'Current Department': 'Computer Science (read-only reference)',
          'Roll Number': '2024CS001',
          'College Email': 'john.doe@jkkn.ac.in',
          'Academic Year ID': 'copy-uuid-from-Academic-Years-sheet',
          'Semester ID': 'copy-uuid-from-Semesters-sheet',
          'Section ID': 'copy-uuid-from-Sections-sheet',
          'Photo URL': 'https://example.com/photo.jpg (optional)',
          'Status': 'active (read-only reference)',
          'Profile Complete': 'No (read-only reference)'
        }
      ];

      const ws1 = XLSX.utils.json_to_sheet(templateData);
      ws1['!cols'] = [
        { wch: 40 }, // Student ID
        { wch: 25 }, // First Name
        { wch: 25 }, // Last Name
        { wch: 20 }, // Mobile
        { wch: 30 }, // Personal Email
        { wch: 30 }, // Current Program
        { wch: 30 }, // Current Department
        { wch: 20 }, // Roll Number
        { wch: 30 }, // College Email
        { wch: 40 }, // Academic Year ID
        { wch: 40 }, // Semester ID
        { wch: 40 }, // Section ID
        { wch: 35 }, // Photo URL
        { wch: 15 }, // Status
        { wch: 20 } // Profile Complete
      ];

      XLSX.utils.book_append_sheet(wb, ws1, 'Template');

      // Sheet 2: Academic Years Reference (if available)
      if (referenceData?.academicYears && referenceData.academicYears.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(referenceData.academicYears);
        ws2['!cols'] = [
          { wch: 40 },
          { wch: 20 },
          { wch: 15 },
          { wch: 15 },
          { wch: 10 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, 'Academic Years');
      }

      // Sheet 3: Semesters Reference (if available)
      if (referenceData?.semesters && referenceData.semesters.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(referenceData.semesters);
        ws3['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws3, 'Semesters');
      }

      // Sheet 4: Sections Reference (if available)
      if (referenceData?.sections && referenceData.sections.length > 0) {
        const ws4 = XLSX.utils.json_to_sheet(referenceData.sections);
        ws4['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws4, 'Sections');
      }

      // Sheet 5: Instructions
      const instructions = [
        { '': 'EMPTY BULK UPDATE TEMPLATE' },
        { '': '' },
        {
          '': 'This is an EMPTY template for manually updating student records.'
        },
        {
          '': 'If you want to export EXISTING students, use the "Export for Update" button instead.'
        },
        { '': '' },
        { '': '══════════════════════════════════════════════════════════' },
        { '': 'HOW TO USE THIS TEMPLATE:' },
        { '': '══════════════════════════════════════════════════════════' },
        { '': '' },
        { '': 'STEP 1: Get Student IDs' },
        {
          '': '- You need the Student ID (UUID) from your database for each student'
        },
        { '': '- OR use "Export for Update" to get students with their IDs' },
        { '': '' },
        { '': 'STEP 2: Fill Template' },
        { '': '- Delete the example row from the Template sheet' },
        { '': '- Add rows with Student IDs and fields you want to update' },
        {
          '': '- Copy UUIDs from reference sheets (Academic Years, Semesters, Sections)'
        },
        { '': '' },
        { '': 'STEP 3: Fields to Update' },
        { '': '- Roll Number: Alphanumeric, e.g., 2024CS001' },
        { '': '- College Email: Must end with @jkkn.ac.in' },
        { '': '- Academic Year ID: Copy from "Academic Years" sheet' },
        { '': '- Semester ID: Copy from "Semesters" sheet' },
        { '': '- Section ID: Copy from "Sections" sheet' },
        { '': '- Photo URL: Optional, must be valid URL' },
        { '': '' },
        { '': 'STEP 4: Upload' },
        { '': '- Save this file' },
        { '': '- Go to Students > Learners Onboarding' },
        { '': '- Click "Bulk Update Students"' },
        { '': '- Upload this file' },
        { '': '' },
        { '': '══════════════════════════════════════════════════════════' },
        { '': 'IMPORTANT NOTES:' },
        { '': '══════════════════════════════════════════════════════════' },
        { '': '' },
        { '': '✓ Only EMPTY fields will be updated' },
        { '': '✓ Existing data will NOT be overwritten' },
        { '': '✓ Student ID is REQUIRED for matching records' },
        { '': '✓ When all 5 fields are filled, user accounts are created automatically' },
        { '': '✓ Email validation: Must end with @jkkn.ac.in' },
        { '': '' },
        { '': '══════════════════════════════════════════════════════════' },
        { '': 'DIFFERENCE: Template vs Export' },
        { '': '══════════════════════════════════════════════════════════' },
        { '': '' },
        {
          '': '📄 DOWNLOAD TEMPLATE (this file): Empty structure for manual entry'
        },
        {
          '': '   → Use when: You want to manually update specific students by ID'
        },
        { '': '' },
        {
          '': '📊 EXPORT FOR UPDATE: Gets actual incomplete students from database'
        },
        {
          '': '   → Use when: You want to fill missing fields for existing incomplete students'
        },
        {
          '': '   → Pre-filled with current student data and values'
        },
        {
          '': '   → Respects page filters (institution, department, etc.)'
        }
      ];

      const ws5 = XLSX.utils.json_to_sheet(instructions);
      ws5['!cols'] = [{ wch: 100 }];
      XLSX.utils.book_append_sheet(wb, ws5, 'Instructions');

      // Generate and download file
      const fileContent = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([fileContent], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'student_bulk_update_template_empty.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(
        'Empty template downloaded! Fill in Student IDs and missing fields.'
      );
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      variant='outline'
      onClick={handleDownload}
      disabled={isDownloading}
      className='w-full sm:w-auto'
    >
      {isDownloading ? (
        <>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          Downloading...
        </>
      ) : (
        <>
          <FileDown className='mr-2 h-4 w-4' />
          Download Template
        </>
      )}
    </Button>
  );
}
