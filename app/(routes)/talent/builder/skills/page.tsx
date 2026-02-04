'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Star,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  useBuilderProfile,
  useMySkills,
  useAddMySkill,
  useUpdateMySkillProficiency,
  useRemoveMySkill,
} from '@/hooks/solutions/use-builder-portal';

const PROFICIENCY_LABELS = ['Beginner', 'Basic', 'Intermediate', 'Advanced', 'Expert'];

function getProficiencyBadge(level: number | null) {
  const lvl = level || 1;
  const colors = [
    'bg-gray-100 text-gray-800',
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-purple-100 text-purple-800',
    'bg-yellow-100 text-yellow-800',
  ];
  return (
    <Badge className={colors[lvl - 1]}>
      {PROFICIENCY_LABELS[lvl - 1]}
    </Badge>
  );
}

function ProficiencyStars({ level }: { level: number | null }) {
  const lvl = level || 1;
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= lvl ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
          }`}
        />
      ))}
    </div>
  );
}

interface BuilderSkill {
  id: string;
  skill_name: string;
  proficiency_level: number | null;
  assessed_date?: string | null;
  created_at: string;
}

export default function SkillsPage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<BuilderSkill | null>(null);
  const [deletingSkill, setDeletingSkill] = useState<BuilderSkill | null>(null);

  // Form states
  const [newSkillName, setNewSkillName] = useState('');
  const [newProficiency, setNewProficiency] = useState(3);
  const [editProficiency, setEditProficiency] = useState(3);

  // Get builder profile
  const { data: builderProfile, isLoading: profileLoading } = useBuilderProfile(profile?.id || '');
  const builderId = builderProfile?.id;

  // Get skills
  const { data: skills, isLoading: skillsLoading } = useMySkills(builderId || '');

  // Mutations
  const addSkill = useAddMySkill();
  const updateSkill = useUpdateMySkillProficiency();
  const removeSkill = useRemoveMySkill();

  const isLoading = authLoading || profileLoading || skillsLoading;

  const handleAddSkill = async () => {
    if (!builderId || !newSkillName.trim()) return;

    try {
      await addSkill.mutateAsync({
        builderId,
        skillName: newSkillName.trim(),
        proficiencyLevel: newProficiency,
      });
      toast.success('Skill added successfully');
      setIsAddDialogOpen(false);
      setNewSkillName('');
      setNewProficiency(3);
    } catch (error) {
      toast.error('Failed to add skill');
    }
  };

  const handleUpdateProficiency = async () => {
    if (!builderId || !editingSkill) return;

    try {
      await updateSkill.mutateAsync({
        skillId: editingSkill.id,
        proficiencyLevel: editProficiency,
        builderId,
      });
      toast.success('Proficiency updated');
      setEditingSkill(null);
    } catch (error) {
      toast.error('Failed to update proficiency');
    }
  };

  const handleRemoveSkill = async () => {
    if (!builderId || !deletingSkill) return;

    try {
      await removeSkill.mutateAsync({
        skillId: deletingSkill.id,
        builderId,
      });
      toast.success('Skill removed');
      setDeletingSkill(null);
    } catch (error) {
      toast.error('Failed to remove skill');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!builderProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Builder Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your builder profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typedSkills = (skills || []) as BuilderSkill[];

  // Group skills by proficiency for stats
  const skillsByLevel = typedSkills.reduce((acc, skill) => {
    const level = skill.proficiency_level || 1;
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Skills</h1>
          <p className="text-muted-foreground">
            Manage your skills and proficiency levels
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Skill
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Skill</DialogTitle>
              <DialogDescription>
                Add a new skill to your profile with your current proficiency level.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="skill-name">Skill Name</Label>
                <Input
                  id="skill-name"
                  placeholder="e.g., React, Python, UI Design"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <Label>Proficiency Level</Label>
                  <span className="text-sm font-medium">
                    {PROFICIENCY_LABELS[newProficiency - 1]}
                  </span>
                </div>
                <Slider
                  value={[newProficiency]}
                  onValueChange={([value]) => setNewProficiency(value)}
                  min={1}
                  max={5}
                  step={1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Beginner</span>
                  <span>Expert</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddSkill}
                disabled={!newSkillName.trim() || addSkill.isPending}
              >
                {addSkill.isPending ? 'Adding...' : 'Add Skill'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{typedSkills.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Expert Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{skillsByLevel[5] || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Advanced</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{skillsByLevel[4] || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Intermediate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{skillsByLevel[3] || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Skills Table */}
      <Card>
        <CardHeader>
          <CardTitle>Skills List</CardTitle>
          <CardDescription>
            Your registered skills and current proficiency levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          {typedSkills.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No skills registered</h3>
              <p className="text-muted-foreground mb-4">
                Add your skills to help match you with relevant phases.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Your First Skill
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Skill</TableHead>
                  <TableHead>Proficiency</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typedSkills.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell className="font-medium">{skill.skill_name}</TableCell>
                    <TableCell>{getProficiencyBadge(skill.proficiency_level)}</TableCell>
                    <TableCell>
                      <ProficiencyStars level={skill.proficiency_level} />
                    </TableCell>
                    <TableCell>
                      {new Date(skill.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingSkill(skill);
                            setEditProficiency(skill.proficiency_level || 1);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeletingSkill(skill)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Proficiency Dialog */}
      <Dialog open={!!editingSkill} onOpenChange={() => setEditingSkill(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Proficiency</DialogTitle>
            <DialogDescription>
              Update your proficiency level for {editingSkill?.skill_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label>Proficiency Level</Label>
                <span className="text-sm font-medium">
                  {PROFICIENCY_LABELS[editProficiency - 1]}
                </span>
              </div>
              <Slider
                value={[editProficiency]}
                onValueChange={([value]) => setEditProficiency(value)}
                min={1}
                max={5}
                step={1}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Beginner</span>
                <span>Expert</span>
              </div>
              <div className="flex justify-center pt-2">
                <ProficiencyStars level={editProficiency} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSkill(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProficiency} disabled={updateSkill.isPending}>
              {updateSkill.isPending ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingSkill} onOpenChange={() => setDeletingSkill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Skill?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deletingSkill?.skill_name}</strong> from
              your skills? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveSkill}
              className="bg-destructive hover:bg-destructive/90"
              disabled={removeSkill.isPending}
            >
              {removeSkill.isPending ? 'Removing...' : 'Remove Skill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
