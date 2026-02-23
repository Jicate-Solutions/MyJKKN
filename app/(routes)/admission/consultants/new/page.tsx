'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Save, ArrowLeft, Handshake, Building, Building2, User, Wallet, Globe, Calendar, Camera } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { useQueryClient } from '@tanstack/react-query';
import type { CreateConsultantInput, ConsultantType } from '@/types/education-consultants';
import { createConsultantSchema } from '@/lib/validations/education-consultants';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CONSULTANT_TYPES: { value: ConsultantType; label: string }[] = [
  { value: 'external', label: 'External Consultant' },
  { value: 'internal', label: 'Internal Staff' },
  { value: 'institutional', label: 'Institutional Partner' },
  { value: 'alumni', label: 'Alumni Referrer' },
  { value: 'student', label: 'Student Referrer' }
];

function NewConsultantForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { institutions, selectedInstitutionId } = useUserInstitutionAccess();
  // Multi-institution support: track which institutions this consultant is being registered for
  const [chosenInstitutionIds, setChosenInstitutionIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const toggleInstitution = (id: string) => {
    setChosenInstitutionIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Resolve target institution IDs: single-institution users get theirs automatically,
  // multi-institution users pick from the checkbox list
  const targetInstitutionIds: string[] =
    institutions.length <= 1
      ? (selectedInstitutionId ? [selectedInstitutionId] : [])
      : chosenInstitutionIds;

  const form = useForm<CreateConsultantInput>({
    resolver: zodResolver(createConsultantSchema),
    defaultValues: {
      institution_id: selectedInstitutionId ?? '',
      name: '',
      email: '',
      phone: '',
      alternate_phone: '',
      consultant_type: 'external',
      contact_person: '',
      website: '',
      gst_number: '',
      pan_number: '',
      address: '',
      city: '',
      state: '',
      country: 'India',
      pincode: '',
      bank_name: '',
      bank_account_number: '',
      bank_ifsc: '',
      bank_account_holder: '',
      contract_start_date: '',
      contract_end_date: '',
      notes: '',
      geographic_coverage: [],
      specializations: [],
      programs_handled: [],
      tags: [],
      profile_photo_url: ''
    }
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPG, PNG, and WebP images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }

    // Show local preview immediately
    setProfilePhotoPreview(URL.createObjectURL(file));
    setIsUploadingPhoto(true);
    try {
      const supabase = createClientSupabaseClient();
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `consultant-profiles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('consultant-documents')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('consultant-documents')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10); // 10 years
      if (signedError || !signedData) throw signedError || new Error('Failed to generate URL');

      form.setValue('profile_photo_url', signedData.signedUrl);
      toast.success('Photo uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload photo');
      setProfilePhotoPreview(null);
      form.setValue('profile_photo_url', '');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const onSubmit = async (data: CreateConsultantInput) => {
    if (targetInstitutionIds.length === 0) {
      toast.error('Please select at least one institution.');
      return;
    }

    // Build base DB payload (transform form field names to DB column names)
    const { address, notes, geographic_coverage, specializations, programs_handled, ...rest } = data as any;
    const baseData: Record<string, any> = {
      ...rest,
      ...(address ? { address_line1: address } : {}),
      ...(notes ? { internal_notes: notes } : {}),
      ...(geographic_coverage?.length ? { covered_states: geographic_coverage } : {}),
      ...(specializations?.length ? { specialized_degrees: specializations } : {}),
      ...(programs_handled?.length ? { specialized_programs: programs_handled } : {}),
    };
    delete baseData.institution_id; // set per-institution below

    setIsSubmitting(true);
    try {
      const results = await Promise.all(
        targetInstitutionIds.map(instId =>
          ConsultantService.createConsultant({ ...baseData, institution_id: instId } as CreateConsultantInput)
        )
      );
      toast.success(
        results.length > 1
          ? `Consultant registered across ${results.length} institutions`
          : 'Consultant created successfully'
      );
      queryClient.invalidateQueries({ queryKey: ['consultants'] });
      queryClient.invalidateQueries({ queryKey: ['consultants-summary'] });
      router.push(`/admission/consultants/${results[0].id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create consultant');
    } finally {
      setIsSubmitting(false);
    }
  };

  const consultantType = form.watch('consultant_type');
  const isInstitutional = consultantType === 'institutional';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="business" className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Business
            </TabsTrigger>
            <TabsTrigger value="contract" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Contract
            </TabsTrigger>
            <TabsTrigger value="bank" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Bank Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Basic contact details of the consultant</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Profile Photo Upload */}
                <div className="flex flex-col items-center gap-2 pb-4 border-b">
                  <div className="relative group">
                    <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                      {profilePhotoPreview ? (
                        <img src={profilePhotoPreview} alt="Profile preview" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <label
                      htmlFor="create-profile-photo"
                      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                    >
                      {isUploadingPhoto
                        ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                        : <Camera className="h-6 w-6 text-white" />}
                    </label>
                    <input
                      id="create-profile-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={isUploadingPhoto}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isUploadingPhoto ? 'Uploading…' : 'Click to upload profile photo (JPG, PNG, WebP · max 5 MB)'}
                  </p>
                </div>

                {/* Institution selector — only shown when user has access to multiple institutions */}
                {institutions.length > 1 && (
                  <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Register for Institution(s) *</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {institutions.map(inst => (
                        <label
                          key={inst.institution_id}
                          className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={chosenInstitutionIds.includes(inst.institution_id)}
                            onChange={() => toggleInstitution(inst.institution_id)}
                            className="accent-primary"
                          />
                          <span className="text-sm truncate">{inst.institution_name}</span>
                        </label>
                      ))}
                    </div>
                    {chosenInstitutionIds.length === 0 && (
                      <p className="text-xs text-destructive">Select at least one institution.</p>
                    )}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="consultant_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Consultant Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONSULTANT_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="consultant@example.com" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="+91 98765 43210" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="alternate_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alternate Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+91 98765 43210" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contact_person"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person {isInstitutional && '*'}</FormLabel>
                        <FormControl>
                          <Input placeholder="Primary contact person name" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Primary contact person (especially for institutional partners)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Address Information</CardTitle>
                <CardDescription>Location details for correspondence</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter street address" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="City" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input placeholder="State" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input placeholder="Country" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pincode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pincode</FormLabel>
                        <FormControl>
                          <Input placeholder="123456" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>
                  Company and compliance details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.example.com" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="gst_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GST Number</FormLabel>
                        <FormControl>
                          <Input placeholder="22AAAAA0000A1Z5" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Required for TDS compliance if applicable
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pan_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PAN Number</FormLabel>
                        <FormControl>
                          <Input placeholder="ABCDE1234F" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>
                          Required for payment processing
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Internal Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add any internal notes about this consultant..."
                          className="min-h-[100px]"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormDescription>
                        These notes are only visible to administrators
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contract" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Contract Details</CardTitle>
                <CardDescription>Agreement and validity period</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="contract_start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contract_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contract End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Commission Structure
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Commission rates are configured separately after creating the consultant.
                    You can set up percentage-based, flat rate, tiered, or milestone-based commission
                    structures for this consultant from their detail page.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bank" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Bank Account Details</CardTitle>
                <CardDescription>
                  Payment will be processed to this account. Ensure details are accurate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="bank_account_holder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Holder Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Name as per bank records" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="bank_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., State Bank of India" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bank_ifsc"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IFSC Code</FormLabel>
                        <FormControl>
                          <Input placeholder="SBIN0001234" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="bank_account_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter bank account number" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormDescription>
                        This information is encrypted and stored securely
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between">
          <Link href="/admission/consultants">
            <Button type="button" variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {chosenInstitutionIds.length > 1
              ? `Create Consultant (${chosenInstitutionIds.length} institutions)`
              : 'Create Consultant'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function NewConsultantPage() {
  return (
    <PermissionGuard module="consultants" action="create">
      <ContentLayout title="Add Education Consultant">
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
              <BreadcrumbLink href="/admission/consultants">Consultants</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>New Consultant</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Handshake className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Add New Consultant</h1>
              <p className="text-muted-foreground">
                Register a new education consultant or referral partner
              </p>
            </div>
          </div>
          <NewConsultantForm />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
