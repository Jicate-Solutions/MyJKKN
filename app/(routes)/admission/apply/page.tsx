'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  Home,
  User,
  Upload,
  ClipboardCheck,
  Save,
  Loader2,
  Building2,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Plus
} from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';

// Application form data structure
interface ApplicationData {
  // Step 1: Personal Information
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  alternatePhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  nationality: string;
  category: string;
  religion: string;
  // Parent/Guardian Info
  fatherName: string;
  fatherOccupation: string;
  fatherPhone: string;
  motherName: string;
  motherOccupation: string;
  motherPhone: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelation: string;
  annualIncome: string;

  // Step 2: Academic History
  tenthBoard: string;
  tenthSchool: string;
  tenthYear: string;
  tenthPercentage: string;
  twelfthBoard: string;
  twelfthSchool: string;
  twelfthYear: string;
  twelfthPercentage: string;
  twelfthStream: string;
  ugDegree: string;
  ugUniversity: string;
  ugYear: string;
  ugPercentage: string;
  entranceExam: string;
  entranceScore: string;
  entranceRank: string;

  // Step 3: Program Selection
  programId: string;
  programName: string;
  institutionId: string;
  institutionName: string;
  academicYear: string;
  admissionType: string;
  preferredShift: string;
  preferredHostel: string;
  transportRequired: string;

  // Step 4: Documents
  documents: {
    photo: { uploaded: boolean; fileName: string };
    signature: { uploaded: boolean; fileName: string };
    tenthMarksheet: { uploaded: boolean; fileName: string };
    twelfthMarksheet: { uploaded: boolean; fileName: string };
    transferCertificate: { uploaded: boolean; fileName: string };
    communityCertificate: { uploaded: boolean; fileName: string };
    aadharCard: { uploaded: boolean; fileName: string };
    entranceScorecard: { uploaded: boolean; fileName: string };
  };

  // Step 5: Declaration
  declarationAccepted: boolean;
  termsAccepted: boolean;

  // Meta
  applicationId: string;
  currentStep: number;
  lastSaved: string;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
}

const STEPS = [
  { id: 1, title: 'Personal Info', icon: User, description: 'Basic details' },
  { id: 2, title: 'Academic History', icon: GraduationCap, description: '10th, 12th, UG details' },
  { id: 3, title: 'Program Selection', icon: Building2, description: 'Choose your program' },
  { id: 4, title: 'Documents', icon: Upload, description: 'Upload required docs' },
  { id: 5, title: 'Review & Submit', icon: ClipboardCheck, description: 'Verify and submit' }
];

const initialData: ApplicationData = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  email: '',
  phone: '',
  alternatePhone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  nationality: 'Indian',
  category: '',
  religion: '',
  fatherName: '',
  fatherOccupation: '',
  fatherPhone: '',
  motherName: '',
  motherOccupation: '',
  motherPhone: '',
  guardianName: '',
  guardianPhone: '',
  guardianRelation: '',
  annualIncome: '',
  tenthBoard: '',
  tenthSchool: '',
  tenthYear: '',
  tenthPercentage: '',
  twelfthBoard: '',
  twelfthSchool: '',
  twelfthYear: '',
  twelfthPercentage: '',
  twelfthStream: '',
  ugDegree: '',
  ugUniversity: '',
  ugYear: '',
  ugPercentage: '',
  entranceExam: '',
  entranceScore: '',
  entranceRank: '',
  programId: '',
  programName: '',
  institutionId: '',
  institutionName: '',
  academicYear: '2026-27',
  admissionType: 'regular',
  preferredShift: 'day',
  preferredHostel: 'no',
  transportRequired: 'no',
  documents: {
    photo: { uploaded: false, fileName: '' },
    signature: { uploaded: false, fileName: '' },
    tenthMarksheet: { uploaded: false, fileName: '' },
    twelfthMarksheet: { uploaded: false, fileName: '' },
    transferCertificate: { uploaded: false, fileName: '' },
    communityCertificate: { uploaded: false, fileName: '' },
    aadharCard: { uploaded: false, fileName: '' },
    entranceScorecard: { uploaded: false, fileName: '' }
  },
  declarationAccepted: false,
  termsAccepted: false,
  applicationId: '',
  currentStep: 1,
  lastSaved: '',
  status: 'draft'
};

