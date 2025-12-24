// ============================================
// BULK UPLOAD PROFILES DIALOG
// ============================================
// Created: 2025-01-22
// Purpose: Bulk upload NEW learner profiles with auto user creation
// ============================================

'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud, X, CheckCircle, AlertCircle, FileText, Download, TrendingUp, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadResult {
  success: boolean;
  upload_summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    learners_created: number;
    learners_failed: number;
  };
  user_creation_summary: {
    profiles_complete: number;
    existing_users: number;
    new_users_created: number;
    user_creation_failed: number;
  };
  created_users: Array<{
    name: string;
    email: string;
    temp_password: string;
  }>;
  errors: Array<{
    row: number;
    email?: string;
    error: string;
  }>;
}

export function BulkUploadProfilesDialog({ onSuccess }: { onSuccess?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  // Download template
  const downloadTemplate = () => {
    try {
      // Create sample data with ALL fields
      const sampleData = [{
        // SECTION 1: REQUIRED - Basic Details
        '* First Name': 'JOHN',
        'Last Name': 'DOE',
        '* Date of Birth': '2005-01-15',
        '* Gender': 'MALE',
        '* Religion': 'Hindu',
        '* Community': 'BC',
        'Caste': 'OBC',
        'Aadhar Number': '123456789012',
        'Blood Group': 'O+',
        'Admission Year': '2024',

        // SECTION 2: REQUIRED - Parent/Guardian Information
        '* Father Name': 'ROBERT DOE',
        'Father Occupation': 'Business',
        '* Father Mobile': '9876543211',
        '* Mother Name': 'MARY DOE',
        'Mother Occupation': 'Teacher',
        '* Mother Mobile': '9876543212',
        'Annual Income': '500000',

        // SECTION 3: REQUIRED - Academic Assignment
        '* Institution ID': 'your-institution-id-here',
        'Degree ID': 'your-degree-id-here',
        '* Department ID': 'your-department-id-here',
        '* Program ID': 'your-program-id-here',
        '* Semester ID': 'your-semester-id-here',
        '* Section ID': 'your-section-id-here',
        'Academic Year ID': 'your-academic-year-id-here',
        'Regulation ID': 'your-regulation-id-here',
        'Batch ID': 'your-batch-id-here',

        // SECTION 4: REQUIRED - Contact Details
        '* Student Mobile': '9876543210',
        '* College Email': 'john.doe@jkkn.ac.in',
        'Personal Email': 'john@gmail.com',

        // SECTION 5: REQUIRED - Address Information
        '* Permanent Address Street': '123 Main Street',
        'Permanent Address Taluk': 'Namakkal',
        '* Permanent Address District': 'Namakkal',
        '* Permanent Address Pin Code': '637001',
        '* Permanent Address State': 'Tamil Nadu',

        // SECTION 6: REQUIRED - Entry Type
        '* Entry Type': 'FIRST YEAR',
        'First Graduate': 'TRUE',

        // SECTION 7: OPTIONAL - Previous Education
        'Last School': 'ABC Higher Secondary School',
        'Board of Study': 'State Board',
        '10th Max Marks': '500',
        '10th Obtained Marks': '450',
        '10th Percentage': '90',
        '12th Group': 'Science',
        '12th Max Marks': '600',
        '12th Obtained Marks': '540',
        '12th Percentage': '90',

        // SECTION 8: OPTIONAL - Entrance Exam Details
        'Medical Cutoff Marks': '',
        'Engineering Cutoff Marks': '175',
        'NEET Roll Number': '',
        'NEET Score': '',
        'Counseling Applied': 'TRUE',
        'Counseling Number': 'TNEA123456',

        // SECTION 9: OPTIONAL - Accommodation Details
        '* Accommodation Type': 'HOSTEL',
        'Hostel Type': 'Boys Hostel A',
        'Food Type': 'VEG',
        'Bus Required': 'FALSE',
        'Bus Route': '',
        'Bus Pickup Location': '',

        // SECTION 10: OPTIONAL - Reference Information
        'Reference Type': 'SOCIAL MEDIA',
        'Reference Name': '',
        'Reference Contact': '',

        // SECTION 11: OPTIONAL - Student Specific
        'Roll Number': '',
        'Register Number': '',
        'Quota': 'GOVERNMENT',
        'Category': 'OBC',
        'Photo URL': ''
      }];

      // Create instructions
      const instructions = [
        { 'A': '📋 BULK UPLOAD PROFILES - COMPREHENSIVE INSTRUCTIONS' },
        { 'A': '' },
        { 'A': '⚠️ CRITICAL NOTES' },
        { 'A': '1. All fields marked with * are REQUIRED' },
        { 'A': '2. College Email MUST end with @jkkn.ac.in' },
        { 'A': '3. All mobile numbers must be 10 digits' },
        { 'A': '4. Use actual UUIDs from your database for all ID fields' },
        { 'A': '5. All uploaded learners will have lifecycle_status = "active"' },
        { 'A': '6. User accounts will be auto-created for complete profiles' },
        { 'A': '7. Temporary passwords will be displayed after upload - SAVE THEM!' },
        { 'A': '' },
        { 'A': '📝 SECTION 1: REQUIRED - Basic Details' },
        { 'A': '• * First Name' },
        { 'A': '• Last Name' },
        { 'A': '• * Date of Birth (YYYY-MM-DD format)' },
        { 'A': '• * Gender (MALE, FEMALE, OTHER)' },
        { 'A': '• * Religion' },
        { 'A': '• * Community (BC, MBC, SC, ST, OC)' },
        { 'A': '• Caste' },
        { 'A': '• Aadhar Number (12 digits)' },
        { 'A': '• Blood Group' },
        { 'A': '• Admission Year' },
        { 'A': '' },
        { 'A': '📝 SECTION 2: REQUIRED - Parent/Guardian Information' },
        { 'A': '• * Father Name' },
        { 'A': '• Father Occupation' },
        { 'A': '• * Father Mobile (10 digits)' },
        { 'A': '• * Mother Name' },
        { 'A': '• Mother Occupation' },
        { 'A': '• * Mother Mobile (10 digits)' },
        { 'A': '• Annual Income' },
        { 'A': '' },
        { 'A': '📝 SECTION 3: REQUIRED - Academic Assignment' },
        { 'A': '• * Institution ID (UUID from database)' },
        { 'A': '• Degree ID (UUID)' },
        { 'A': '• * Department ID (UUID)' },
        { 'A': '• * Program ID (UUID)' },
        { 'A': '• * Semester ID (UUID)' },
        { 'A': '• * Section ID (UUID)' },
        { 'A': '• Academic Year ID (UUID)' },
        { 'A': '• Regulation ID (UUID)' },
        { 'A': '• Batch ID (UUID)' },
        { 'A': '' },
        { 'A': '📝 SECTION 4: REQUIRED - Contact Details' },
        { 'A': '• * Student Mobile (10 digits)' },
        { 'A': '• * College Email (@jkkn.ac.in)' },
        { 'A': '• Personal Email' },
        { 'A': '' },
        { 'A': '📝 SECTION 5: REQUIRED - Address Information' },
        { 'A': '• * Permanent Address Street' },
        { 'A': '• Permanent Address Taluk' },
        { 'A': '• * Permanent Address District' },
        { 'A': '• * Permanent Address Pin Code (6 digits)' },
        { 'A': '• * Permanent Address State' },
        { 'A': '' },
        { 'A': '📝 SECTION 6: REQUIRED - Entry Type' },
        { 'A': '• * Entry Type (FIRST YEAR or LATERAL ENTRY)' },
        { 'A': '• First Graduate (TRUE or FALSE)' },
        { 'A': '' },
        { 'A': '📝 SECTION 7-11: OPTIONAL FIELDS' },
        { 'A': '• Previous Education (School, Board, 10th & 12th Marks)' },
        { 'A': '• Entrance Exams (NEET, Cutoff Marks, Counseling)' },
        { 'A': '• Accommodation (Hostel, Food, Bus Details)' },
        { 'A': '• Reference Information' },
        { 'A': '• Student Specific (Roll Number, Register Number, Quota, Category)' },
        { 'A': '' },
        { 'A': '📤 UPLOAD STEPS' },
        { 'A': 'Step 1: Fill in ALL required (*) fields in the "Template" sheet' },
        { 'A': 'Step 2: Delete the sample row (row 2) or replace with real data' },
        { 'A': 'Step 3: Fill optional fields as needed' },
        { 'A': 'Step 4: Save the file' },
        { 'A': 'Step 5: Upload via the Bulk Upload dialog' },
        { 'A': 'Step 6: Review results and SAVE temporary passwords immediately!' },
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add instructions sheet
      const wsInstructions = XLSX.utils.json_to_sheet(instructions);
      wsInstructions['!cols'] = [{ wch: 80 }];
      XLSX.utils.book_append_sheet(wb, wsInstructions, '📖 Instructions');

      // Add template sheet
      const wsTemplate = XLSX.utils.json_to_sheet(sampleData);
      wsTemplate['!cols'] = [
        { wch: 20 }, // First Name
        { wch: 20 }, // Last Name
        { wch: 15 }, // Mobile
        { wch: 35 }, // College Email
        { wch: 30 }, // Personal Email
        { wch: 15 }, // DOB
        { wch: 10 }, // Gender
        { wch: 12 }, // Blood Group
        { wch: 40 }, // Institution ID
        { wch: 40 }, // Department ID
        { wch: 40 }, // Program ID
        { wch: 40 }, // Semester ID
        { wch: 40 }, // Section ID
        { wch: 50 }, // Photo URL
      ];
      XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

      // Download
      XLSX.writeFile(wb, 'bulk-upload-profiles-template.xlsx');
      toast.success('Template downloaded successfully!');

    } catch (error) {
      console.error('[bulk-upload-profiles] Error generating template:', error);
      toast.error('Failed to generate template');
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx) or CSV file');
      return;
    }

    setSelectedFile(file);
    setResult(null);
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch('/api/learners/bulk-upload-profiles', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data: UploadResult = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.errors?.[0]?.error || 'Upload failed');
      }

      setResult(data);

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
      console.error('[bulk-upload-profiles] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Reset upload
  const resetUpload = () => {
    setSelectedFile(null);
    setResult(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Export created users to Excel
  const exportCreatedUsers = () => {
    if (!result || result.created_users.length === 0) return;

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(result.created_users);
      ws['!cols'] = [
        { wch: 30 }, // Name
        { wch: 35 }, // Email
        { wch: 20 }, // Temp Password
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Created Users');
      XLSX.writeFile(wb, `created-users-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('User credentials exported!');
    } catch (error) {
      console.error('[bulk-upload-profiles] Export error:', error);
      toast.error('Failed to export credentials');
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
      <DialogContent className="sm:max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/50 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                <UploadCloud className="h-5 w-5" />
                Bulk Upload New Learners
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Upload new learners with complete profiles. User accounts will be auto-created.
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
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!selectedFile && !result ? (
            // File Upload Section
            <div className="flex items-center justify-center p-6 md:p-8">
              <div className="flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6 w-full">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={fileInputRef}
                />

                <Alert className="text-left w-full">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Before You Upload</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p className="font-medium">All uploaded learners will be set to ACTIVE status</p>
                    <p className="text-sm">Auto user creation:</p>
                    <ul className="text-sm list-disc list-inside space-y-1 pl-2">
                      <li>System checks if profile is complete</li>
                      <li>Creates user accounts automatically for complete profiles</li>
                      <li>Generates temporary passwords</li>
                      <li>You&apos;ll receive credentials after upload</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                  <UploadCloud className="h-10 w-10 text-primary" />
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Upload Excel File</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a file containing new learner profiles
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
          ) : result ? (
            // Results Section
            <div className="p-4 md:p-6 space-y-4 md:space-y-6">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Learners Created</CardDescription>
                    <CardTitle className="text-2xl md:text-3xl text-green-600">
                      {result.upload_summary.learners_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Out of {result.upload_summary.total_rows} total rows
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>User Accounts Created</CardDescription>
                    <CardTitle className="text-2xl md:text-3xl text-blue-600">
                      {result.user_creation_summary.new_users_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {result.user_creation_summary.profiles_complete} complete profiles
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Created Users */}
              {result.created_users.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Created User Accounts ({result.created_users.length})
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
                    {result.created_users.map((user, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg text-sm bg-green-50 border border-green-200"
                      >
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
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
              {result.errors.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-lg text-red-600">
                    Errors ({result.errors.length})
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                    {result.errors.map((error, index) => (
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
          ) : (
            // File Selected - Ready to Upload
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <FileText className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{selectedFile?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Ready to upload
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetUpload}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {uploading && (
                <div className="space-y-3">
                  <Progress value={uploadProgress} className="h-3" />
                  <p className="text-sm text-center text-muted-foreground flex items-center justify-center gap-2">
                    <TrendingUp className="h-4 w-4 animate-pulse" />
                    Processing {uploadProgress}%...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-4 md:px-6 py-4 border-t bg-muted/50 flex-shrink-0">
          {!result ? (
            <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
              <Button
                variant="outline"
                onClick={resetUpload}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
              >
                {uploading ? (
                  <>
                    <TrendingUp className="mr-2 h-4 w-4 animate-pulse" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Upload & Create Accounts
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button onClick={resetUpload}>
              <UploadCloud className="mr-2 h-4 w-4" />
              Upload Another File
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
