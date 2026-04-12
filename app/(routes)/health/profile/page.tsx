'use client';

// Health Profile page — CRUD form for student health data.
// Usage: /health/profile
// Sections: Blood Group, Physical Stats + BMI, Allergies, Medical Conditions,
//           Medications, Emergency Contact, Vaccination Status

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Heart,
  Ruler,
  Weight,
  AlertTriangle,
  Phone,
  Shield,
  Save,
  X,
  Plus,
  Syringe,
  User,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useHealthProfile, useUpdateHealthProfile } from '@/hooks/health/use-health';
import {
  BLOOD_GROUPS,
  EMERGENCY_RELATIONS,
  VACCINATION_LIST,
  BMI_CATEGORIES,
  type HealthProfileFormData,
} from '@/types/health';
import { cn } from '@/lib/utils';

// ============================================================================
// BMI helpers
// ============================================================================

function calculateBMI(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  return parseFloat((weightKg / (heightM * heightM)).toFixed(1));
}

function getBMICategory(bmi: number | null): {
  label: string;
  color: string;
  bg: string;
} | null {
  if (bmi === null) return null;
  for (const [label, range] of Object.entries(BMI_CATEGORIES)) {
    if (bmi >= range.min && bmi < range.max) {
      return { label, color: range.color, bg: range.bg };
    }
  }
  return { label: 'Obese', color: BMI_CATEGORIES.Obese.color, bg: BMI_CATEGORIES.Obese.bg };
}

// ============================================================================
// Tag chip input component
// ============================================================================

function TagInput({
  label,
  placeholder,
  tags,
  onAdd,
  onRemove,
  icon: Icon,
}: {
  label: string;
  placeholder: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  icon: React.ElementType;
}) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim().replace(/,$/, '');
      if (newTag && !tags.includes(newTag)) {
        onAdd(newTag);
      }
      setInputValue('');
    }
    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  };

  const handleAddClick = () => {
    const newTag = inputValue.trim();
    if (newTag && !tags.includes(newTag)) {
      onAdd(newTag);
      setInputValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </Label>
      <div
        className="min-h-[42px] flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tag);
              }}
              className="ml-0.5 hover:text-destructive transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1 flex-1 min-w-[140px]">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : 'Add more...'}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground min-w-0"
            aria-label={label}
          />
          {inputValue.trim() && (
            <button
              type="button"
              onClick={handleAddClick}
              className="shrink-0 text-primary hover:text-primary/80 transition-colors"
              aria-label="Add tag"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Press Enter or comma to add. Backspace to remove last.
      </p>
    </div>
  );
}

