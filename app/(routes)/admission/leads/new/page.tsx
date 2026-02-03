'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useLeadMutations } from '@/hooks/admission';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { AdmissionErrorBoundary } from '@/components/admission';

// Must match LeadSource type from types/admission.ts
const LEAD_SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'education_fair', label: 'Education Fair' },
  { value: 'agent', label: 'Agent/Partner' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'other', label: 'Other' }
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }
];

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  alternate_phone: string;
  date_of_birth: string;
  gender: string;
  address_line1: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  first_touch_source: string;
  notes: string;
}

function NewLeadPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const { createLeadWithProfile } = useLeadMutations();

  // For Super Admins without institution_id, allow them to select an institution
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // Use selected institution for Super Admins, profile's institution for others
  const institutionId = isSuperAdmin && !profile?.institution_id
    ? selectedInstitutionId
    : profile?.institution_id;

  const [formData, setFormData] = useState<FormData>({
    full_name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    date_of_birth: '',
    gender: '',
    address_line1: '',
    city: '',
    state: '',
    country: 'India',
    pincode: '',
    first_touch_source: '',
    notes: ''
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
      newErrors.phone = 'Invalid phone number';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    if (!formData.first_touch_source) {
      newErrors.first_touch_source = 'Lead source is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fill all required fields');
      return;
    }
    if (!institutionId) {
      if (isSuperAdmin && !profile?.institution_id) {
        toast.error('Please select an institution first');
      } else {
        toast.error('Unable to create lead: Institution not configured. Please contact administrator.');
      }
      console.error('[admission/leads] Missing institution_id - profile:', profile);
      return;
    }

    const leadPayload = {
      institution_id: institutionId,
      full_name: formData.full_name.trim(),
      email: formData.email?.trim() || null,
      phone: formData.phone.trim(),
      alternate_phone: formData.alternate_phone?.trim() || null,
      date_of_birth: formData.date_of_birth || null,
      gender: (formData.gender || null) as any,
      address: formData.address_line1?.trim() || null,
      city: formData.city?.trim() || null,
      state: formData.state?.trim() || null,
      pincode: formData.pincode?.trim() || null,
      source: formData.first_touch_source as any,
      notes: formData.notes?.trim() || null
    };

    console.log('[admission/leads] Submitting lead with payload:', leadPayload);

    createLeadWithProfile.mutate(
      leadPayload,
      {
        onSuccess: (lead) => {
          toast.success('Lead created successfully');
          router.push(`/admission/leads/${lead.id}`);
        },
        onError: (error: Error) => {
          const errorMessage = error.message || 'Failed to create lead';
          toast.error(errorMessage);
          console.error('[admission/leads] Failed to create lead:', error);
        }
      }
    );
  };

  return (
    <PermissionGuard module="admission" action="create">
      <ContentLayout title="Add New Lead">
        <div className="space-y-6">
          {/* Breadcrumb */}
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
                <BreadcrumbLink href="/admission/leads">Leads</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New Lead</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Basic Information</CardTitle>
                    <CardDescription>Enter the lead&apos;s contact details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="full_name">
                          Full Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="full_name"
                          value={formData.full_name}
                          onChange={(e) => handleChange('full_name', e.target.value)}
                          placeholder="Enter full name"
                          className={errors.full_name ? 'border-destructive' : ''}
                        />
                        {errors.full_name && (
                          <p className="text-xs text-destructive">{errors.full_name}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange('email', e.target.value)}
                          placeholder="Enter email address"
                          className={errors.email ? 'border-destructive' : ''}
                        />
                        {errors.email && (
                          <p className="text-xs text-destructive">{errors.email}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">
                          Phone <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => handleChange('phone', e.target.value)}
                          placeholder="Enter phone number"
                          className={errors.phone ? 'border-destructive' : ''}
                        />
                        {errors.phone && (
                          <p className="text-xs text-destructive">{errors.phone}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="alternate_phone">Alternate Phone</Label>
                        <Input
                          id="alternate_phone"
                          value={formData.alternate_phone}
                          onChange={(e) => handleChange('alternate_phone', e.target.value)}
                          placeholder="Enter alternate phone"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="date_of_birth">Date of Birth</Label>
                        <Input
                          id="date_of_birth"
                          type="date"
                          value={formData.date_of_birth}
                          onChange={(e) => handleChange('date_of_birth', e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="gender">Gender</Label>
                        <Select
                          value={formData.gender}
                          onValueChange={(value) => handleChange('gender', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            {GENDERS.map((gender) => (
                              <SelectItem key={gender.value} value={gender.value}>
                                {gender.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Address */}
                <Card>
                  <CardHeader>
                    <CardTitle>Address</CardTitle>
                    <CardDescription>Enter the lead&apos;s address details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="address_line1">Address</Label>
                      <Input
                        id="address_line1"
                        value={formData.address_line1}
                        onChange={(e) => handleChange('address_line1', e.target.value)}
                        placeholder="Enter street address"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => handleChange('city', e.target.value)}
                          placeholder="Enter city"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => handleChange('state', e.target.value)}
                          placeholder="Enter state"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => handleChange('country', e.target.value)}
                          placeholder="Enter country"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pincode">Pincode</Label>
                        <Input
                          id="pincode"
                          value={formData.pincode}
                          onChange={(e) => handleChange('pincode', e.target.value)}
                          placeholder="Enter pincode"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      placeholder="Enter any additional notes about this lead..."
                      rows={4}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Institution Selector for Super Admins */}
                {isSuperAdmin && !profile?.institution_id && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Institution</CardTitle>
                      <CardDescription>Select institution for this lead</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Label htmlFor="institution">
                          Institution <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={selectedInstitutionId}
                          onValueChange={setSelectedInstitutionId}
                          disabled={institutionsLoading}
                        >
                          <SelectTrigger className={!selectedInstitutionId ? 'border-amber-500' : ''}>
                            <SelectValue placeholder={institutionsLoading ? 'Loading...' : 'Select institution'} />
                          </SelectTrigger>
                          <SelectContent>
                            {institutions.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {!selectedInstitutionId && (
                          <p className="text-xs text-amber-600">Select an institution to create leads</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Lead Source */}
                <Card>
                  <CardHeader>
                    <CardTitle>Lead Source</CardTitle>
                    <CardDescription>How did this lead find you?</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="first_touch_source">
                        Source <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.first_touch_source}
                        onValueChange={(value) => handleChange('first_touch_source', value)}
                      >
                        <SelectTrigger className={errors.first_touch_source ? 'border-destructive' : ''}>
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_SOURCES.map((source) => (
                            <SelectItem key={source.value} value={source.value}>
                              {source.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.first_touch_source && (
                        <p className="text-xs text-destructive">{errors.first_touch_source}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col gap-3">
                      <Button
                        type="submit"
                        disabled={createLeadWithProfile.isPending}
                        className="w-full"
                      >
                        {createLeadWithProfile.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Create Lead
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        asChild
                      >
                        <Link href="/admission/leads">
                          <ArrowLeft className="h-4 w-4 mr-2" />
                          Cancel
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function NewLeadPage() {
  return (
    <AdmissionErrorBoundary>
      <NewLeadPageContent />
    </AdmissionErrorBoundary>
  );
}
