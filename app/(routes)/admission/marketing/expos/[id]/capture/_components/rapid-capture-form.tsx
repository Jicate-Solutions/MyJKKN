'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp, Loader2, Check, AlertTriangle, Save, MessageCircle, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { LeadService } from '@/lib/services/admission/lead-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useStallsByEvent } from '@/hooks/admission/use-stalls';
import { useFormDraftObject } from '@/hooks/use-form-draft';
import { ProgramChipPicker } from './program-chip-picker';
import type { CreateLeadInput } from '@/types/admission';

interface RapidCaptureFormProps {
  eventId: string;
  institutionId: string;
  capturedBy: string;
  waChannelPreference?: 'personal' | 'meta_waba' | 'both' | 'none';
}

interface FormData {
  name: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  selectedPrograms: string[];
  // Expandable fields
  email: string;
  district: string;
  twelfthMarks: string;
  // BUG-003222: capture the 12th group (e.g. Biology, Computer Science,
  // Commerce) as a free-text field so counselors can segment later.
  twelfthGroup: string;
  currentSchool: string;
  zone: 'regular' | 'ai_zone';
  notes: string;
  // WhatsApp consent
  waOptIn: boolean;
  // BUG-003146: which stall this lead was captured at (optional). Persists
  // across captures via useFormDraftObject so a counselor sets it once.
  stallId: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  phone: '',
  parentName: '',
  parentPhone: '',
  selectedPrograms: [],
  email: '',
  district: '',
  twelfthMarks: '',
  twelfthGroup: '',
  currentSchool: '',
  zone: 'regular',
  notes: '',
  waOptIn: true,
  stallId: '',
};