// ============================================================================
// Section wrapper
// ============================================================================

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('border-border/60', className)}>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-4.5 w-4.5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function HealthProfilePage() {
  const { profile: authProfile, isLoading: authLoading } = useAuth();
  const learnerId = authProfile?.learner_id ?? authProfile?.id;

  const { data: healthProfile, isLoading: profileLoading } = useHealthProfile(learnerId ?? undefined);
  const updateProfile = useUpdateHealthProfile();

  const [form, setForm] = useState<HealthProfileFormData>({
    blood_group: null,
    allergies: [],
    medical_conditions: [],
    medications: [],
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relation: null,
    height_cm: null,
    weight_kg: null,
    vaccination_status: {},
  });

  // Pre-fill form from loaded profile
  useEffect(() => {
    if (healthProfile) {
      setForm({
        blood_group: healthProfile.blood_group,
        allergies: healthProfile.allergies ?? [],
        medical_conditions: healthProfile.medical_conditions ?? [],
        medications: healthProfile.medications ?? [],
        emergency_contact_name: healthProfile.emergency_contact_name,
        emergency_contact_phone: healthProfile.emergency_contact_phone,
        emergency_contact_relation: healthProfile.emergency_contact_relation,
        height_cm: healthProfile.height_cm,
        weight_kg: healthProfile.weight_kg,
        vaccination_status: healthProfile.vaccination_status ?? {},
      });
    }
  }, [healthProfile]);

  const bmi = calculateBMI(form.height_cm, form.weight_kg);
  const bmiCategory = getBMICategory(bmi);

  const handleTagAdd = (field: 'allergies' | 'medical_conditions' | 'medications') =>
    (tag: string) => setForm((f) => ({ ...f, [field]: [...f[field], tag] }));

  const handleTagRemove = (field: 'allergies' | 'medical_conditions' | 'medications') =>
    (tag: string) =>
      setForm((f) => ({ ...f, [field]: f[field].filter((t) => t !== tag) }));

  const handleVaccinationToggle = (vaccine: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      vaccination_status: { ...f.vaccination_status, [vaccine]: checked },
    }));
  };

  const handleSave = () => {
    if (!learnerId) return;
    updateProfile.mutate({ learnerId, data: form });
  };

  const isLoading = authLoading || profileLoading;

  if (isLoading) {
    return (
      <ContentLayout title="Health Profile">
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Health Profile">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'My Profile' },
        ]}
      />

      <div className="mt-4 space-y-6 max-w-2xl">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0b6d41' }}>
            Health Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Keep your health information up to date. Used for emergency
            response and wellness tracking.
          </p>
        </div>

        {/* ── Section 1: Blood Group ── */}
        <Section title="Blood Group" icon={Heart}>
          <div className="max-w-xs">
            <Label htmlFor="blood-group" className="text-sm mb-1.5 block">
              Select your blood group
            </Label>
            <Select
              value={form.blood_group ?? ''}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, blood_group: v || null }))
              }
            >
              <SelectTrigger id="blood-group" className="w-full">
                <SelectValue placeholder="Select blood group" />
              </SelectTrigger>
              <SelectContent>
                {BLOOD_GROUPS.map((bg) => (
                  <SelectItem key={bg} value={bg}>
                    {bg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* ── Section 2: Physical Stats ── */}
        <Section title="Physical Stats" icon={Ruler}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="height" className="flex items-center gap-1.5 text-sm">
                <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                Height (cm)
              </Label>
              <Input
                id="height"
                type="number"
                min={100}
                max={250}
                placeholder="e.g. 170"
                value={form.height_cm ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    height_cm: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight" className="flex items-center gap-1.5 text-sm">
                <Weight className="h-3.5 w-3.5 text-muted-foreground" />
                Weight (kg)
              </Label>
              <Input
                id="weight"
                type="number"
                min={20}
                max={300}
                placeholder="e.g. 65"
                value={form.weight_kg ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    weight_kg: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </div>
          </div>

          {/* BMI display */}
          {bmi !== null && bmiCategory && (
            <div
              className={cn(
                'mt-4 flex items-center justify-between rounded-lg px-4 py-3 border',
                bmiCategory.bg,
                'border-current/20'
              )}
            >
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  BMI Index
                </p>
                <p className={cn('text-2xl font-bold', bmiCategory.color)}>
                  {bmi}
                </p>
              </div>
              <Badge
                className={cn(
                  'text-sm px-3 py-1 font-semibold border',
                  bmiCategory.bg,
                  bmiCategory.color,
                  'border-current/30'
                )}
                variant="outline"
              >
                {bmiCategory.label}
              </Badge>
            </div>
          )}

          {/* BMI legend */}
          <div className="mt-3 grid grid-cols-4 gap-1">
            {Object.entries(BMI_CATEGORIES).map(([label, range]) => (
              <div
                key={label}
                className={cn(
                  'rounded-md px-2 py-1.5 text-center',
                  range.bg,
                  bmiCategory?.label === label && 'ring-2 ring-offset-1 ring-current'
                )}
              >
                <p className={cn('text-xs font-semibold', range.color)}>{label}</p>
                <p className="text-xs text-muted-foreground">
                  {range.min}
                  {range.max < 100 ? `–${range.max}` : '+'}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Section 3: Allergies ── */}
        <Section title="Allergies" icon={AlertTriangle}>
          <TagInput
            label="Known Allergies"
            placeholder="Type allergy (e.g. Penicillin) and press Enter"
            tags={form.allergies}
            onAdd={handleTagAdd('allergies')}
            onRemove={handleTagRemove('allergies')}
            icon={AlertTriangle}
          />
        </Section>

        {/* ── Section 4: Medical Conditions ── */}
        <Section title="Medical Conditions" icon={Heart}>
          <TagInput
            label="Current Medical Conditions"
            placeholder="Type condition (e.g. Diabetes) and press Enter"
            tags={form.medical_conditions}
            onAdd={handleTagAdd('medical_conditions')}
            onRemove={handleTagRemove('medical_conditions')}
            icon={Heart}
          />
        </Section>

        {/* ── Section 5: Current Medications ── */}
        <Section title="Current Medications" icon={Shield}>
          <TagInput
            label="Current Medications"
            placeholder="Type medication name and press Enter"
            tags={form.medications}
            onAdd={handleTagAdd('medications')}
            onRemove={handleTagRemove('medications')}
            icon={Shield}
          />
        </Section>

        {/* ── Section 6: Emergency Contact ── */}
        <Section title="Emergency Contact" icon={Phone}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ec-name" className="flex items-center gap-1.5 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Full Name
              </Label>
              <Input
                id="ec-name"
                placeholder="Contact person's name"
                value={form.emergency_contact_name ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    emergency_contact_name: e.target.value || null,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ec-phone" className="flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone Number
              </Label>
              <Input
                id="ec-phone"
                type="tel"
                placeholder="+91 98765 43210"
                value={form.emergency_contact_phone ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    emergency_contact_phone: e.target.value || null,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ec-relation" className="text-sm">
                Relationship
              </Label>
              <Select
                value={form.emergency_contact_relation ?? ''}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    emergency_contact_relation: v || null,
                  }))
                }
              >
                <SelectTrigger id="ec-relation" className="w-full sm:w-48">
                  <SelectValue placeholder="Select relation" />
                </SelectTrigger>
                <SelectContent>
                  {EMERGENCY_RELATIONS.map((rel) => (
                    <SelectItem key={rel} value={rel}>
                      {rel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        {/* ── Section 7: Vaccination Status ── */}
        <Section title="Vaccination Status" icon={Syringe}>
          <p className="text-sm text-muted-foreground mb-4">
            Check all vaccines you have received.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VACCINATION_LIST.map((vaccine) => {
              const checked = form.vaccination_status[vaccine] === true;
              return (
                <label
                  key={vaccine}
                  htmlFor={`vaccine-${vaccine}`}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                    checked
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:border-primary/30 hover:bg-muted/40'
                  )}
                >
                  <Checkbox
                    id={`vaccine-${vaccine}`}
                    checked={checked}
                    onCheckedChange={(c) =>
                      handleVaccinationToggle(vaccine, c === true)
                    }
                    className="shrink-0"
                  />
                  <span className="text-sm font-medium">{vaccine}</span>
                  {checked && (
                    <Shield className="h-3.5 w-3.5 text-primary ml-auto shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        </Section>

        {/* ── Save Button ── */}
        <div className="flex justify-end pb-8">
          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending || !learnerId}
            size="lg"
            className="gap-2 min-w-[140px]"
          >
            {updateProfile.isPending ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-background/40 border-t-background animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Profile
              </>
            )}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