// Sample programs data
const PROGRAMS = [
  { id: 'prog-1', name: 'B.Tech Computer Science', institution: 'JKKN College of Engineering', seats: 120, fee: 85000 },
  { id: 'prog-2', name: 'B.Tech ECE', institution: 'JKKN College of Engineering', seats: 60, fee: 80000 },
  { id: 'prog-3', name: 'B.Pharm', institution: 'JKKN College of Pharmacy', seats: 100, fee: 75000 },
  { id: 'prog-4', name: 'M.Pharm', institution: 'JKKN College of Pharmacy', seats: 30, fee: 95000 },
  { id: 'prog-5', name: 'B.Sc Nursing', institution: 'JKKN College of Nursing', seats: 50, fee: 70000 },
  { id: 'prog-6', name: 'MBA', institution: 'JKKN School of Management', seats: 120, fee: 120000 },
  { id: 'prog-7', name: 'Pharm.D', institution: 'JKKN College of Pharmacy', seats: 30, fee: 150000 },
  { id: 'prog-8', name: 'M.Tech AI', institution: 'JKKN College of Engineering', seats: 18, fee: 110000 }
];

const INSTITUTIONS = [
  { id: 'inst-1', name: 'JKKN College of Engineering' },
  { id: 'inst-2', name: 'JKKN College of Pharmacy' },
  { id: 'inst-3', name: 'JKKN College of Nursing' },
  { id: 'inst-4', name: 'JKKN School of Management' },
  { id: 'inst-5', name: 'JKKN Arts and Science College' }
];

function ApplicationPortalPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ApplicationData>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSavedMessage, setShowSavedMessage] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedAppId, setSubmittedAppId] = useState('');

  // Load saved application on mount
  useEffect(() => {
    const savedData = localStorage.getItem('jkkn_application_draft');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setFormData(parsed);
        setCurrentStep(parsed.currentStep || 1);
      } catch {
        // Invalid data, use initial
      }
    }

    // Check for resume token in URL
    const token = searchParams.get('token');
    if (token) {
      // In production, fetch application by token from API
    }
  }, [searchParams]);

  // Auto-save on form change (skip if already submitted)
  useEffect(() => {
    if (isSubmitted) return;
    const saveTimer = setTimeout(() => {
      if (formData.firstName || formData.email) {
        saveToLocalStorage();
      }
    }, 2000);

    return () => clearTimeout(saveTimer);
  }, [formData, isSubmitted]);

  const saveToLocalStorage = () => {
    const dataToSave = {
      ...formData,
      currentStep,
      lastSaved: new Date().toISOString()
    };
    localStorage.setItem('jkkn_application_draft', JSON.stringify(dataToSave));
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    saveToLocalStorage();

    // Simulate API save
    await new Promise(resolve => setTimeout(resolve, 500));

    setIsSaving(false);
    toast.success('Draft saved successfully');
    setShowSavedMessage(true);
    setTimeout(() => setShowSavedMessage(false), 3000);
  };

  const updateField = (field: keyof ApplicationData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.firstName) newErrors.firstName = 'First name is required';
      if (!formData.lastName) newErrors.lastName = 'Last name is required';
      if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
      if (!formData.gender) newErrors.gender = 'Gender is required';
      if (!formData.email) newErrors.email = 'Email is required';
      if (!formData.phone) newErrors.phone = 'Phone number is required';
      if (formData.phone && !/^\d{10}$/.test(formData.phone)) {
        newErrors.phone = 'Enter valid 10-digit phone number';
      }
      if (!formData.fatherName) newErrors.fatherName = 'Father name is required';
    }

    if (step === 2) {
      if (!formData.tenthBoard) newErrors.tenthBoard = '10th board is required';
      if (!formData.tenthYear) newErrors.tenthYear = '10th year is required';
      if (!formData.tenthPercentage) newErrors.tenthPercentage = '10th percentage is required';
      if (!formData.twelfthBoard) newErrors.twelfthBoard = '12th board is required';
      if (!formData.twelfthYear) newErrors.twelfthYear = '12th year is required';
      if (!formData.twelfthPercentage) newErrors.twelfthPercentage = '12th percentage is required';
    }

    if (step === 3) {
      if (!formData.programId) newErrors.programId = 'Please select a program';
    }

    if (step === 5) {
      if (!formData.declarationAccepted) newErrors.declarationAccepted = 'You must accept the declaration';
      if (!formData.termsAccepted) newErrors.termsAccepted = 'You must accept the terms';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      const nextStep = Math.min(currentStep + 1, STEPS.length);
      setCurrentStep(nextStep);
      setFormData(prev => ({ ...prev, currentStep: nextStep }));
      window.scrollTo(0, 0);
    }
  };

  const handlePrevious = () => {
    const prevStep = Math.max(currentStep - 1, 1);
    setCurrentStep(prevStep);
    setFormData(prev => ({ ...prev, currentStep: prevStep }));
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    if (!validateStep(5)) return;

    setIsSaving(true);

    // Simulate submission
    await new Promise(resolve => setTimeout(resolve, 1500));

    const appId = `APP-${Date.now().toString(36).toUpperCase()}`;
    const finalData = {
      ...formData,
      status: 'submitted' as const,
      applicationId: appId
    };

    setFormData(finalData);
    localStorage.removeItem('jkkn_application_draft');
    setIsSaving(false);
    setSubmittedAppId(appId);
    setIsSubmitted(true);
    window.scrollTo(0, 0);

    toast.success(`Application submitted successfully!`);
  };

  const handleBackToHome = () => {
    setFormData({ ...initialData });
    setCurrentStep(1);
    setErrors({});
    setIsSubmitted(false);
    setSubmittedAppId('');
    localStorage.removeItem('jkkn_application_draft');
    router.push('/admission/dashboard');
  };

  const handleStartNewApplication = () => {
    setFormData({ ...initialData });
    setCurrentStep(1);
    setErrors({});
    setIsSubmitted(false);
    setSubmittedAppId('');
    localStorage.removeItem('jkkn_application_draft');
    window.scrollTo(0, 0);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleDocumentUpload = (docType: keyof ApplicationData['documents']) => {
    // Simulate file upload
    const fileName = `${docType}_${Date.now()}.pdf`;
    setFormData(prev => ({
      ...prev,
      documents: {
        ...prev.documents,
        [docType]: { uploaded: true, fileName }
      }
    }));
    toast.success('Document uploaded successfully');
  };

  const progress = (currentStep / STEPS.length) * 100;

  const renderSuccessView = () => (
    <div className="max-w-2xl mx-auto">
      <Card className="border-green-200 dark:border-green-900">
        <CardContent className="pt-8 pb-8 text-center space-y-6">
          {/* Success icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-950/40 rounded-full flex items-center justify-center">
              <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-green-800 dark:text-green-200">
              Application Submitted Successfully!
            </h2>
            <p className="text-muted-foreground">
              Your application has been received and is under review.
            </p>
          </div>

          {/* Application details */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Application ID</span>
              <span className="font-semibold">{submittedAppId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Applicant</span>
              <span className="font-medium">{formData.firstName} {formData.lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Program</span>
              <span className="font-medium">{formData.programName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Institution</span>
              <span className="font-medium">{formData.institutionName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300">
                Submitted
              </Badge>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            A confirmation email has been sent to <span className="font-medium">{formData.email}</span>.
            You can track your application status using the Application ID above.
          </p>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
              <Download className="h-4 w-4" />
              Download as PDF
            </Button>
            <Button onClick={handleBackToHome} className="gap-2 bg-green-600 hover:bg-green-700">
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
          </div>

          <Separator />

          <Button variant="ghost" onClick={handleStartNewApplication} className="gap-2 text-muted-foreground">
            <Plus className="h-4 w-4" />
            Start New Application
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                currentStep > step.id
                  ? 'bg-green-500 border-green-500 text-white'
                  : currentStep === step.id
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-muted border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {currentStep > step.id ? (
                <Check className="h-5 w-5" />
              ) : (
                <step.icon className="h-5 w-5" />
              )}
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`hidden sm:block w-12 md:w-24 h-1 mx-2 rounded ${
                  currentStep > step.id ? 'bg-green-500' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs sm:text-sm">
        {STEPS.map(step => (
          <div
            key={step.id}
            className={`text-center w-20 ${
              currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            <div className="font-medium hidden sm:block">{step.title}</div>
            <div className="text-xs text-muted-foreground hidden md:block">{step.description}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Personal Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={formData.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              placeholder="Enter first name"
              className={errors.firstName ? 'border-red-500' : ''}
            />
            {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={formData.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              placeholder="Enter last name"
              className={errors.lastName ? 'border-red-500' : ''}
            />
            {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
          </div>
          <div>
            <Label htmlFor="dateOfBirth">Date of Birth *</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => updateField('dateOfBirth', e.target.value)}
              className={errors.dateOfBirth ? 'border-red-500' : ''}
            />
            {errors.dateOfBirth && <p className="text-xs text-red-500 mt-1">{errors.dateOfBirth}</p>}
          </div>
          <div>
            <Label htmlFor="gender">Gender *</Label>
            <Select value={formData.gender} onValueChange={(v) => updateField('gender', v)}>
              <SelectTrigger className={errors.gender ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.gender && <p className="text-xs text-red-500 mt-1">{errors.gender}</p>}
          </div>
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="email@example.com"
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="10-digit mobile number"
              maxLength={10}
              className={errors.phone ? 'border-red-500' : ''}
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={formData.category} onValueChange={(v) => updateField('category', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="obc">OBC</SelectItem>
                <SelectItem value="sc">SC</SelectItem>
                <SelectItem value="st">ST</SelectItem>
                <SelectItem value="ews">EWS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="nationality">Nationality</Label>
            <Select value={formData.nationality} onValueChange={(v) => updateField('nationality', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select nationality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Indian">Indian</SelectItem>
                <SelectItem value="NRI">NRI</SelectItem>
                <SelectItem value="Foreign">Foreign National</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Address
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Street address, door number"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => updateField('city', e.target.value)}
              placeholder="Enter city"
            />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              value={formData.state}
              onChange={(e) => updateField('state', e.target.value)}
              placeholder="Enter state"
            />
          </div>
          <div>
            <Label htmlFor="pincode">Pincode</Label>
            <Input
              id="pincode"
              value={formData.pincode}
              onChange={(e) => updateField('pincode', e.target.value)}
              placeholder="6-digit pincode"
              maxLength={6}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Parent/Guardian Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fatherName">Father&apos;s Name *</Label>
            <Input
              id="fatherName"
              value={formData.fatherName}
              onChange={(e) => updateField('fatherName', e.target.value)}
              placeholder="Enter father's name"
              className={errors.fatherName ? 'border-red-500' : ''}
            />
            {errors.fatherName && <p className="text-xs text-red-500 mt-1">{errors.fatherName}</p>}
          </div>
          <div>
            <Label htmlFor="fatherPhone">Father&apos;s Phone</Label>
            <Input
              id="fatherPhone"
              value={formData.fatherPhone}
              onChange={(e) => updateField('fatherPhone', e.target.value)}
              placeholder="10-digit mobile number"
              maxLength={10}
            />
          </div>
          <div>
            <Label htmlFor="fatherOccupation">Father&apos;s Occupation</Label>
            <Input
              id="fatherOccupation"
              value={formData.fatherOccupation}
              onChange={(e) => updateField('fatherOccupation', e.target.value)}
              placeholder="Enter occupation"
            />
          </div>
          <div>
            <Label htmlFor="motherName">Mother&apos;s Name</Label>
            <Input
              id="motherName"
              value={formData.motherName}
              onChange={(e) => updateField('motherName', e.target.value)}
              placeholder="Enter mother's name"
            />
          </div>
          <div>
            <Label htmlFor="motherPhone">Mother&apos;s Phone</Label>
            <Input
              id="motherPhone"
              value={formData.motherPhone}
              onChange={(e) => updateField('motherPhone', e.target.value)}
              placeholder="10-digit mobile number"
              maxLength={10}
            />
          </div>
          <div>
            <Label htmlFor="annualIncome">Annual Family Income</Label>
            <Select value={formData.annualIncome} onValueChange={(v) => updateField('annualIncome', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select income range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="below-1L">Below 1 Lakh</SelectItem>
                <SelectItem value="1L-3L">1-3 Lakhs</SelectItem>
                <SelectItem value="3L-5L">3-5 Lakhs</SelectItem>
                <SelectItem value="5L-8L">5-8 Lakhs</SelectItem>
                <SelectItem value="8L-12L">8-12 Lakhs</SelectItem>
                <SelectItem value="above-12L">Above 12 Lakhs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          10th Standard Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tenthBoard">Board *</Label>
            <Select value={formData.tenthBoard} onValueChange={(v) => updateField('tenthBoard', v)}>
              <SelectTrigger className={errors.tenthBoard ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select board" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cbse">CBSE</SelectItem>
                <SelectItem value="icse">ICSE</SelectItem>
                <SelectItem value="state">State Board</SelectItem>
                <SelectItem value="ib">IB</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.tenthBoard && <p className="text-xs text-red-500 mt-1">{errors.tenthBoard}</p>}
          </div>
          <div>
            <Label htmlFor="tenthSchool">School Name</Label>
            <Input
              id="tenthSchool"
              value={formData.tenthSchool}
              onChange={(e) => updateField('tenthSchool', e.target.value)}
              placeholder="Enter school name"
            />
          </div>
          <div>
            <Label htmlFor="tenthYear">Year of Passing *</Label>
            <Select value={formData.tenthYear} onValueChange={(v) => updateField('tenthYear', v)}>
              <SelectTrigger className={errors.tenthYear ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 15 }, (_, i) => 2026 - i).map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tenthYear && <p className="text-xs text-red-500 mt-1">{errors.tenthYear}</p>}
          </div>
          <div>
            <Label htmlFor="tenthPercentage">Percentage/CGPA *</Label>
            <Input
              id="tenthPercentage"
              value={formData.tenthPercentage}
              onChange={(e) => updateField('tenthPercentage', e.target.value)}
              placeholder="e.g., 85.5 or 8.5"
              className={errors.tenthPercentage ? 'border-red-500' : ''}
            />
            {errors.tenthPercentage && <p className="text-xs text-red-500 mt-1">{errors.tenthPercentage}</p>}
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          12th Standard Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="twelfthBoard">Board *</Label>
            <Select value={formData.twelfthBoard} onValueChange={(v) => updateField('twelfthBoard', v)}>
              <SelectTrigger className={errors.twelfthBoard ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select board" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cbse">CBSE</SelectItem>
                <SelectItem value="icse">ISC</SelectItem>
                <SelectItem value="state">State Board</SelectItem>
                <SelectItem value="ib">IB</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.twelfthBoard && <p className="text-xs text-red-500 mt-1">{errors.twelfthBoard}</p>}
          </div>
          <div>
            <Label htmlFor="twelfthSchool">School Name</Label>
            <Input
              id="twelfthSchool"
              value={formData.twelfthSchool}
              onChange={(e) => updateField('twelfthSchool', e.target.value)}
              placeholder="Enter school name"
            />
          </div>
          <div>
            <Label htmlFor="twelfthYear">Year of Passing *</Label>
            <Select value={formData.twelfthYear} onValueChange={(v) => updateField('twelfthYear', v)}>
              <SelectTrigger className={errors.twelfthYear ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => 2026 - i).map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.twelfthYear && <p className="text-xs text-red-500 mt-1">{errors.twelfthYear}</p>}
          </div>
          <div>
            <Label htmlFor="twelfthPercentage">Percentage/CGPA *</Label>
            <Input
              id="twelfthPercentage"
              value={formData.twelfthPercentage}
              onChange={(e) => updateField('twelfthPercentage', e.target.value)}
              placeholder="e.g., 85.5 or 8.5"
              className={errors.twelfthPercentage ? 'border-red-500' : ''}
            />
            {errors.twelfthPercentage && <p className="text-xs text-red-500 mt-1">{errors.twelfthPercentage}</p>}
          </div>
          <div>
            <Label htmlFor="twelfthStream">Stream</Label>
            <Select value={formData.twelfthStream} onValueChange={(v) => updateField('twelfthStream', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select stream" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="science-pcm">Science (PCM)</SelectItem>
                <SelectItem value="science-pcb">Science (PCB)</SelectItem>
                <SelectItem value="commerce">Commerce</SelectItem>
                <SelectItem value="arts">Arts/Humanities</SelectItem>
                <SelectItem value="vocational">Vocational</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Undergraduate Details (if applicable)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ugDegree">Degree</Label>
            <Input
              id="ugDegree"
              value={formData.ugDegree}
              onChange={(e) => updateField('ugDegree', e.target.value)}
              placeholder="e.g., B.Sc, B.Com, B.Tech"
            />
          </div>
          <div>
            <Label htmlFor="ugUniversity">University</Label>
            <Input
              id="ugUniversity"
              value={formData.ugUniversity}
              onChange={(e) => updateField('ugUniversity', e.target.value)}
              placeholder="Enter university name"
            />
          </div>
          <div>
            <Label htmlFor="ugYear">Year of Passing</Label>
            <Select value={formData.ugYear} onValueChange={(v) => updateField('ugYear', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => 2026 - i).map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ugPercentage">Percentage/CGPA</Label>
            <Input
              id="ugPercentage"
              value={formData.ugPercentage}
              onChange={(e) => updateField('ugPercentage', e.target.value)}
              placeholder="e.g., 75.5 or 7.5"
            />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Entrance Exam Details (if applicable)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="entranceExam">Entrance Exam</Label>
            <Select value={formData.entranceExam} onValueChange={(v) => updateField('entranceExam', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select exam" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jee-main">JEE Main</SelectItem>
                <SelectItem value="jee-advanced">JEE Advanced</SelectItem>
                <SelectItem value="neet">NEET</SelectItem>
                <SelectItem value="cat">CAT</SelectItem>
                <SelectItem value="mat">MAT</SelectItem>
                <SelectItem value="gpat">GPAT</SelectItem>
                <SelectItem value="tnea">TNEA</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="entranceScore">Score/Percentile</Label>
            <Input
              id="entranceScore"
              value={formData.entranceScore}
              onChange={(e) => updateField('entranceScore', e.target.value)}
              placeholder="Enter score"
            />
          </div>
          <div>
            <Label htmlFor="entranceRank">Rank (if applicable)</Label>
            <Input
              id="entranceRank"
              value={formData.entranceRank}
              onChange={(e) => updateField('entranceRank', e.target.value)}
              placeholder="Enter rank"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Select Your Program
        </h3>

        <div className="grid gap-4">
          {PROGRAMS.map(program => (
            <div
              key={program.id}
              onClick={() => {
                updateField('programId', program.id);
                updateField('programName', program.name);
                updateField('institutionName', program.institution);
              }}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                formData.programId === program.id
                  ? 'border-primary bg-primary/5 ring-2 ring-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold">{program.name}</h4>
                  <p className="text-sm text-muted-foreground">{program.institution}</p>
                </div>
                <div className="text-right">
                  <Badge variant={formData.programId === program.id ? 'default' : 'secondary'}>
                    {program.seats} seats
                  </Badge>
                  <p className="text-sm font-medium mt-1">Rs. {program.fee.toLocaleString()}/year</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        {errors.programId && <p className="text-sm text-red-500 mt-2">{errors.programId}</p>}
      </div>

      <Separator />

      <div>
        <h3 className="text-lg font-semibold mb-4">Additional Preferences</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="admissionType">Admission Type</Label>
            <Select value={formData.admissionType} onValueChange={(v) => updateField('admissionType', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="management">Management Quota</SelectItem>
                <SelectItem value="nri">NRI Quota</SelectItem>
                <SelectItem value="lateral">Lateral Entry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="academicYear">Academic Year</Label>
            <Select value={formData.academicYear} onValueChange={(v) => updateField('academicYear', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026-27">2026-27</SelectItem>
                <SelectItem value="2027-28">2027-28</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="preferredHostel">Hostel Required?</Label>
            <Select value={formData.preferredHostel} onValueChange={(v) => updateField('preferredHostel', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes, I need hostel</SelectItem>
                <SelectItem value="no">No, I will stay outside</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="transportRequired">Transport Required?</Label>
            <Select value={formData.transportRequired} onValueChange={(v) => updateField('transportRequired', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes, I need transport</SelectItem>
                <SelectItem value="no">No, I have my own transport</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => {
    const docList = [
      { key: 'photo', label: 'Passport Photo', required: true },
      { key: 'signature', label: 'Signature', required: true },
      { key: 'tenthMarksheet', label: '10th Marksheet', required: true },
      { key: 'twelfthMarksheet', label: '12th Marksheet', required: true },
      { key: 'transferCertificate', label: 'Transfer Certificate', required: false },
      { key: 'communityCertificate', label: 'Community Certificate', required: false },
      { key: 'aadharCard', label: 'Aadhar Card', required: true },
      { key: 'entranceScorecard', label: 'Entrance Exam Scorecard', required: false }
    ];

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Required Documents
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Upload clear scanned copies or photos of your documents. Accepted formats: PDF, JPG, PNG (Max 5MB each)
          </p>

          <div className="grid gap-4">
            {docList.map(doc => {
              const docData = formData.documents[doc.key as keyof ApplicationData['documents']];
              return (
                <div
                  key={doc.key}
                  className={`p-4 border rounded-lg ${docData.uploaded ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900' : ''}`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {docData.uploaded ? (
                        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                          <Check className="h-5 w-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">
                          {doc.label}
                          {doc.required && <span className="text-red-500 ml-1">*</span>}
                        </p>
                        {docData.uploaded && (
                          <p className="text-xs text-muted-foreground">{docData.fileName}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant={docData.uploaded ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => handleDocumentUpload(doc.key as keyof ApplicationData['documents'])}
                    >
                      {docData.uploaded ? 'Replace' : 'Upload'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Document Guidelines</p>
              <ul className="text-amber-700 dark:text-amber-300 list-disc list-inside mt-1 space-y-1">
                <li>Photo should be recent passport size with white background</li>
                <li>All documents should be clearly readable</li>
                <li>PDF format preferred for marksheets</li>
                <li>You can upload remaining documents later before verification</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Review Your Application
        </h3>

        <div className="space-y-4">
          {/* Personal Info Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <p><span className="text-muted-foreground">Name:</span> {formData.firstName} {formData.lastName}</p>
                <p><span className="text-muted-foreground">DOB:</span> {formData.dateOfBirth}</p>
                <p><span className="text-muted-foreground">Email:</span> {formData.email}</p>
                <p><span className="text-muted-foreground">Phone:</span> {formData.phone}</p>
                <p><span className="text-muted-foreground">Category:</span> {formData.category || 'Not specified'}</p>
                <p><span className="text-muted-foreground">Father:</span> {formData.fatherName}</p>
              </div>
            </CardContent>
          </Card>

          {/* Academic Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Academic Details
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="grid grid-cols-2 gap-2">
                <p><span className="text-muted-foreground">10th:</span> {formData.tenthBoard} - {formData.tenthPercentage}% ({formData.tenthYear})</p>
                <p><span className="text-muted-foreground">12th:</span> {formData.twelfthBoard} - {formData.twelfthPercentage}% ({formData.twelfthYear})</p>
                {formData.ugDegree && (
                  <p><span className="text-muted-foreground">UG:</span> {formData.ugDegree} - {formData.ugPercentage}%</p>
                )}
                {formData.entranceExam && (
                  <p><span className="text-muted-foreground">Entrance:</span> {formData.entranceExam} - {formData.entranceScore}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Program Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Program Selection
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{formData.programName}</p>
              <p className="text-muted-foreground">{formData.institutionName}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <p><span className="text-muted-foreground">Year:</span> {formData.academicYear}</p>
                <p><span className="text-muted-foreground">Type:</span> {formData.admissionType}</p>
                <p><span className="text-muted-foreground">Hostel:</span> {formData.preferredHostel === 'yes' ? 'Required' : 'Not required'}</p>
                <p><span className="text-muted-foreground">Transport:</span> {formData.transportRequired === 'yes' ? 'Required' : 'Not required'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Documents Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(formData.documents).map(([key, value]) => (
                  <Badge key={key} variant={value.uploaded ? 'default' : 'secondary'}>
                    {value.uploaded ? <Check className="h-3 w-3 mr-1" /> : null}
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Declaration</h3>

        <div className="flex items-start space-x-3">
          <Checkbox
            id="declaration"
            checked={formData.declarationAccepted}
            onCheckedChange={(checked) => updateField('declarationAccepted', checked === true)}
          />
          <Label htmlFor="declaration" className="text-sm leading-relaxed cursor-pointer">
            I hereby declare that all the information provided by me in this application is true and correct to the best of my knowledge. I understand that any false information may result in cancellation of my admission.
          </Label>
        </div>
        {errors.declarationAccepted && <p className="text-xs text-red-500">{errors.declarationAccepted}</p>}

        <div className="flex items-start space-x-3">
          <Checkbox
            id="terms"
            checked={formData.termsAccepted}
            onCheckedChange={(checked) => updateField('termsAccepted', checked === true)}
          />
          <Label htmlFor="terms" className="text-sm leading-relaxed cursor-pointer">
            I agree to the <a href="#" className="text-primary underline">Terms and Conditions</a> and <a href="#" className="text-primary underline">Privacy Policy</a> of JKKN Educational Institutions.
          </Label>
        </div>
        {errors.termsAccepted && <p className="text-xs text-red-500">{errors.termsAccepted}</p>}
      </div>
    </div>
  );

  return (
    <ContentLayout title="Apply">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Apply</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-green-800 dark:text-green-200">
            JKKN Educational Institutions
          </h1>
          <p className="text-muted-foreground mt-2">Online Application Portal - Academic Year 2026-27</p>
        </div>

        {isSubmitted ? (
          /* Success view after submission */
          renderSuccessView()
        ) : (
          <>
            {/* Progress bar */}
            <div className="mb-2">
              <Progress value={progress} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground text-right mb-4">
              Step {currentStep} of {STEPS.length} ({Math.round(progress)}% complete)
            </p>

            {/* Step indicator */}
            {renderStepIndicator()}

            {/* Main content */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
                    <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
                  </div>
                  {showSavedMessage && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300">
                      <Check className="h-3 w-3 mr-1" /> Saved
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
                {currentStep === 4 && renderStep4()}
                {currentStep === 5 && renderStep5()}
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-6">
                <div className="flex gap-2">
                  {currentStep > 1 && (
                    <Button variant="outline" onClick={handlePrevious}>
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save Draft
                  </Button>
                  {currentStep < STEPS.length ? (
                    <Button onClick={handleNext}>
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={handleSubmit} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                      {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                      Submit Application
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>

            {/* Last saved info */}
            {formData.lastSaved && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Last saved: {format(new Date(formData.lastSaved), 'dd MMM yyyy, hh:mm a')}
              </p>
            )}
          </>
        )}

        {/* Help section */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Need help? Contact our admission helpline:
          </p>
          <div className="flex justify-center gap-4 mt-2">
            <a href="tel:+914162226483" className="flex items-center gap-1 text-sm text-primary">
              <Phone className="h-4 w-4" /> +91 4162-226483
            </a>
            <a href="mailto:admissions@jkkn.ac.in" className="flex items-center gap-1 text-sm text-primary">
              <Mail className="h-4 w-4" /> admissions@jkkn.ac.in
            </a>
          </div>
        </div>
      </div>
      </div>
      </div>
    </ContentLayout>
  );
}

export default function ApplicationPortalPage() {
  return (
    <AdmissionErrorBoundary>
      <ApplicationPortalPageContent />
    </AdmissionErrorBoundary>
  );
}
