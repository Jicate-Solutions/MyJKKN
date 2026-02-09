'use client';

import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState, useEffect } from 'react';
import {
  Save,
  ArrowLeft,
  Search,
  User,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  Wrench,
  Briefcase,
  GraduationCap,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useCreateBuilder, useAddBuilderSkill, useSearchPeople } from '@/hooks/solutions/use-builders';
import { useDebounceValue } from '@/hooks/use-debounce-value';
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
  'Content Creation',
  'Training & Facilitation',
  'Research & Publications',
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

interface SelectedPerson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  department_name: string | null;
  type: 'learner' | 'staff';
  designation: string | null;
  roll_number: string | null;
}

export default function NewBuilderPage() {
  const router = useRouter();
  const createBuilder = useCreateBuilder();
  const addSkill = useAddBuilderSkill();

  // Person search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounceValue(searchQuery, 300);
  const { data: searchResults, isLoading: searching } = useSearchPeople(debouncedSearch);
  const [selectedPerson, setSelectedPerson] = useState<SelectedPerson | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);

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
        // Silently fail
      } finally {
        setLoadingDepts(false);
      }
    }
    fetchDepartments();
  }, []);

  const handleSelectPerson = (person: SelectedPerson) => {
    setSelectedPerson(person);
    setFormData((prev) => ({
      ...prev,
      name: person.name,
      email: person.email || '',
      phone: person.phone || '',
      department_id: person.department_id || '',
    }));
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleClearSelection = () => {
    setSelectedPerson(null);
    setIsManualEntry(false);
    setFormData({
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
  };

  const handleManualEntry = () => {
    setIsManualEntry(true);
    setSelectedPerson(null);
    setSearchOpen(false);
    setSearchQuery('');
  };

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
        learner_id: selectedPerson?.type === 'learner' ? selectedPerson.id : undefined,
        staff_id: selectedPerson?.type === 'staff' ? selectedPerson.id : undefined,
        department_id: formData.department_id || undefined,
        trained_date: formData.trained_date || undefined,
        hourly_rate: formData.hourly_rate ? Number(formData.hourly_rate) : undefined,
        specialization: formData.specialization || undefined,
        availability_status: formData.availability_status || 'available',
        bio: formData.bio.trim() || undefined,
      });

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
        router.push('/solutions/builders');
      }, 1000);
    } catch {
      // Error handled by mutation state
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

  const hasPersonSelected = selectedPerson !== null || isManualEntry;

  return (
    <ContentLayout title="Add Builder">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Builders', href: '/solutions/builders' },
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
              Search for an existing learner or staff member, or add someone new
            </p>
          </div>
        </div>

        {successMessage && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {createBuilder.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to create builder: {createBuilder.error?.message || 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 max-w-2xl">
          {/* Step 1: Find Person */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Find Person
              </CardTitle>
              <CardDescription>
                Search by name, roll number, email, or designation to find an existing person
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasPersonSelected ? (
                <div className="space-y-4">
                  <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={searchOpen}
                        className="w-full justify-start text-muted-foreground h-10"
                      >
                        <Search className="mr-2 h-4 w-4 shrink-0" />
                        Search learners and staff...
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Type a name, roll number, or email..."
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList>
                          {searching && (
                            <div className="p-4 text-sm text-center text-muted-foreground">
                              Searching...
                            </div>
                          )}
                          {!searching && debouncedSearch.length >= 2 && (!searchResults || searchResults.length === 0) && (
                            <CommandEmpty>
                              No matching people found. Try a different search or add manually.
                            </CommandEmpty>
                          )}
                          {!searching && debouncedSearch.length < 2 && (
                            <div className="p-4 text-sm text-center text-muted-foreground">
                              Type at least 2 characters to search
                            </div>
                          )}
                          {searchResults && searchResults.length > 0 && (
                            <CommandGroup heading="Results">
                              {searchResults.map((person: SelectedPerson) => (
                                <CommandItem
                                  key={`${person.type}-${person.id}`}
                                  value={`${person.type}-${person.id}`}
                                  onSelect={() => handleSelectPerson(person)}
                                  className="flex items-center gap-3 py-3"
                                >
                                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted shrink-0">
                                    {person.type === 'learner' ? (
                                      <GraduationCap className="h-4 w-4 text-blue-600" />
                                    ) : (
                                      <UserCheck className="h-4 w-4 text-green-600" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium truncate">{person.name}</span>
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                        {person.type === 'learner' ? 'Learner' : 'Staff'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {person.department_name && <span>{person.department_name}</span>}
                                      {person.designation && <span>{person.designation}</span>}
                                      {person.roll_number && <span>{person.roll_number}</span>}
                                      {person.email && <span>{person.email}</span>}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 border-t" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleManualEntry}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add someone not in the system
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-background border">
                      {selectedPerson ? (
                        selectedPerson.type === 'learner' ? (
                          <GraduationCap className="h-5 w-5 text-blue-600" />
                        ) : (
                          <UserCheck className="h-5 w-5 text-green-600" />
                        )
                      ) : (
                        <UserPlus className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {selectedPerson ? selectedPerson.name : 'Manual Entry'}
                        </span>
                        {selectedPerson && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {selectedPerson.type === 'learner' ? 'Learner' : 'Staff'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedPerson
                          ? [selectedPerson.department_name, selectedPerson.designation, selectedPerson.email].filter(Boolean).join(' / ')
                          : 'Enter details manually below'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Builder form (shown after person is selected or manual entry chosen) */}
          {hasPersonSelected && (
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
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
                          readOnly={!!selectedPerson}
                          className={selectedPerson ? 'bg-muted' : ''}
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
                          readOnly={!!selectedPerson}
                          className={selectedPerson ? 'bg-muted' : ''}
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
                          readOnly={!!selectedPerson}
                          className={selectedPerson ? 'bg-muted' : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="trained_date">Trained Date</Label>
                        <Input id="trained_date" type="date" value={formData.trained_date} onChange={handleChange} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        {selectedPerson?.department_id ? (
                          <Input
                            value={selectedPerson.department_name || 'Unknown'}
                            readOnly
                            className="bg-muted"
                          />
                        ) : (
                          <Select value={formData.department_id} onValueChange={(val) => handleSelectChange('department_id', val)}>
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
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Availability</Label>
                        <Select value={formData.availability_status} onValueChange={(val) => handleSelectChange('availability_status', val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select availability" />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABILITY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
                        <Select value={formData.specialization} onValueChange={(val) => handleSelectChange('specialization', val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select specialization" />
                          </SelectTrigger>
                          <SelectContent>
                            {SPECIALIZATION_OPTIONS.map((spec) => (
                              <SelectItem key={spec} value={spec.toLowerCase().replace(/[\s/]+/g, '_')}>{spec}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hourly_rate">Hourly Rate (INR)</Label>
                        <Input id="hourly_rate" type="number" min="0" step="50" placeholder="e.g. 500" value={formData.hourly_rate} onChange={handleChange} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio">Bio / Notes</Label>
                      <Textarea id="bio" placeholder="Brief description, background, or notes about this builder..." value={formData.bio} onChange={handleChange} rows={3} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      Skills
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="newSkillName">Skill Name</Label>
                        <Input
                          id="newSkillName"
                          placeholder="e.g. React, Video Editing, Teaching"
                          value={newSkillName}
                          onChange={(e) => setNewSkillName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkillEntry(); } }}
                        />
                      </div>
                      <div className="w-40 space-y-2">
                        <Label>Proficiency (1-5)</Label>
                        <Select value={String(newSkillLevel)} onValueChange={(val) => setNewSkillLevel(Number(val))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((level) => (
                              <SelectItem key={level} value={String(level)}>{level} - {proficiencyLabel(level)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={addSkillEntry} disabled={!newSkillName.trim()}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {skills.map((skill, index) => (
                          <Badge key={index} variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
                            {skill.skill_name}
                            <span className="text-muted-foreground text-xs">(Lv {skill.proficiency_level})</span>
                            <button type="button" onClick={() => removeSkill(index)} className="ml-1 hover:text-destructive">
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

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                  <Button type="submit" disabled={createBuilder.isPending || !formData.name.trim()}>
                    <Save className="mr-2 h-4 w-4" />
                    {createBuilder.isPending ? 'Adding...' : 'Add Builder'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </ContentLayout>
  );
}
