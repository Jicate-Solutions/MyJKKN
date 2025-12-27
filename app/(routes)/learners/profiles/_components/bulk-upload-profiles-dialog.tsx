// ============================================
// BULK UPLOAD PROFILES DIALOG
// ============================================
// Created: 2025-01-22
// Purpose: Bulk upload NEW learner profiles with auto user creation
// ============================================

'use client';

import { useState, useRef, useEffect } from 'react';
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
  const autoExportedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [autoResetCountdown, setAutoResetCountdown] = useState<number | null>(null);

  // Download template
  const downloadTemplate = () => {
    try {
      // Create sample data with REQUIRED fields first, then OPTIONAL fields
      const sampleData = [{
        // ========================================
        // REQUIRED FIELDS (marked with *)
        // ========================================

        // Basic Details
        '* First Name': 'JOHN',
        'Last Name': 'DOE',
        '* Date of Birth': '2005-01-15',
        '* Gender': 'MALE',
        '* Religion': 'Hindu',
        '* Community': 'BC',

        // Parent/Guardian Information
        '* Father Name': 'ROBERT DOE',
        '* Father Mobile': '9876543211',
        '* Mother Name': 'MARY DOE',
        '* Mother Mobile': '9876543212',

        // Academic Assignment
        '* Institution': 'JKKN College of Engineering and Technology',
        '* Degree': 'B.E',
        '* Department': 'Computer Science and Engineering',
        '* Program': 'CSE',
        '* Semester': 'I Year I Semester',
        '* Section': 'A',

        // Contact Details
        '* Student Mobile': '9876543210',
        '* College Email': 'john.doe@jkkn.ac.in',

        // Address Information
        '* Permanent Address Street': '123 Main Street',
        '* Permanent Address Taluk': 'Namakkal',
        '* Permanent Address District': 'Namakkal',
        '* Permanent Address Pin Code': '637001',
        '* Permanent Address State': 'Tamil Nadu',

        // Entry Type
        '* Entry Type': 'FIRST YEAR',

        // Accommodation
        '* Accommodation Type': 'HOSTEL',

        // ========================================
        // OPTIONAL FIELDS
        // ========================================

        // Basic Details (Optional)
        'Caste': 'OBC',
        'Aadhar Number': '123456789012',
        'Blood Group': 'O+',
        'Admission Year': '2024',

        // Parent/Guardian (Optional)
        'Father Occupation': 'Business',
        'Mother Occupation': 'Teacher',
        'Annual Income': '500000',

        // Academic (Optional)
        'Academic Year': '2024-2025',
        'Regulation': 'R2021',
        'Batch': '2024-2028',

        // Contact (Optional)
        'Personal Email': 'john@gmail.com',

        // Entry Type (Optional)
        'First Graduate': 'TRUE',

        // Previous Education (Optional)
        'Last School': 'ABC Higher Secondary School',
        'Board of Study': 'State Board',
        '10th Max Marks': '500',
        '10th Obtained Marks': '450',
        '10th Percentage': '90',
        '12th Group': 'Science',
        '12th Max Marks': '600',
        '12th Obtained Marks': '540',
        '12th Percentage': '90',

        // Entrance Exam Details (Optional)
        'Medical Cutoff Marks': '',
        'Engineering Cutoff Marks': '175',
        'NEET Roll Number': '',
        'NEET Score': '',
        'Counseling Applied': 'TRUE',
        'Counseling Number': 'TNEA123456',

        // Accommodation Details (Optional)
        'Hostel Type': 'Boys Hostel A',
        'Food Type': 'VEG',
        'Bus Required': 'FALSE',
        'Bus Route': '',
        'Bus Pickup Location': '',

        // Reference Information (Optional)
        'Reference Type': 'SOCIAL MEDIA',
        'Reference Name': '',
        'Reference Contact': '',

        // Student Specific (Optional)
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
        { 'A': '1. Template columns are organized: REQUIRED fields first, then OPTIONAL fields' },
        { 'A': '2. All fields marked with * are REQUIRED and must be filled' },
        { 'A': '3. College Email MUST end with @jkkn.ac.in' },
        { 'A': '4. All mobile numbers must be exactly 10 digits' },
        { 'A': '5. Use EXACT names for academic fields (Institution, Degree, Department, etc.)' },
        { 'A': '6. Dropdown fields are case-INSENSITIVE (Male/MALE/male all work)' },
        { 'A': '7. Invalid dropdown values will be rejected with clear error messages' },
        { 'A': '8. Academic field names are case-INSENSITIVE but must match database values' },
        { 'A': '9. All uploaded learners will have lifecycle_status = "active"' },
        { 'A': '10. User accounts will be auto-created for complete profiles' },
        { 'A': '11. Temporary passwords will be displayed after upload - SAVE THEM!' },
        { 'A': '' },
        { 'A': '📋 TEMPLATE STRUCTURE' },
        { 'A': 'Columns 1-27: REQUIRED fields (marked with *)' },
        { 'A': 'Columns 28+: OPTIONAL fields (can be left blank)' },
        { 'A': '' },
        { 'A': '=====================================' },
        { 'A': 'REQUIRED FIELDS SECTION' },
        { 'A': '=====================================' },
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
        { 'A': '• * Institution (exact name from your system)' },
        { 'A': '• * Degree (see dropdown values below)' },
        { 'A': '• * Department (see dropdown values below)' },
        { 'A': '• * Program (see dropdown values below)' },
        { 'A': '• * Semester (see dropdown values below)' },
        { 'A': '• * Section (see dropdown values below)' },
        { 'A': '• Academic Year (format: YYYY-YYYY)' },
        { 'A': '• Regulation (see dropdown values below)' },
        { 'A': '• Batch (format: YYYY-YYYY)' },
        { 'A': '' },
        { 'A': '📝 SECTION 4: REQUIRED - Contact Details' },
        { 'A': '• * Student Mobile (10 digits)' },
        { 'A': '• * College Email (@jkkn.ac.in)' },
        { 'A': '• Personal Email' },
        { 'A': '' },
        { 'A': '📝 SECTION 5: REQUIRED - Address Information' },
        { 'A': '• * Permanent Address Street' },
        { 'A': '• * Permanent Address Taluk (see dropdown values below)' },
        { 'A': '• * Permanent Address District (see dropdown values below)' },
        { 'A': '• * Permanent Address Pin Code (6 digits)' },
        { 'A': '• * Permanent Address State (Tamil Nadu)' },
        { 'A': '' },
        { 'A': '📝 SECTION 6: REQUIRED - Entry Type' },
        { 'A': '• * Entry Type (FIRST YEAR or LATERAL ENTRY)' },
        { 'A': '• First Graduate (TRUE or FALSE)' },
        { 'A': '' },
        { 'A': '=====================================' },
        { 'A': 'OPTIONAL FIELDS SECTION' },
        { 'A': '=====================================' },
        { 'A': '' },
        { 'A': '📝 OPTIONAL FIELDS (Can be left blank)' },
        { 'A': '• Previous Education (School, Board, 10th & 12th Marks)' },
        { 'A': '• Entrance Exams (NEET, Cutoff Marks, Counseling)' },
        { 'A': '• Accommodation (Hostel, Food, Bus Details)' },
        { 'A': '• Reference Information' },
        { 'A': '• Student Specific (Roll Number, Register Number, Quota, Category)' },
        { 'A': '' },
        { 'A': '📊 DROPDOWN VALUES REFERENCE' },
        { 'A': 'Use these exact values for dropdown fields:' },
        { 'A': '' },
        { 'A': '👤 Gender:' },
        { 'A': '  - MALE' },
        { 'A': '  - FEMALE' },
        { 'A': '  - OTHER' },
        { 'A': '' },
        { 'A': '🕉️ Religion:' },
        { 'A': '  HINDU, CHRISTIAN, MUSLIM, SIKH, BUDDHIST, JAIN, OTHERS' },
        { 'A': '' },
        { 'A': '👥 Community:' },
        { 'A': '  OC, BC, BCM, MBC, DNC, BC-CC, SC, ST, SBC, SC (A)' },
        { 'A': '' },
        { 'A': '🩸 Blood Group:' },
        { 'A': '  A+, A-, B+, B-, AB+, AB-, O+, O-, A1+, A1B' },
        { 'A': '' },
        { 'A': '📚 Entry Type:' },
        { 'A': '  REGULAR, LATERAL, TRANSFER' },
        { 'A': '' },
        { 'A': '🏠 Accommodation Type:' },
        { 'A': '  HOSTEL, DAY SCHOLAR, HOME' },
        { 'A': '' },
        { 'A': '🍽️ Food Type:' },
        { 'A': '  VEG, NON-VEG, VEGAN' },
        { 'A': '' },
        { 'A': '📋 Quota:' },
        { 'A': '  GOVERNMENT, MANAGEMENT' },
        { 'A': '' },
        { 'A': '=====================================' },
        { 'A': 'VALIDATION RULES' },
        { 'A': '=====================================' },
        { 'A': '• Dropdown fields accept any case (Male/MALE/male)' },
        { 'A': '• Invalid values will show error with valid options' },
        { 'A': '• Use exact values from reference section above' },
        { 'A': '' },
        { 'A': '📍 Tamil Nadu Districts:' },
        { 'A': '  - Ariyalur, Chengalpattu, Chennai, Coimbatore, Cuddalore, Dharmapuri' },
        { 'A': '  - Dindigul, Erode, Kallakurichi, Kanchipuram, Kanyakumari, Karur' },
        { 'A': '  - Krishnagiri, Madurai, Mayiladuthurai, Nagapattinam, Namakkal, Nilgiris' },
        { 'A': '  - Perambalur, Pudukkottai, Ramanathapuram, Ranipet, Salem, Sivaganga' },
        { 'A': '  - Tenkasi, Thanjavur, Theni, Thoothukudi, Tiruchirappalli, Tirunelveli' },
        { 'A': '  - Tirupattur, Tiruppur, Tiruvallur, Tiruvannamalai, Tiruvarur, Vellore' },
        { 'A': '  - Viluppuram, Virudhunagar' },
        { 'A': '' },
        { 'A': '🏘️ Common Taluks (by District):' },
        { 'A': 'Namakkal District:' },
        { 'A': '  - Namakkal, Rasipuram, Tiruchengode, Paramathi-Velur' },
        { 'A': 'Salem District:' },
        { 'A': '  - Salem, Attur, Mettur, Omalur, Sankagiri, Vazhapadi, Yercaud, Edappadi' },
        { 'A': 'Erode District:' },
        { 'A': '  - Erode, Gobichettipalayam, Bhavani, Anthiyur, Perundurai, Sathyamangalam' },
        { 'A': 'Coimbatore District:' },
        { 'A': '  - Coimbatore North, Coimbatore South, Pollachi, Valparai, Mettupalayam, Sulur' },
        { 'A': 'Chennai District:' },
        { 'A': '  - Chennai (North), Chennai (Central), Chennai (South)' },
        { 'A': 'Tiruchirappalli District:' },
        { 'A': '  - Tiruchirappalli, Lalgudi, Manapparai, Musiri, Srirangam, Thuraiyur' },
        { 'A': 'Madurai District:' },
        { 'A': '  - Madurai North, Madurai South, Madurai East, Madurai West, Melur, Peraiyur, Vadipatti, Usilampatti' },
        { 'A': 'Note: Use exact taluk name from the dropdown in your application form' },
        { 'A': '' },
        { 'A': '🎓 Academic Fields (use exact names from your institution):' },
        { 'A': '  • Degree: Check your institution\'s degree list (e.g., B.E, B.Tech, M.E, M.Tech)' },
        { 'A': '  • Department: Use full department name (e.g., "Computer Science and Engineering")' },
        { 'A': '  • Program: Use program code or name (e.g., "CSE", "ECE")' },
        { 'A': '  • Semester: Use exact semester name (e.g., "I Year I Semester", "II Year")' },
        { 'A': '  • Section: Use section name (e.g., "A", "B", "Section A")' },
        { 'A': '  • Regulation: Use regulation code (e.g., "R2021", "R2019")' },
        { 'A': '' },
        { 'A': '💡 IMPORTANT NOTES:' },
        { 'A': '  • Academic field names are case-INSENSITIVE (B.E = b.e = B.e)' },
        { 'A': '  • Names must EXACTLY match database values (including spaces)' },
        { 'A': '  • System auto-converts names to database IDs during upload' },
        { 'A': '  • If a name is not found, upload will fail for that row with error message' },
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
    setAutoResetCountdown(null);
    autoExportedRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Auto-reset after successful upload (only if no credentials need to be saved)
  useEffect(() => {
    if (result && result.success) {
      // If no created users (no passwords to save), auto-reset after 8 seconds
      if (result.created_users.length === 0 && result.upload_summary.learners_created === 0) {
        setAutoResetCountdown(8);
      }
      // If users were created with passwords, auto-export credentials for safety
      else if (result.created_users.length > 0 && !autoExportedRef.current) {
        autoExportedRef.current = true;
        // Auto-export credentials to prevent data loss
        setTimeout(() => {
          exportCreatedUsers();
          toast.success('User credentials automatically exported to Excel file!', {
            duration: 5000,
            icon: '💾'
          });
        }, 1500);
      }
    }
  }, [result]);

  // Countdown timer for auto-reset
  useEffect(() => {
    if (autoResetCountdown === null) return;

    if (autoResetCountdown <= 0) {
      resetUpload();
      toast.success('Ready for next upload');
      return;
    }

    const timer = setTimeout(() => {
      setAutoResetCountdown(autoResetCountdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoResetCountdown]);

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

  // Reset when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when dialog closes
      resetUpload();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Click <strong>Upload & Create Accounts</strong> to process the file, or <strong>Clear Selection</strong> to choose a different file.
                </AlertDescription>
              </Alert>

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
                <X className="mr-2 h-4 w-4" />
                Clear Selection
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
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              {autoResetCountdown !== null && (
                <Alert className="py-2 px-3">
                  <AlertDescription className="text-sm flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Auto-resetting in {autoResetCountdown} seconds...
                  </AlertDescription>
                </Alert>
              )}
              <Button onClick={resetUpload} className="sm:ml-auto">
                <UploadCloud className="mr-2 h-4 w-4" />
                Upload Another File
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
