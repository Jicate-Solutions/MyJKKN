'use client';

// app/(routes)/cdc/internships/new/page.tsx
// CDC Sprint 4 — Create a new corporate internship assignment

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Save, Calendar as CalendarIcon, Upload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'react-hot-toast';
import { CdcInternshipService } from '@/lib/services/cdc/internship-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useLearnersForPicker, useStaffForPicker } from '@/hooks/cdc/use-cdc-pickers';
import { useAuth } from '@/hooks/use-auth';

interface Cycle { id: string; cycle_name: string; start_date: string; end_date: string; }
interface Site  { id: string; site_name: string; city: string | null; state: string | null; }

// Placeholder for the form's initial render only. The authoritative default is
// the cdc.min_attendance_pct_for_internship_certificate policy: it is fetched on
// mount (see useEffect below) and the service overrides any omitted value at
// create time. This literal is never the source of truth, only a first-paint value.
const DEFAULT_REQUIRED_ATTENDANCE_PCT = 75;

export default function NewCdcInternshipPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { data: learnerOptions = [], isLoading: learnersLoading } = useLearnersForPicker();
  const { data: staffOptions = [], isLoading: staffLoading } = useStaffForPicker();
  const { profile } = useAuth();

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [formData, setFormData] = useState({
    learner_id: '',
    site_id: '',
    facilitator_id: '',
    cycle_id: '',
    rotation_start_date: '',
    rotation_end_date: '',
    required_attendance_pct: DEFAULT_REQUIRED_ATTENDANCE_PCT,
    department_rotation: '',
    // BUG-004040: paid/unpaid + stipend amount
    is_paid: false,
    stipend_amount: '' as string, // kept as string for the numeric input; parsed at submit
    // BUG-004087: optional offer-letter document URL
    offer_letter_url: '' as string,
  });
  // BUG-004087: tracks the offer-letter upload-in-flight state for the field UI.
  const [uploadingOffer, setUploadingOffer] = useState(false);
  // Institution comes from the logged-in user's session profile (useAuth),
  // NOT a network fetch. This REPLACES a previous fetch('/api/users/profile')
  // call to a route that does not exist: it 404'd, the failure was swallowed by
  // an empty catch{}, institutionId stayed '', and the required Cycle/Site
  // pickers rendered permanently empty — so a coordinator could never create a
  // corporate internship.
  const institutionId = profile?.institution_id ?? '';
  const [loadError, setLoadError] = useState<string | null>(null);

  // Seed the required-attendance default from the policy (global row) once.
  useEffect(() => {
    CdcInternshipService.getDefaultRequiredAttendancePct()
      .then(pct => setFormData(p => ({ ...p, required_attendance_pct: pct })))
      .catch(() => { /* DEFAULT_REQUIRED_ATTENDANCE_PCT literal is already seeded */ });
  }, []);

  // Load cycles + sites once the session profile resolves an institution.
  // Failures are surfaced (no longer silent) so an empty picker is never
  // mistaken for "nothing configured".
  useEffect(() => {
    if (!profile) return; // auth still resolving — wait for it
    if (!institutionId) {
      setLoadError(
        'Could not determine your institution. Ask your administrator to set your institution before creating an internship.'
      );
      return;
    }
    setLoadError(null);
    Promise.all([
      CdcInternshipService.getInternshipCycles(institutionId),
      CdcInternshipService.getCorporateSites(institutionId),
    ])
      .then(([c, s]) => {
        setCycles(c);
        setSites(s);
      })
      .catch(e =>
        setLoadError(e instanceof Error ? e.message : 'Failed to load internship cycles and sites.')
      );
  }, [profile, institutionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.learner_id ||
      !formData.site_id ||
      !formData.facilitator_id ||
      !formData.cycle_id ||
      !formData.rotation_start_date ||
      !formData.rotation_end_date
    ) {
      return;
    }
    // BUG-004040: stipend is only meaningful for paid internships. Parse the
    // numeric input; an empty/invalid value means "unspecified" (null).
    const parsedStipend =
      formData.is_paid && formData.stipend_amount.trim() !== ''
        ? Number(formData.stipend_amount)
        : null;

    // Submit via the create API route so the new paid/stipend columns are
    // persisted (BUG-004040). The route validates role + required fields and
    // forces stipend_amount to null when is_paid is false.
    setLoading(true);
    try {
      const res = await fetch('/api/cdc/internships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learner_id: formData.learner_id,
          site_id: formData.site_id,
          facilitator_id: formData.facilitator_id,
          cycle_id: formData.cycle_id,
          rotation_start_date: formData.rotation_start_date,
          rotation_end_date: formData.rotation_end_date,
          required_attendance_pct: formData.required_attendance_pct,
          department_rotation: formData.department_rotation || undefined,
          is_paid: formData.is_paid,
          stipend_amount: parsedStipend,
          offer_letter_url: formData.offer_letter_url || null,
          institution_id: institutionId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Failed to create internship');
      }
      toast.success('Corporate internship created');
      router.push(`/cdc/internships/${json.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create internship');
    } finally {
      setLoading(false);
    }
  };

  // BUG-004087: upload the offer letter (PDF/image) to the cdc-docs bucket and
  // store its public URL in form state. Self-contained — uses the same browser
  // Supabase client the service uses, so the upload runs under the user's session.
  const handleOfferLetterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOffer(true);
    try {
      const supabase = createClientSupabaseClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `internship-offer-letters/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from('cdc-docs')
        .upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('cdc-docs').getPublicUrl(path);
      setFormData(p => ({ ...p, offer_letter_url: data.publicUrl }));
      toast.success('Offer letter uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload offer letter');
    } finally {
      setUploadingOffer(false);
      // Reset the input so re-selecting the same file re-triggers onChange.
      e.target.value = '';
    }
  };

  const set = (key: string) => (val: string) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  // Parse an ISO yyyy-mm-dd string to a Date without timezone drift.
  const parseIsoDate = (iso: string): Date | undefined => {
    if (!iso) return undefined;
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d.getTime()) ? undefined : d;
  };

  // Convert a calendar-selected Date back to ISO yyyy-mm-dd (what the backend expects).
  const toIsoDate = (date: Date | undefined): string => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Indian dd/mm/yyyy date field. Stores the value as ISO yyyy-mm-dd in formData
  // (unchanged submission contract) but DISPLAYS it as dd/mm/yyyy, instead of the
  // native <input type="date"> whose displayed order follows the browser/OS locale
  // (mm/dd/yyyy in US locales) — BUG-004051.
  const renderDateField = (key: 'rotation_start_date' | 'rotation_end_date', id: string) => {
    const iso = formData[key];
    const selected = parseIsoDate(iso);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !selected && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
            {selected ? format(selected, 'dd/MM/yyyy') : <span>dd/mm/yyyy</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => set(key)(toIsoDate(date ?? undefined))}
            disabled={(date) => date < new Date('1900-01-01')}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <PermissionGuard module="cdc.internships" action="create">
    <ContentLayout title="New Corporate Internship">
      <div className="max-w-2xl space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc/internships">Internships</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          <Link href="/cdc/internships">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">New Corporate Internship</h1>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader><CardTitle className="text-base">Assignment Details</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              {/* Internship type — display only */}
              <div className="grid gap-1">
                <Label>Internship type</Label>
                <div className="px-3 py-2 rounded-md border bg-gray-50 text-sm text-gray-700">
                  Corporate Internship
                </div>
              </div>

              {/* Cycle */}
              <div className="grid gap-1">
                <Label htmlFor="cycle_id">Posting cycle <span className="text-red-500">*</span></Label>
                {cycles.length > 0 ? (
                  <Select value={formData.cycle_id} onValueChange={set('cycle_id')}>
                    <SelectTrigger id="cycle_id">
                      <SelectValue placeholder="Select a cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      {cycles.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.cycle_name} ({c.start_date} – {c.end_date})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="px-3 py-2 rounded-md border bg-gray-50 text-sm text-gray-500">
                    No internship cycles configured for this institution yet. Add one in the
                    internship cycle setup before assigning.
                  </div>
                )}
              </div>

              {/* Site */}
              <div className="grid gap-1">
                <Label htmlFor="site_id">Corporate site / company <span className="text-red-500">*</span></Label>
                {sites.length > 0 ? (
                  <Select value={formData.site_id} onValueChange={set('site_id')}>
                    <SelectTrigger id="site_id">
                      <SelectValue placeholder="Select a company site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.site_name}{s.city ? ` — ${s.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="px-3 py-2 rounded-md border bg-gray-50 text-sm text-gray-500">
                    No corporate sites found for this institution. Add one in the internship
                    sites setup before assigning.
                  </div>
                )}
              </div>

              {/* Learner */}
              <div className="grid gap-1">
                <Label htmlFor="learner_id">Learner <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={formData.learner_id}
                  onValueChange={set('learner_id')}
                  options={learnerOptions}
                  placeholder="Search by name or register number…"
                  searchPlaceholder="Type to search learners…"
                  emptyMessage="No matching learners"
                  loading={learnersLoading}
                  className="w-full"
                />
              </div>

              {/* Facilitator */}
              <div className="grid gap-1">
                <Label htmlFor="facilitator_id">Facilitator / coordinator <span className="text-red-500">*</span></Label>
                <SearchableSelect
                  value={formData.facilitator_id}
                  onValueChange={set('facilitator_id')}
                  options={staffOptions}
                  placeholder="Search staff by name or staff ID…"
                  searchPlaceholder="Type to search staff…"
                  emptyMessage="No matching staff"
                  loading={staffLoading}
                  className="w-full"
                />
              </div>

              {/* Dates — dd/mm/yyyy display (Indian standard); value stored as ISO yyyy-mm-dd */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="start_date">Start date <span className="text-red-500">*</span></Label>
                  {renderDateField('rotation_start_date', 'start_date')}
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="end_date">End date <span className="text-red-500">*</span></Label>
                  {renderDateField('rotation_end_date', 'end_date')}
                </div>
              </div>

              {/* Required attendance */}
              <div className="grid gap-1">
                <Label htmlFor="req_att">Required attendance (%)</Label>
                <Input
                  id="req_att"
                  type="number"
                  min={0}
                  max={100}
                  value={formData.required_attendance_pct}
                  onChange={e =>
                    setFormData(p => ({ ...p, required_attendance_pct: parseInt(e.target.value) || DEFAULT_REQUIRED_ATTENDANCE_PCT }))
                  }
                />
              </div>

              {/* Paid / Unpaid + stipend — BUG-004040 */}
              <div className="grid gap-1">
                <Label htmlFor="is_paid">Compensation</Label>
                <Select
                  value={formData.is_paid ? 'paid' : 'unpaid'}
                  onValueChange={(v) =>
                    setFormData(p => ({
                      ...p,
                      is_paid: v === 'paid',
                      // Clear any entered stipend when switching to Unpaid.
                      stipend_amount: v === 'paid' ? p.stipend_amount : '',
                    }))
                  }
                >
                  <SelectTrigger id="is_paid">
                    <SelectValue placeholder="Select compensation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.is_paid && (
                <div className="grid gap-1">
                  <Label htmlFor="stipend_amount">Stipend amount (₹) (optional)</Label>
                  <Input
                    id="stipend_amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 15000"
                    value={formData.stipend_amount}
                    onChange={e =>
                      setFormData(p => ({ ...p, stipend_amount: e.target.value }))
                    }
                  />
                </div>
              )}

              {/* Department / rotation */}
              <div className="grid gap-1">
                <Label htmlFor="dept">Department / rotation (optional)</Label>
                <Input
                  id="dept"
                  placeholder="e.g. Software Engineering"
                  value={formData.department_rotation}
                  onChange={e => set('department_rotation')(e.target.value)}
                />
              </div>

              {/* Offer letter — optional upload (PDF/image) — BUG-004087 */}
              <div className="grid gap-1">
                <Label htmlFor="offer_letter">Offer letter (optional)</Label>
                {formData.offer_letter_url ? (
                  <div className="flex items-center gap-2 rounded-md border bg-gray-50 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                    <a
                      href={formData.offer_letter_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-blue-600 hover:underline"
                    >
                      Offer letter uploaded — view
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-6 w-6"
                      onClick={() => setFormData(p => ({ ...p, offer_letter_url: '' }))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Input
                      id="offer_letter"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={handleOfferLetterUpload}
                      disabled={uploadingOffer}
                      className="hidden"
                    />
                    <label
                      htmlFor="offer_letter"
                      className={cn(
                        'flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-gray-50',
                        uploadingOffer && 'pointer-events-none opacity-60'
                      )}
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingOffer ? 'Uploading…' : 'Upload offer letter (PDF or image)'}
                    </label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 mt-6">
            <Link href="/cdc/internships">
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving…' : 'Create Internship'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