export function RapidCaptureForm({ eventId, institutionId, capturedBy, waChannelPreference = 'meta_waba' }: RapidCaptureFormProps) {
  // Persist form data across tab switches and navigation via sessionStorage
  const draftKey = `expo-capture-${eventId}`;
  const { values: form, setValue: setDraftField, setValues: setDraftValues, clearDraft } = useFormDraftObject<FormData>(draftKey, INITIAL_FORM);

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>(institutionId);
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  // BUG-003146: stall picker — only rendered if the event has any stalls.
  const { stalls } = useStallsByEvent(eventId);
  const [expanded, setExpanded] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'duplicate'>('idle');
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; name: string; stage?: string } | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name input on mount and after reset
  useEffect(() => {
    nameInputRef.current?.focus();
  }, [captureCount]);

  const updateField = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setDraftField(field, value);
  }, [setDraftField]);

  const handleInstitutionChange = useCallback((newInstId: string) => {
    setSelectedInstitutionId(newInstId);
    setDraftField('selectedPrograms', []);
  }, [setDraftField]);

  // Per-field error state for inline validation
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData | 'institution', string>>>({});

  const resetForm = useCallback(() => {
    clearDraft();
    setSubmitState('idle');
    setDuplicateInfo(null);
    setFieldErrors({});
    setCaptureCount((c) => c + 1);
  }, [clearDraft]);

  // Phone input handler — only allows digits, +, spaces
  const handlePhoneChange = useCallback((field: 'phone' | 'parentPhone', value: string) => {
    const cleaned = value.replace(/[^0-9+\s\-]/g, '');
    setDraftField(field, cleaned);
    // Clear error on edit
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }, [setDraftField, fieldErrors]);

  // Clear field error on edit for text fields
  const handleTextChange = useCallback((field: keyof FormData, value: string) => {
    setDraftField(field, value);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }, [setDraftField, fieldErrors]);

  // Email validation on blur
  const handleEmailBlur = useCallback(() => {
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFieldErrors((prev) => ({ ...prev, email: 'Enter a valid email address' }));
    } else {
      setFieldErrors((prev) => ({ ...prev, email: undefined }));
    }
  }, [form.email]);

  // Phone validation helper
  const isValidIndianPhone = (phone: string): boolean => {
    const clean = phone.trim().replace(/[\s\-()]/g, '');
    return /^(\+91|0)?[6-9]\d{9}$/.test(clean);
  };

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};

    // BUG-003222: Only name + phone + institution are required now.
    // Email / district / program / parent name / parent phone are optional
    // per product decision (Apr 2026) — counselors often capture just the
    // essentials at a busy stall and fill in the rest later.
    if (!form.name.trim()) errors.name = 'Learner name is required';
    if (!form.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!isValidIndianPhone(form.phone)) {
      errors.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6-9)';
    }
    // Parent phone: only validate format if provided
    if (form.parentPhone.trim() && !isValidIndianPhone(form.parentPhone)) {
      errors.parentPhone = 'Enter a valid 10-digit parent phone number';
    }
    if (!selectedInstitutionId) errors.institution = 'Select an institution';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      // Show first error as toast
      const firstError = Object.values(errors)[0];
      toast.error(firstError || 'Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    setDuplicateInfo(null);

    try {
      const nameParts = form.name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      const leadInput: CreateLeadInput = {
        institution_id: selectedInstitutionId,
        first_name: firstName,
        last_name: lastName,
        phone: form.phone.trim(),
        source: 'education_fair',
        expo_event_id: eventId,
        captured_by: capturedBy,
        // BUG-003146: attribute to stall when the counselor selected one.
        ...(form.stallId && { stall_id: form.stallId }),
        referral_type: 'learner_ambassador',
        referred_by_id: capturedBy,
        // BUG-003222: parent fields and programs are now optional per
        // product decision. Conditionally include them only when filled.
        ...(form.parentName.trim() && { parent_name: form.parentName.trim() }),
        ...(form.parentPhone.trim() && { parent_phone: form.parentPhone.trim() }),
        ...(form.selectedPrograms.length > 0 && { interested_programs: form.selectedPrograms }),
        tags: form.zone === 'ai_zone' ? ['ai-zone'] : [],
        wa_opt_in: form.waOptIn,
        wa_opt_in_source: form.waOptIn ? 'expo_capture_form' : null,
        ...(form.email && { email: form.email.trim() }),
        ...(form.district && { district: form.district.trim() }),
        ...(form.twelfthGroup && { twelfth_group: form.twelfthGroup.trim() }),
        ...(form.notes && { notes: form.notes.trim() }),
      };

      const createdLead = await LeadService.createLead(leadInput);

      setSubmitState('success');
      toast.success(`Lead #${captureCount + 1} saved!`, { duration: 2000 });

      // Fire-and-forget: trigger WhatsApp welcome (non-blocking)
      if (form.waOptIn && createdLead?.id) {
        fetch('/api/admission/expos/wa-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: createdLead.id,
            leadPhone: form.phone.trim(),
            leadName: form.name.trim(),
            parentPhone: form.parentPhone.trim() || null,
            parentName: form.parentName.trim() || null,
            eventName: '', // Will be looked up server-side if needed
            institutionId: selectedInstitutionId,
            expoEventId: eventId,
            channel: waChannelPreference,
          }),
        }).catch(() => { /* silent — WA send failure never blocks capture */ });
      }

      setTimeout(resetForm, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save lead';
      if (message.includes('Duplicate lead')) {
        setSubmitState('duplicate');
        // Quick lookup to show existing lead details
        try {
          const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();
          const cleanPhone = form.phone.trim().replace(/[\s\-()]/g, '').replace(/^(\+91|0)/, '');
          const { data: existing } = await (supabase as any)
            .from('admission_leads')
            .select('id, full_name, funnel_stage')
            .eq('institution_id', selectedInstitutionId)
            .eq('phone', cleanPhone)
            .limit(1)
            .single();
          setDuplicateInfo({
            id: existing?.id || '',
            name: existing?.full_name || form.name,
            stage: existing?.funnel_stage || 'unknown',
          });
        } catch {
          setDuplicateInfo({ id: '', name: form.name });
        }
        toast.error('This visitor was already captured');
      } else {
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
      {/* ── Stall Assignment (BUG-003146, only shown if event has stalls) ── */}
      {stalls.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4" />
              Which stall are you at?
            </CardTitle>
            <CardDescription>
              Tags each lead below to your stall so expenses and attribution are
              accurate. Your choice is remembered across captures.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={form.stallId || '_none'}
              onValueChange={(v) => updateField('stallId', v === '_none' ? '' : v)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select stall" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Not tied to a stall —</SelectItem>
                {stalls.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.stall_name}
                    {s.assigned_staff?.full_name
                      ? ` · ${s.assigned_staff.full_name}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* ── Learner Details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Learner Details / மாணவர் விவரங்கள்</CardTitle>
          <CardDescription>
            Enter the visitor&apos;s basic contact information
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">
              Learner Name / மாணவர் பெயர் <span className="text-destructive">*</span>
            </Label>
            <Input
              ref={nameInputRef}
              id="name"
              value={form.name}
              onChange={(e) => handleTextChange('name', e.target.value)}
              placeholder="Enter visitor's name"
              className={`mt-1 ${fieldErrors.name ? 'border-destructive' : ''}`}
              autoComplete="off"
              disabled={isSubmitting}
            />
            {fieldErrors.name && <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>}
          </div>
          <div>
            <Label htmlFor="phone">
              Phone / தொலைபேசி <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => handlePhoneChange('phone', e.target.value)}
              placeholder="98765 43210"
              className={`mt-1 ${fieldErrors.phone ? 'border-destructive' : ''}`}
              autoComplete="off"
              maxLength={15}
              disabled={isSubmitting}
            />
            {fieldErrors.phone && <p className="text-xs text-destructive mt-1">{fieldErrors.phone}</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Parent / Guardian Details ── */}
      <Card>
        <CardHeader>
          <CardTitle>Parent / Guardian Details / பெற்றோர் விவரங்கள்</CardTitle>
          <CardDescription>
            Parent or guardian contact information
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="parentName">
              Parent Name / பெற்றோர் பெயர்
            </Label>
            <Input
              id="parentName"
              value={form.parentName}
              onChange={(e) => handleTextChange('parentName', e.target.value)}
              placeholder="Parent or guardian name"
              className={`mt-1 ${fieldErrors.parentName ? 'border-destructive' : ''}`}
              autoComplete="off"
              disabled={isSubmitting}
            />
            {fieldErrors.parentName && <p className="text-xs text-destructive mt-1">{fieldErrors.parentName}</p>}
          </div>
          <div>
            <Label htmlFor="parentPhone">
              Parent Phone / பெற்றோர் தொலைபேசி
            </Label>
            <Input
              id="parentPhone"
              type="tel"
              inputMode="numeric"
              value={form.parentPhone}
              onChange={(e) => handlePhoneChange('parentPhone', e.target.value)}
              placeholder="98765 43210"
              className={`mt-1 ${fieldErrors.parentPhone ? 'border-destructive' : ''}`}
              autoComplete="off"
              maxLength={15}
              disabled={isSubmitting}
            />
            {fieldErrors.parentPhone && <p className="text-xs text-destructive mt-1">{fieldErrors.parentPhone}</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Institution & Program Interest ── */}
      <Card>
        <CardHeader>
          <CardTitle>Academic Interest / கல்வி ஆர்வம்</CardTitle>
          <CardDescription>
            Select institution and programs the visitor is interested in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Institution Selector */}
          <div>
            <Label htmlFor="institution">
              Institution / கல்வி நிறுவனம் <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedInstitutionId}
              onValueChange={(v) => { handleInstitutionChange(v); setFieldErrors((prev) => ({ ...prev, institution: undefined })); }}
              disabled={institutionsLoading || isSubmitting}
            >
              <SelectTrigger className={`mt-1 ${fieldErrors.institution ? 'border-destructive' : ''}`}>
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
            {fieldErrors.institution && <p className="text-xs text-destructive mt-1">{fieldErrors.institution}</p>}
          </div>

          {/* Program Chips */}
          <div>
            <Label>
              Programs Interested / ஆர்வமுள்ள படிப்புகள்
            </Label>
          <ProgramChipPicker
            institutionId={selectedInstitutionId}
            selectedIds={form.selectedPrograms}
            onChange={(ids) => { updateField('selectedPrograms', ids); setFieldErrors((prev) => ({ ...prev, selectedPrograms: undefined })); }}
            disabled={isSubmitting}
          />
          {fieldErrors.selectedPrograms && <p className="text-xs text-destructive mt-1">{fieldErrors.selectedPrograms}</p>}
          </div>
        </CardContent>
      </Card>

      {/* ── Additional Details (Expandable) ── */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Additional Details (Optional)</CardTitle>
              <CardDescription>
                Extra information to improve lead quality
              </CardDescription>
            </div>
            {expanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-in slide-in-from-top-2 duration-200">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => handleTextChange('email', e.target.value)}
                onBlur={handleEmailBlur}
                placeholder="visitor@email.com"
                className={`mt-1 ${fieldErrors.email ? 'border-destructive' : ''}`}
                disabled={isSubmitting}
              />
              {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
            </div>
            <div>
              <Label htmlFor="district">District / City</Label>
              <Input
                id="district"
                value={form.district}
                onChange={(e) => updateField('district', e.target.value)}
                placeholder="e.g. Ramanathapuram, Pudukottai"
                className="mt-1"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="twelfthMarks">12th Marks / Percentage</Label>
              <Input
                id="twelfthMarks"
                value={form.twelfthMarks}
                onChange={(e) => updateField('twelfthMarks', e.target.value)}
                placeholder="e.g. 85%"
                className="mt-1"
                disabled={isSubmitting}
              />
            </div>
            <div>
              {/* BUG-003222: 12th group (stream) — Biology, Computer Science,
                  Commerce, Arts, etc. Free-text so counselors can capture
                  exactly what the learner said without being boxed into a
                  pre-defined list. */}
              <Label htmlFor="twelfthGroup">12th Group / Stream</Label>
              <Input
                id="twelfthGroup"
                value={form.twelfthGroup}
                onChange={(e) => updateField('twelfthGroup', e.target.value)}
                placeholder="e.g. Biology, Computer Science, Commerce"
                className="mt-1"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label htmlFor="currentSchool">Current School / College</Label>
              <Input
                id="currentSchool"
                value={form.currentSchool}
                onChange={(e) => updateField('currentSchool', e.target.value)}
                placeholder="School or college name"
                className="mt-1"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label>Capture Zone</Label>
              <div className="flex gap-2 mt-1">
                <Badge
                  variant={form.zone === 'regular' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => updateField('zone', 'regular')}
                >
                  Regular Stall
                </Badge>
                <Badge
                  variant={form.zone === 'ai_zone' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => updateField('zone', 'ai_zone')}
                >
                  AI Experience Zone
                </Badge>
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Any additional notes about the visitor..."
                className="mt-1"
                rows={2}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── WhatsApp Consent ── */}
      <div className="flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 p-4">
        <Checkbox
          id="waOptIn"
          checked={form.waOptIn}
          onCheckedChange={(checked) => updateField('waOptIn', checked === true)}
          disabled={isSubmitting}
          className="mt-0.5"
        />
        <div className="flex-1">
          <Label htmlFor="waOptIn" className="text-sm font-medium cursor-pointer flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-600" />
            WhatsApp Updates / வாட்ஸ்அப் புதுப்பிப்புகள்
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            I consent to receive admission updates and program information via WhatsApp.
            / வாட்ஸ்அப் வழியாக சேர்க்கை புதுப்பிப்புகளைப் பெற ஒப்புக்கொள்கிறேன்.
          </p>
        </div>
      </div>

      {/* Duplicate handling */}
      {submitState === 'duplicate' && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium text-yellow-800 dark:text-yellow-200">Already Captured</p>
            <p className="text-yellow-700 dark:text-yellow-300 mt-1">
              A lead with phone <span className="font-mono">{form.phone}</span> already exists.
            </p>
            {duplicateInfo && (
              <div className="mt-2 p-2 bg-yellow-100/50 dark:bg-yellow-900/30 rounded text-xs space-y-1">
                <p><strong>Name:</strong> {duplicateInfo.name}</p>
                {duplicateInfo.stage && (
                  <p><strong>Stage:</strong> <Badge variant="outline" className="text-[10px] py-0">{duplicateInfo.stage.replace(/_/g, ' ')}</Badge></p>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" type="button" onClick={resetForm}>
                Skip &amp; Next
              </Button>
              {duplicateInfo?.id && (
                <Button size="sm" variant="secondary" type="button" asChild>
                  <a href={`/admission/leads/${duplicateInfo.id}`} target="_blank" rel="noopener noreferrer">
                    View Lead
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          type="button"
          onClick={resetForm}
          disabled={isSubmitting}
        >
          Clear
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || submitState === 'success'}
          className={submitState === 'success' ? 'bg-green-600 hover:bg-green-600 text-white' : ''}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : submitState === 'success' ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Saved! Next visitor...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save &amp; Next / சேமி &amp; அடுத்தது
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
