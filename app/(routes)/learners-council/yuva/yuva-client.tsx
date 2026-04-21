'use client';

/**
 * YUVA Client - Interactive chapters/verticals management
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Building2,
  Layers,
  Plus,
  Users,
  UserPlus,
  UserMinus,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  useCreateChapter,
  useVerticalMembers,
  useCreateVertical,
  useUpdateVertical,
  useAssignVerticalMember,
  useRemoveVerticalMember
} from '@/hooks/learners-council/use-lc-structure';
// Types used via inline casting where needed

const roleLabels: Record<string, string> = {
  chapter_chair: 'Chapter Chair',
  chapter_co_chair: 'Chapter Co-Chair',
  stakeholder_chair: 'Stakeholder Chair',
  stakeholder_co_chair: 'Stakeholder Co-Chair',
  vertical_chair: 'Vertical Chair',
  vertical_co_chair: 'Vertical Co-Chair'
};

const roleColors: Record<string, string> = {
  chapter_chair: 'bg-amber-100 text-amber-800',
  chapter_co_chair: 'bg-amber-50 text-amber-700',
  stakeholder_chair: 'bg-purple-100 text-purple-800',
  stakeholder_co_chair: 'bg-purple-50 text-purple-700',
  vertical_chair: 'bg-blue-100 text-blue-800',
  vertical_co_chair: 'bg-blue-50 text-blue-700'
};

interface YUVAClientProps {
  initialChapters: any[];
  initialVerticals: any[];
  institutions: { id: string; name: string }[];
  isStaffOrAdmin: boolean;
}

export function YUVAClient({
  initialChapters,
  initialVerticals,
  institutions,
  isStaffOrAdmin
}: YUVAClientProps) {
  const [expandedChapter, setExpandedChapter] = useState<string | null>(
    initialChapters.length > 0 ? initialChapters[0].id : null
  );

  return (
    <div className="space-y-6">
      {/* Actions Bar */}
      {isStaffOrAdmin && (
        <div className="flex flex-wrap gap-2">
          <CreateChapterDialog institutions={institutions} />
          <CreateVerticalDialog />
        </div>
      )}

      {/* Verticals Reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            YUVA Verticals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {initialVerticals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {initialVerticals.map((v: any) => (
                <Badge
                  key={v.id}
                  variant="outline"
                  className={`text-xs ${v.type === 'stakeholder' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'} ${!v.is_active ? 'opacity-50' : ''}`}
                >
                  {v.icon && <span className="mr-1">{v.icon}</span>}
                  {v.name}
                  <span className="ml-1 text-[10px] opacity-60">({v.type})</span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No verticals configured yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Chapters List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          Institution Chapters ({initialChapters.length})
        </h2>

        {initialChapters.length > 0 ? (
          initialChapters.map((chapter: any) => (
            <ChapterCard
              key={chapter.id}
              chapter={chapter}
              verticals={initialVerticals}
              isExpanded={expandedChapter === chapter.id}
              onToggle={() => setExpandedChapter(expandedChapter === chapter.id ? null : chapter.id)}
              isStaffOrAdmin={isStaffOrAdmin}
            />
          ))
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <h3 className="font-medium text-lg">No YUVA chapters yet</h3>
              <p className="text-sm mt-1">Create chapters for each institution to assign vertical leaders.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CHAPTER CARD (expandable)
// ============================================================================

function ChapterCard({
  chapter,
  verticals,
  isExpanded,
  onToggle,
  isStaffOrAdmin
}: {
  chapter: any;
  verticals: any[];
  isExpanded: boolean;
  onToggle: () => void;
  isStaffOrAdmin: boolean;
}) {
  const { data: members, isLoading } = useVerticalMembers(isExpanded ? chapter.id : '');

  // Group members by vertical
  const membersByVertical: Record<string, any[]> = {};
  if (members) {
    for (const m of members) {
      const vId = m.vertical_id;
      if (!membersByVertical[vId]) membersByVertical[vId] = [];
      membersByVertical[vId].push(m);
    }
  }

  // Chapter-level members (chair/co-chair not tied to a specific vertical)
  const chapterLeaders = members?.filter(
    (m: any) => m.role === 'chapter_chair' || m.role === 'chapter_co_chair'
  ) || [];

  return (
    <Card className={isExpanded ? 'border-blue-200' : ''}>
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold">{chapter.name}</h3>
            <p className="text-sm text-muted-foreground">
              {chapter.institution?.name || 'Unknown Institution'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{chapter.academic_year}</Badge>
          {chapter.is_active && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Active</Badge>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading members...</div>
          ) : (
            <>
              {/* Chapter Leaders */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Chapter Leadership</h4>
                  {isStaffOrAdmin && (
                    <AssignVerticalMemberDialog
                      chapterId={chapter.id}
                      verticals={verticals}
                      roleFilter={['chapter_chair', 'chapter_co_chair']}
                      academicYear={chapter.academic_year}
                    />
                  )}
                </div>
                {chapterLeaders.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {chapterLeaders.map((m: any) => (
                      <MemberChip key={m.id} member={m} chapterId={chapter.id} isStaffOrAdmin={isStaffOrAdmin} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No chapter leaders assigned.</p>
                )}
              </div>

              {/* Verticals with Members */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-muted-foreground">Verticals & Stakeholders</h4>
                  {isStaffOrAdmin && (
                    <AssignVerticalMemberDialog
                      chapterId={chapter.id}
                      verticals={verticals}
                      roleFilter={['stakeholder_chair', 'stakeholder_co_chair', 'vertical_chair', 'vertical_co_chair']}
                      academicYear={chapter.academic_year}
                    />
                  )}
                </div>
                {verticals.filter((v: any) => v.is_active).map((vertical: any) => {
                  const vMembers = membersByVertical[vertical.id] || [];
                  return (
                    <div key={vertical.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        {vertical.icon && <span className="text-sm">{vertical.icon}</span>}
                        <span className="font-medium text-sm">{vertical.name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {vertical.type}
                        </Badge>
                      </div>
                      {vMembers.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {vMembers.map((m: any) => (
                            <MemberChip key={m.id} member={m} chapterId={chapter.id} isStaffOrAdmin={isStaffOrAdmin} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No members assigned.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// MEMBER CHIP (with remove action)
// ============================================================================

function MemberChip({ member, chapterId, isStaffOrAdmin }: { member: any; chapterId: string; isStaffOrAdmin: boolean }) {
  const removeMember = useRemoveVerticalMember();

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary shrink-0">
        {member.user?.full_name?.charAt(0) || '?'}
      </div>
      <span className="font-medium">{member.user?.full_name || 'Unknown'}</span>
      <Badge className={`text-[10px] px-1 py-0 ${roleColors[member.role] || 'bg-gray-100 text-gray-700'}`}>
        {roleLabels[member.role] || member.role}
      </Badge>
      {isStaffOrAdmin && (
        <button
          onClick={() => removeMember.mutate({ id: member.id, chapterId })}
          disabled={removeMember.isPending}
          className="ml-0.5 text-muted-foreground hover:text-red-500 transition-colors"
          title="Remove member"
        >
          <UserMinus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// CREATE CHAPTER DIALOG
// ============================================================================

function CreateChapterDialog({ institutions }: { institutions: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [description, setDescription] = useState('');
  const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());

  const createChapter = useCreateChapter();

  const handleSubmit = async () => {
    if (!name || !institutionId || !academicYear) return;

    await createChapter.mutateAsync({
      institution_id: institutionId,
      name,
      description: description || undefined,
      academic_year: academicYear
    });

    setName('');
    setInstitutionId('');
    setDescription('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Chapter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create YUVA Chapter</DialogTitle>
          <DialogDescription>
            Create a new YUVA chapter for an institution.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Chapter Name</Label>
            <Input
              placeholder="e.g., YUVA JKKN Dental"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Academic Year</Label>
            <Input
              placeholder="e.g., 2025-26"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="Chapter description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name || !institutionId || createChapter.isPending}>
            {createChapter.isPending ? 'Creating...' : 'Create Chapter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// CREATE VERTICAL DIALOG
// ============================================================================

function CreateVerticalDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'stakeholder' | 'vertical'>('vertical');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');

  const createVertical = useCreateVertical();

  const handleSubmit = async () => {
    if (!name) return;

    await createVertical.mutateAsync({
      name,
      type,
      description: description || undefined,
      icon: icon || undefined
    });

    setName('');
    setType('vertical');
    setDescription('');
    setIcon('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Vertical
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create YUVA Vertical</DialogTitle>
          <DialogDescription>
            Verticals are shared across all chapters. Stakeholders are fixed categories, verticals are configurable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input
              placeholder="e.g., Sports, Cultural, Innovation"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'stakeholder' | 'vertical')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stakeholder">Stakeholder (fixed)</SelectItem>
                <SelectItem value="vertical">Vertical (configurable)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Icon (optional emoji)</Label>
            <Input
              placeholder="e.g., one emoji"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What this vertical covers..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name || createVertical.isPending}>
            {createVertical.isPending ? 'Creating...' : 'Create Vertical'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ASSIGN VERTICAL MEMBER DIALOG
// ============================================================================

function AssignVerticalMemberDialog({
  chapterId,
  verticals,
  roleFilter,
  academicYear
}: {
  chapterId: string;
  verticals: any[];
  roleFilter: string[];
  academicYear: string;
}) {
  const [open, setOpen] = useState(false);
  const [verticalId, setVerticalId] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');

  const assignMember = useAssignVerticalMember();

  const handleSubmit = async () => {
    if (!verticalId || !userId || !role) return;

    await assignMember.mutateAsync({
      chapter_id: chapterId,
      vertical_id: verticalId,
      user_id: userId,
      role,
      academic_year: academicYear
    });

    setVerticalId('');
    setUserId('');
    setRole('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <UserPlus className="h-3 w-3 mr-1" />
          Assign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Vertical Member</DialogTitle>
          <DialogDescription>
            Assign a learner as chair or co-chair of a vertical in this chapter.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Vertical</Label>
            <Select value={verticalId} onValueChange={setVerticalId}>
              <SelectTrigger><SelectValue placeholder="Select vertical" /></SelectTrigger>
              <SelectContent>
                {verticals.filter((v: any) => v.is_active).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} ({v.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {roleFilter.map((r) => (
                  <SelectItem key={r} value={r}>{roleLabels[r] || r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Learner User ID</Label>
            <Input
              placeholder="Enter the learner's user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The UUID of the learner from the profiles table
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!verticalId || !userId || !role || assignMember.isPending}>
            {assignMember.isPending ? 'Assigning...' : 'Assign Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Academic year starts in June
  if (month >= 5) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  }
  return `${year - 1}-${year.toString().slice(2)}`;
}
