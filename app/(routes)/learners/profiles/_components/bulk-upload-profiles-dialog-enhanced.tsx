// ============================================
// ENHANCED BULK UPLOAD PROFILES DIALOG
// ============================================
// Created: 2025-01-27
// Purpose: Multi-step bulk upload with preview, validation, and confirmation
// Features: Data preview, row-by-row validation, error display, progress tracking
// ============================================

'use client';

import { useState, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  UploadCloud,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileText,
  Eye,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
  X,
  Filter,
  UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  mapColumns,
  sanitizeValue,
  validateRow,
  findDuplicateEmails
} from '@/lib/utils/bulk-upload-validation';
import type {
  ParsedRow,
  UploadState,
  ValidationSummary,
  FilterType,
  UploadResult
} from './bulk-upload-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export function BulkUploadProfilesDialogEnhanced({ onSuccess }: { onSuccess?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  // State management
  const [state, setState] = useState<UploadState>({
    step: 'select-file',
    file: null,
    parsedRows: [],
    validationSummary: {
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      duplicateEmails: 0,
      selectedRows: 0
    },
    uploadProgress: 0,
    result: null,
    error: null
  });

  // Download template function (same as original)
  const downloadTemplate = () => {
    try {
      // Create sample data with REQUIRED fields first, then OPTIONAL fields
      const sampleData = [{
        // REQUIRED FIELDS
        '* First Name': 'JOHN',
        'Last Name': 'DOE',
        '* Date of Birth': '2005-01-15',
        '* Gender': 'MALE',
        '* Religion': 'Hindu',
        '* Community': 'BC',
        '* Father Name': 'ROBERT DOE',
        '* Father Mobile': '9876543211',
        '* Mother Name': 'MARY DOE',
        '* Mother Mobile': '9876543212',
        '* Institution': 'JKKN College of Engineering and Technology',
        '* Degree': 'B.E',
        '* Department': 'Computer Science and Engineering',
        '* Program': 'CSE',
        '* Semester': 'I Year I Semester',
        '* Section': 'A',
        '* Student Mobile': '9876543210',
        '* College Email': 'john.doe@jkkn.ac.in',
        '* Permanent Address Street': '123 Main Street',
        '* Permanent Address Taluk': 'Namakkal',
        '* Permanent Address District': 'Namakkal',
        '* Permanent Address Pin Code': '637001',
        '* Permanent Address State': 'Tamil Nadu',
        '* Entry Type': 'FIRST YEAR',
        '* Accommodation Type': 'HOSTEL',

        // OPTIONAL FIELDS
        'Caste': 'OBC',
        'Aadhar Number': '123456789012',
        'Blood Group': 'O+',
        'Admission Year': '2024',
        'Father Occupation': 'Business',
        'Mother Occupation': 'Teacher',
        'Annual Income': '500000',
        'Academic Year': '2024-2025',
        'Regulation': 'R2021',
        'Batch': '2024-2028',
        'Personal Email': 'john@gmail.com',
        'First Graduate': 'TRUE',
        'Hostel Type': 'Boys Hostel A',
        'Food Type': 'VEG',
      }];

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(wb, ws, 'Template');
      XLSX.writeFile(wb, 'bulk-upload-profiles-template.xlsx');
      toast.success('Template downloaded successfully!');
    } catch (error) {
      console.error('[bulk-upload-enhanced] Error generating template:', error);
      toast.error('Failed to generate template');
    }
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx) or CSV file');
      return;
    }

    setState(prev => ({ ...prev, file, step: 'preview-data', error: null }));

    // Parse file
    try {
      await parseAndValidateFile(file);
    } catch (error) {
      console.error('[bulk-upload-enhanced] Parse error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to parse file',
        step: 'select-file'
      }));
      toast.error('Failed to parse file');
    }
  };

  // Parse and validate file
  const parseAndValidateFile = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          if (jsonData.length === 0) {
            reject(new Error('No data found in file'));
            return;
          }

          // Parse and map rows
          const parsedRows: ParsedRow[] = jsonData.map((row: any, index) => {
            const mappedData = mapColumns(row);

            // Sanitize data
            const sanitizedData = {
              first_name: sanitizeValue(mappedData.first_name, 'text'),
              last_name: sanitizeValue(mappedData.last_name, 'text'),
              date_of_birth: sanitizeValue(mappedData.date_of_birth, 'date'),
              gender: sanitizeValue(mappedData.gender, 'text'),
              religion: sanitizeValue(mappedData.religion, 'text'),
              community: sanitizeValue(mappedData.community, 'text'),
              caste: sanitizeValue(mappedData.caste, 'text'),
              father_name: sanitizeValue(mappedData.father_name, 'text'),
              father_mobile: sanitizeValue(mappedData.father_mobile, 'mobile'),
              mother_name: sanitizeValue(mappedData.mother_name, 'text'),
              mother_mobile: sanitizeValue(mappedData.mother_mobile, 'mobile'),
              institution_name: sanitizeValue(mappedData.institution_name, 'text'),
              degree_name: sanitizeValue(mappedData.degree_name, 'text'),
              department_name: sanitizeValue(mappedData.department_name, 'text'),
              program_name: sanitizeValue(mappedData.program_name, 'text'),
              semester_name: sanitizeValue(mappedData.semester_name, 'text'),
              section_name: sanitizeValue(mappedData.section_name, 'text'),
              student_mobile: sanitizeValue(mappedData.student_mobile, 'mobile'),
              college_email: sanitizeValue(mappedData.college_email, 'email'),
              student_email: sanitizeValue(mappedData.student_email, 'email'),
              permanent_address_street: sanitizeValue(mappedData.permanent_address_street, 'text'),
              permanent_address_taluk: sanitizeValue(mappedData.permanent_address_taluk, 'text'),
              permanent_address_district: sanitizeValue(mappedData.permanent_address_district, 'text'),
              permanent_address_pin_code: sanitizeValue(mappedData.permanent_address_pin_code, 'number'),
              permanent_address_state: sanitizeValue(mappedData.permanent_address_state, 'text'),
              entry_type: sanitizeValue(mappedData.entry_type, 'text'),
              accommodation_type: sanitizeValue(mappedData.accommodation_type, 'text'),
            };

            // Validate row
            const validationResult = validateRow(sanitizedData);

            return {
              rowNumber: index + 2, // Excel row number (1-indexed + header row)
              originalData: row,
              mappedData,
              sanitizedData,
              validationStatus: validationResult.status,
              validationResult,
              selected: validationResult.status === 'valid' || validationResult.status === 'warning',
              isDuplicate: false
            };
          });

          // Check for duplicate emails
          const duplicates = findDuplicateEmails(parsedRows);
          duplicates.forEach((rowIndices) => {
            rowIndices.forEach((rowIndex) => {
              parsedRows[rowIndex].isDuplicate = true;
              parsedRows[rowIndex].validationStatus = 'error';
              parsedRows[rowIndex].validationResult?.errors.push({
                field: 'college_email',
                message: 'Duplicate email in this file'
              });
            });
          });

          // Calculate summary
          const summary: ValidationSummary = {
            totalRows: parsedRows.length,
            validRows: parsedRows.filter(r => r.validationStatus === 'valid').length,
            warningRows: parsedRows.filter(r => r.validationStatus === 'warning').length,
            errorRows: parsedRows.filter(r => r.validationStatus === 'error').length,
            duplicateEmails: duplicates.size,
            selectedRows: parsedRows.filter(r => r.selected).length
          };

          setState(prev => ({
            ...prev,
            parsedRows,
            validationSummary: summary,
            step: 'validate'
          }));

          toast.success(`Parsed ${parsedRows.length} rows. ${summary.validRows} valid, ${summary.errorRows} errors.`);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Toggle row selection
  const toggleRowSelection = (rowNumber: number) => {
    setState(prev => ({
      ...prev,
      parsedRows: prev.parsedRows.map(row =>
        row.rowNumber === rowNumber ? { ...row, selected: !row.selected } : row
      ),
      validationSummary: {
        ...prev.validationSummary,
        selectedRows: prev.parsedRows.filter(r =>
          r.rowNumber === rowNumber ? !r.selected : r.selected
        ).length
      }
    }));
  };

  // Select all/none
  const toggleSelectAll = (selected: boolean) => {
    setState(prev => ({
      ...prev,
      parsedRows: prev.parsedRows.map(row => ({
        ...row,
        selected: row.validationStatus !== 'error' && selected
      })),
      validationSummary: {
        ...prev.validationSummary,
        selectedRows: selected
          ? prev.parsedRows.filter(r => r.validationStatus !== 'error').length
          : 0
      }
    }));
  };

  // Handle upload
  const handleUpload = async () => {
    if (state.validationSummary.selectedRows === 0) {
      toast.error('No valid rows selected for upload');
      return;
    }

    setState(prev => ({ ...prev, step: 'uploading', uploadProgress: 0 }));

    try {
      // Prepare FormData with only selected rows
      const selectedRows = state.parsedRows.filter(r => r.selected);

      // Create a new Excel file with only selected rows
      const dataToUpload = selectedRows.map(row => row.originalData);
      const ws = XLSX.utils.json_to_sheet(dataToUpload);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Upload');

      // Convert to blob
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const uploadFile = new File([blob], state.file?.name || 'upload.xlsx');

      // Create FormData
      const formData = new FormData();
      formData.append('file', uploadFile);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          uploadProgress: Math.min(prev.uploadProgress + 10, 90)
        }));
      }, 500);

      // Upload to API
      const response = await fetch('/api/learners/bulk-upload-profiles', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setState(prev => ({ ...prev, uploadProgress: 100 }));

      const data: UploadResult = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.errors?.[0]?.error || 'Upload failed');
      }

      setState(prev => ({ ...prev, result: data, step: 'results' }));

      // Show success message
      const { upload_summary, user_creation_summary } = data;
      if (upload_summary.learners_created > 0) {
        toast.success(
          `Successfully created ${upload_summary.learners_created} learners! ` +
          `${user_creation_summary.new_users_created} user accounts created.`
        );
      }

      if (upload_summary.learners_failed > 0) {
        toast.error(`${upload_summary.learners_failed} learners failed to create`);
      }

      if (onSuccess && upload_summary.learners_created > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error('[bulk-upload-enhanced] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      setState(prev => ({
        ...prev,
        step: 'validate',
        error: error instanceof Error ? error.message : 'Upload failed'
      }));
    }
  };

  // Reset state
  const resetUpload = () => {
    setState({
      step: 'select-file',
      file: null,
      parsedRows: [],
      validationSummary: {
        totalRows: 0,
        validRows: 0,
        warningRows: 0,
        errorRows: 0,
        duplicateEmails: 0,
        selectedRows: 0
      },
      uploadProgress: 0,
      result: null,
      error: null
    });
    setFilter('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Export created users
  const exportCreatedUsers = () => {
    if (!state.result || state.result.created_users.length === 0) return;

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(state.result.created_users);
      XLSX.utils.book_append_sheet(wb, ws, 'Created Users');
      XLSX.writeFile(wb, `created-users-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('User credentials exported!');
    } catch (error) {
      console.error('[bulk-upload-enhanced] Export error:', error);
      toast.error('Failed to export credentials');
    }
  };

  // Filter rows based on current filter
  const filteredRows = useMemo(() => {
    switch (filter) {
      case 'valid':
        return state.parsedRows.filter(r => r.validationStatus === 'valid');
      case 'warning':
        return state.parsedRows.filter(r => r.validationStatus === 'warning');
      case 'error':
        return state.parsedRows.filter(r => r.validationStatus === 'error');
      case 'selected':
        return state.parsedRows.filter(r => r.selected);
      default:
        return state.parsedRows;
    }
  }, [state.parsedRows, filter]);

  // Render validation status badge
  const ValidationBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'valid':
        return (
          <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="border-red-500 text-red-700 bg-red-50">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadCloud className="mr-2 h-4 w-4" />
          Bulk Upload Profiles
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-7xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/50 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                <UploadCloud className="h-5 w-5" />
                Bulk Upload New Learners
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Upload → Preview → Validate → Confirm → Upload with Progress
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="flex-shrink-0"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          {/* Step Indicator */}
          <div className="mt-4 flex items-center gap-2">
            {[
              { key: 'select-file', label: '1. Select File' },
              { key: 'validate', label: '2. Validate' },
              { key: 'confirm', label: '3. Confirm' },
              { key: 'uploading', label: '4. Upload' },
              { key: 'results', label: '5. Results' }
            ].map((step, index) => (
              <div key={step.key} className="flex items-center">
                <div
                  className={`px-3 py-1 rounded-md text-sm font-medium ${
                    state.step === step.key
                      ? 'bg-primary text-primary-foreground'
                      : state.parsedRows.length > 0 &&
                        ['validate', 'confirm', 'uploading', 'results'].includes(step.key) &&
                        ['validate', 'confirm', 'uploading', 'results'].indexOf(state.step) >=
                          ['validate', 'confirm', 'uploading', 'results'].indexOf(step.key)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step.label}
                </div>
                {index < 4 && <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {/* Step 1: Select File */}
          {state.step === 'select-file' && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={fileInputRef}
                />

                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                  <UploadCloud className="h-10 w-10 text-primary" />
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Upload Excel File</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a file containing new learner profiles for preview and validation
                  </p>
                </div>

                <Button
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto"
                >
                  <UploadCloud className="mr-2 h-5 w-5" />
                  Choose File
                </Button>

                <p className="text-xs text-muted-foreground">
                  Supports Excel (.xlsx) and CSV files
                </p>
              </div>
            </div>
          )}

          {/* Step 2 & 3: Preview and Validate */}
          {(state.step === 'preview-data' || state.step === 'validate') && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Rows</CardDescription>
                    <CardTitle className="text-2xl">{state.validationSummary.totalRows}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Valid</CardDescription>
                    <CardTitle className="text-2xl text-green-600">
                      {state.validationSummary.validRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Warnings</CardDescription>
                    <CardTitle className="text-2xl text-yellow-600">
                      {state.validationSummary.warningRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Errors</CardDescription>
                    <CardTitle className="text-2xl text-red-600">
                      {state.validationSummary.errorRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Selected</CardDescription>
                    <CardTitle className="text-2xl text-blue-600">
                      {state.validationSummary.selectedRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Filter and Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Rows</SelectItem>
                      <SelectItem value="selected">Selected Only</SelectItem>
                      <SelectItem value="valid">Valid Only</SelectItem>
                      <SelectItem value="warning">Warnings Only</SelectItem>
                      <SelectItem value="error">Errors Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    Showing {filteredRows.length} of {state.parsedRows.length} rows
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSelectAll(true)}
                  >
                    Select All Valid
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSelectAll(false)}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Data Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead>First Name</TableHead>
                        <TableHead>Last Name</TableHead>
                        <TableHead>College Email</TableHead>
                        <TableHead>Mobile</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="w-48">Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>
                            <Checkbox
                              checked={row.selected}
                              onCheckedChange={() => toggleRowSelection(row.rowNumber)}
                              disabled={row.validationStatus === 'error'}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{row.rowNumber}</TableCell>
                          <TableCell>
                            <ValidationBadge status={row.validationStatus} />
                          </TableCell>
                          <TableCell>{row.sanitizedData.first_name || '-'}</TableCell>
                          <TableCell>{row.sanitizedData.last_name || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.sanitizedData.college_email || '-'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.sanitizedData.student_mobile || '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.sanitizedData.department_name || '-'}
                          </TableCell>
                          <TableCell>
                            {row.validationResult && row.validationResult.errors.length > 0 && (
                              <div className="space-y-1">
                                {row.validationResult.errors.slice(0, 2).map((error, idx) => (
                                  <div key={idx} className="text-xs text-red-600">
                                    • {error.message}
                                  </div>
                                ))}
                                {row.validationResult.errors.length > 2 && (
                                  <div className="text-xs text-muted-foreground">
                                    +{row.validationResult.errors.length - 2} more
                                  </div>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {state.validationSummary.errorRows > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Errors Found</AlertTitle>
                  <AlertDescription>
                    {state.validationSummary.errorRows} rows have errors. Only valid rows can be uploaded.
                    Fix errors in your Excel file or proceed with valid rows only.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {state.step === 'confirm' && (
            <div className="space-y-4">
              <Alert>
                <Eye className="h-4 w-4" />
                <AlertTitle>Ready to Upload</AlertTitle>
                <AlertDescription>
                  You are about to upload {state.validationSummary.selectedRows} learner profiles.
                  User accounts will be created automatically for complete profiles.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Selected Rows</CardTitle>
                    <CardDescription className="text-3xl font-bold text-blue-600">
                      {state.validationSummary.selectedRows}
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Valid Rows</CardTitle>
                    <CardDescription className="text-3xl font-bold text-green-600">
                      {state.validationSummary.validRows}
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Skipped (Errors)</CardTitle>
                    <CardDescription className="text-3xl font-bold text-red-600">
                      {state.validationSummary.errorRows}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          )}

          {/* Step 5: Uploading */}
          {state.step === 'uploading' && (
            <div className="flex items-center justify-center h-full">
              <div className="w-full max-w-md space-y-6">
                <div className="text-center">
                  <TrendingUp className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
                  <h3 className="text-lg font-semibold mb-2">Uploading Profiles...</h3>
                  <p className="text-sm text-muted-foreground">
                    Processing {state.validationSummary.selectedRows} learner profiles
                  </p>
                </div>

                <div className="space-y-2">
                  <Progress value={state.uploadProgress} className="h-3" />
                  <p className="text-sm text-center text-muted-foreground">
                    {state.uploadProgress}% Complete
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Results */}
          {state.step === 'results' && state.result && (
            <div className="space-y-6">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Learners Created</CardDescription>
                    <CardTitle className="text-3xl text-green-600">
                      {state.result.upload_summary.learners_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Out of {state.result.upload_summary.total_rows} total rows
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>User Accounts Created</CardDescription>
                    <CardTitle className="text-3xl text-blue-600">
                      {state.result.user_creation_summary.new_users_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {state.result.user_creation_summary.profiles_complete} complete profiles
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Created Users */}
              {state.result.created_users.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Created User Accounts ({state.result.created_users.length})
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportCreatedUsers}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export Credentials
                    </Button>
                  </div>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Important: Save These Credentials</AlertTitle>
                    <AlertDescription>
                      Temporary passwords are shown only once. Export or copy them before closing this dialog.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                    {state.result.created_users.map((user, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg text-sm bg-green-50 border border-green-200"
                      >
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-green-800">{user.name}</p>
                          <p className="text-xs text-green-700 break-all">{user.email}</p>
                          <p className="text-xs text-green-700 mt-1">
                            <span className="font-medium">Password:</span> {user.temp_password}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {state.result.errors.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-lg text-red-600">
                    Errors ({state.result.errors.length})
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                    {state.result.errors.map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg text-sm bg-red-50 border border-red-200"
                      >
                        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-red-800">Row {error.row}</p>
                          {error.email && <p className="text-xs text-red-700">{error.email}</p>}
                          <p className="text-xs text-red-700 break-words">{error.error}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        <div className="px-6 py-4 border-t bg-muted/50 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              {state.step !== 'select-file' && state.step !== 'results' && (
                <Button
                  variant="outline"
                  onClick={resetUpload}
                  disabled={state.step === 'uploading'}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              {state.step === 'validate' && (
                <>
                  <Button
                    variant="outline"
                    onClick={resetUpload}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Upload Different File
                  </Button>
                  <Button
                    onClick={() => setState(prev => ({ ...prev, step: 'confirm' }))}
                    disabled={state.validationSummary.selectedRows === 0}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}

              {state.step === 'confirm' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setState(prev => ({ ...prev, step: 'validate' }))}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Review
                  </Button>
                  <Button
                    onClick={handleUpload}
                  >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload {state.validationSummary.selectedRows} Profiles
                  </Button>
                </>
              )}

              {state.step === 'results' && (
                <Button onClick={resetUpload}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Upload Another File
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
