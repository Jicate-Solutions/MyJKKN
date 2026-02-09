'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState, useEffect } from 'react';
import {
  Save,
  ArrowLeft,
  User,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  Wrench,
  Briefcase,
} from 'lucide-react';
import { useCreateBuilder, useAddBuilderSkill } from '@/hooks/solutions/use-builders';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';

const SPECIALIZATION_OPTIONS = [
  'Frontend',
  'Backend',
  'Full Stack',
  'Mobile',
  'DevOps',
  'UI/UX Design',
  'Data Science',
  'Machine Learning',
  'QA/Testing',
  'Cloud/Infrastructure',
  'Other',
];

const AVAILABILITY_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'partially_available', label: 'Partially Available' },
];

interface SkillEntry {
  skill_name: string;
  proficiency_level: number;
}

interface DepartmentOption {
  id: string;
  department_name: string;
  department_code: string;
}

export default function NewBuilderPage() {
  const router = useRouter();
  const createBuilder = useCreateBuilder();
  const addSkill = useAddBuilderSkill();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department_id: '',
    trained_date: new Date().toISOString().split('T')[0],
    hourly_rate: '',
    specialization: '',
    availability_status: 'available',
    bio: '',
  });

  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState(3);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch departments on mount
  useEffect(() => {
    async function fetchDepartments() {
      try {
        const depts = await DepartmentTrackerService.listDepartments();
        setDepartments(
          depts.map((d) => ({
            id: d.department_id,
            department_name: d.department?.department_name || 'Unknown',
            department_code: d.department?.department_code || '',
          }))
        );
      } catch {
        // Silently fail - department dropdown will just be empty
      } finally {
        setLoadingDepts(false);
      }
    }
    fetchDepartments();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addSkillEntry = () => {
    if (!newSkillName.trim()) return;
    // Prevent duplicates
    if (skills.some((s) => s.skill_name.toLowerCase() === newSkillName.trim().toLowerCase())) return;
    setSkills((prev) => [
      ...prev,
      { skill_name: newSkillName.trim(), proficiency_level: newSkillLevel },
    ]);
    setNewSkillName('');
    setNewSkillLevel(3);
  };

  const removeSkill = (index: number) => {
    setSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) return;

    try {
      const builder = await createBuilder.mutateAsync({
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        department_id: formData.department_id || undefined,
        trained_date: formData.trained_date || undefined,
        hourly_rate: formData.hourly_rate ? Number(formData.hourly_rate) : undefined,
        specialization: formData.specialization || undefined,
        availability_status: formData.availability_status || 'available',
        bio: formData.bio.trim() || undefined,
      });

      // Add skills after builder is created
      const builderId = (builder as { id?: string })?.id;
      if (skills.length > 0 && builderId) {
        await Promise.all(
          skills.map((skill) =>
            addSkill.mutateAsync({
              builder_id: builderId,
              skill_name: skill.skill_name,
              proficiency_level: skill.proficiency_level,
            })
          )
        );
      }

      setSuccessMessage('Builder added successfully!');
      setTimeout(() => {
        router.push('/solutions/software/builders');
      }, 1000);
    } catch {
      // Error is handled by the mutation state
    }
  };

  const proficiencyLabel = (level: number) => {
    const labels: Record<number, string> = {
      1: 'Beginner',
      2: 'Elementary',
      3: 'Intermediate',
      4: 'Advanced',
      5: 'Expert',
    };
    return labels[level] || 'Unknown';
  };

  return (
    <ContentLayout title="Add Builder">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Builders', href: '/solutions/software/builders' },
          { label: 'New Builder' },
        ]}
      />

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold py-1">Add New Builder</h1>
            <p className="text-sm text-muted-foreground">
              Add a developer/builder to the software solutions team
            </p>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {createBuilder.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to create builder: {createBuilder.error?.message || 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 max-w-2xl">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="Enter full name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+91 XXXXX XXXXX"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="trained_date">Trained Date</Label>
                    <Input
                      id="trained_date"
                      type="date"
                      value={formData.trained_date}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={formData.department_id}
                      onValueChange={(val) => handleSelectChange('department_id', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingDepts ? 'Loading...' : 'Select department'} />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.department_name} ({dept.department_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Availability</Label>
                    <Select
                      value={formData.availability_status}
                      onValueChange={(val) => handleSelectChange('availability_status', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select availability" />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABILITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Professional Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Professional Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Specialization</Label>
                    <Select
                      value={formData.specialization}
                      onValueChange={(val) => handleSelectChange('specialization', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select specialization" />
                      </SelectTrigger>
                      <SelectContent>
                        {SPECIALIZATION_OPTIONS.map((spec) => (
                          <SelectItem key={spec} value={spec.toLowerCase().replace(/[\s/]+/g, '_')}>
                            {spec}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate">Hourly Rate (INR)</Label>
                    <Input
                      id="hourly_rate"
                      type="number"
                      min="0"
                      step="50"
                      placeholder="e.g. 500"
                      value={formData.hourly_rate}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Bio / Notes</Label>
                  <Textarea
                    id="bio"
                    placeholder="Brief description, background, or notes about this builder..."
                    value={formData.bio}
                    onChange={handleChange}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Skills
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Skill Input Row */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="newSkillName">Skill Name</Label>
                    <Input
                      id="newSkillName"
                      placeholder="e.g. React, Python, AWS"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkillEntry();
                        }
                      }}
                    />
                  </div>
                  <div className="w-40 space-y-2">
                    <Label>Proficiency (1-5)</Label>
                    <Select
                      value={String(newSkillLevel)}
                      onValueChange={(val) => setNewSkillLevel(Number(val))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((level) => (
                          <SelectItem key={level} value={String(level)}>
                            {level} - {proficiencyLabel(level)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addSkillEntry}
                    disabled={!newSkillName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Skills List */}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {skills.map((skill, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
                      >
                        {skill.skill_name}
                        <span className="text-muted-foreground text-xs">
                          (Lv {skill.proficiency_level})
                        </span>
                        <button
                          type="button"
                          onClick={() => removeSkill(index)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {skills.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No skills added yet. Add skills above to track this builder&apos;s capabilities.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={createBuilder.isPending || !formData.name.trim()}>
                <Save className="mr-2 h-4 w-4" />
                {createBuilder.isPending ? 'Adding...' : 'Add Builder'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
