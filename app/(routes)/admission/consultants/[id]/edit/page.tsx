'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Save, ArrowLeft, Handshake, Building, Building2, User, Wallet, XCircle, Globe, Calendar, Camera } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateConsultantInput, ConsultantType, ConsultantStatus, ConsultantTier } from '@/types/education-consultants';
import { updateConsultantSchema } from '@/lib/validations/education-consultants';
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

const CONSULTANT_STATUS: { value: ConsultantStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending_verification', label: 'Pending Verification' },
  { value: 'contract_expired', label: 'Contract Expired' }
];

const CONSULTANT_TIERS: { value: ConsultantTier; label: string }[] = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' }
];

function EditConsultantSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function EditConsultantForm() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const consultantId = params.id as string;
  const { profile } = useAuth();
  const { institutions } = useUserInstitutionAccess();
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // UUID validation for Next.js PPR compatibility
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(consultantId);

  // Fetch consultant data
  const { data: consultant, isLoading, error } = useQuery({
    queryKey: ['consultant', consultantId],
    queryFn: () => ConsultantService.getConsultantById(consultantId),
    enabled: !!consultantId && isValidId
  });

  const form = useForm<UpdateConsultantInput>({
    resolver: zodResolver(updateConsultantSchema),
    defaultValues: {
      id: consultantId,
      name: '',
      email: '',
      phone: '',
      alternate_phone: '',
      consultant_type: 'external',
      status: 'active',
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
      tier: 'bronze',
      relationship_score: 50,
      profile_photo_url: ''
    }
  });

  // Populate form when consultant data is loaded
  // Map DB column names to form field names
  useEffect(() => {
    if (consultant) {
      const c = consultant as any;
      form.reset({
        id: c.id,
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        alternate_phone: c.alternate_phone || '',
        consultant_type: c.consultant_type || 'external',
        status: c.status || 'active',
        contact_person: c.contact_person || '',
        website: c.website || '',
        gst_number: c.gst_number || '',
        pan_number: c.pan_number || '',
        // DB column is address_line1, form field is address
        address: c.address_line1 || '',
        city: c.city || '',
        state: c.state || '',
        country: c.country || 'India',
        pincode: c.pincode || '',
        bank_name: c.bank_name || '',
        bank_account_number: c.bank_account_number || '',
        bank_ifsc: c.bank_ifsc || '',
        bank_account_holder: c.bank_account_holder || '',
        contract_start_date: c.contract_start_date || '',
        contract_end_date: c.contract_end_date || '',
        // DB column is internal_notes, form field is notes
        notes: c.internal_notes || '',
        tier: c.tier || 'bronze',
        relationship_score: c.relationship_score || 50,
        profile_photo_url: c.profile_photo_url || ''
      });
      // Pre-populate photo preview from saved URL
      if (c.profile_photo_url) setProfilePhotoPreview(c.profile_photo_url);
    }
  }, [consultant, form]);

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
      setProfilePhotoPreview((consultant as any)?.profile_photo_url || null);
      form.setValue('profile_photo_url', (consultant as any)?.profile_photo_url || '');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const updateMutation = useMutation({
    mutationFn: (data: UpdateConsultantInput) =>
      ConsultantService.updateConsultant(consultantId, data),
    onSuccess: () => {
      toast.success('Consultant updated successfully');
      queryClient.invalidateQueries({ queryKey: ['consultant', consultantId] });
      queryClient.invalidateQueries({ queryKey: ['consultants'] });
      queryClient.invalidateQueries({ queryKey: ['consultants-summary'] });
      router.push(`/admission/consultants/${consultantId}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update consultant');
    }
  });

  const onSubmit = (data: UpdateConsultantInput) => {
    // Transform form field names to match DB column names.
    // status/tier are stripped here — they live on consultant_institutions (junction table),
    // not on education_consultants. Use updateConsultantInstitution to change them.
    const {
      address, notes, geographic_coverage, specializations, programs_handled,
      status: _status, tier: _tier,
      contract_start_date: _csd, contract_end_date: _ced,
      id: _id,
      ...rest
    } = data as any;
    const dbData: Record<string, any> = {
      ...rest,
      id: consultantId,
      // address → address_line1
      ...(address ? { address_line1: address } : {}),
      // notes → internal_notes
      ...(notes ? { internal_notes: notes } : {}),
      // Map array fields to DB columns
      ...(geographic_coverage?.length ? { covered_states: geographic_coverage } : {}),
      ...(specializations?.length ? { specialized_degrees: specializations } : {}),
      ...(programs_handled?.length ? { specialized_programs: programs_handled } : {}),
    };

    updateMutation.mutate(dbData as UpdateConsultantInput);
  };

  if (isLoading) {
    return <EditConsultantSkeleton />;
  }

  if (!isValidId || error || !consultant) {
    return (
      <div className="text-center py-12">
        <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-medium mb-2">Consultant Not Found</h3>
        <p className="text-muted-foreground mb-4">
          The consultant you&apos;re trying to edit doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link href="/admission/consultants">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Consultants
          </Button>
        </Link>
      </div>
    );
  }

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
                        <img src={profilePhotoPreview} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <label
                      htmlFor="edit-profile-photo"
                      className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                    >
                      {isUploadingPhoto
                        ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                        : <Camera className="h-6 w-6 text-white" />}
                    </label>
                    <input
                      id="edit-profile-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={isUploadingPhoto}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isUploadingPhoto ? 'Uploading…' : 'Click to change profile photo (JPG, PNG, WebP · max 5 MB)'}
                  </p>
                </div>

                {/* Read-only institution display — institution cannot be changed after creation */}
                {consultant && (
                  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground font-medium">Institution:</span>
                    <span className="text-sm font-medium">
                      {institutions.find(i => i.institution_id === (consultant as any)?.institution_id)?.institution_name
                        ?? (consultant as any)?.institution_id
                        ?? '—'}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">(cannot be changed after creation)</span>
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
                        <Select onValueChange={field.onChange} value={field.value}>
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
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONSULTANT_STATUS.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
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
                </div>

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

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="tier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Consultant Tier</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select tier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CONSULTANT_TIERS.map((tier) => (
                              <SelectItem key={tier.value} value={tier.value}>
                                {tier.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Performance-based tier (affects commission rates)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="relationship_score"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Relationship Score (0-100)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="50"
                            {...field}
                            value={field.value || 50}
                            onChange={e => field.onChange(parseInt(e.target.value) || 50)}
                          />
                        </FormControl>
                        <FormDescription>
                          Internal relationship strength metric
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
                    Commission rates are configured separately in the Commission Structures section.
                    You can set up percentage-based, flat rate, tiered, or milestone-based commission
                    structures for this consultant after saving.
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
          <Link href={`/admission/consultants/${consultantId}`}>
            <Button type="button" variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function EditConsultantPage() {
  return (
    <PermissionGuard module="consultants" action="edit">
      <ContentLayout title="Edit Consultant">
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
              <BreadcrumbPage>Edit</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Handshake className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Edit Consultant</h1>
              <p className="text-muted-foreground">
                Update consultant information and settings
              </p>
            </div>
          </div>
          <EditConsultantForm />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
