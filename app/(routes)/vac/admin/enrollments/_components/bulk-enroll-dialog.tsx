'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Users,
  Upload,
  CheckCircle2,
  AlertCircle,
  Search,
  UserPlus,
} from 'lucide-react';
import { useVACCourses, useEligibleLearners, useBulkEnroll } from '@/hooks/vac/use-vac';
import type { BulkEnrollmentResult } from '@/types/vac';

interface BulkEnrollDialogProps {
  institutionId: string;
  programmes: { id: string; program_name: string }[];
  semesters: { id: string; semester_name: string }[];
  sections: { id: string; section_name: string }[];
}

export function BulkEnrollDialog({
  institutionId,
  programmes,
  semesters,
  sections,
}: BulkEnrollDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'review' | 'result'>('select');

  // Step 1: Selection state
  const [selectedCourseId, setSelectedCourseId] = useState('');
  // Radix Select requires non-empty string values — use 'all' sentinel.
  const [selectedProgramme, setSelectedProgramme] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [waiveFee, setWaiveFee] = useState(false);

  // Step 2: Learner selection state
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<Set<string>>(new Set());
  const [learnerSearch, setLearnerSearch] = useState('');

  // Step 3: Result
  const [result, setResult] = useState<BulkEnrollmentResult | null>(null);

  // Data hooks
  const { data: coursesData } = useVACCourses({
    institution_id: institutionId,
    is_active: true,
    limit: 200,
  });

  const filters = useMemo(
    () => ({
      programme_id: selectedProgramme !== 'all' ? selectedProgramme : undefined,
      semester_id: selectedSemester !== 'all' ? selectedSemester : undefined,
      section_id: selectedSection !== 'all' ? selectedSection : undefined,
    }),
    [selectedProgramme, selectedSemester, selectedSection]
  );

  const {
    data: eligibleLearners,
    isLoading: learnersLoading,
  } = useEligibleLearners(
    selectedCourseId,
    institutionId,
    filters
  );

  const bulkEnrollMutation = useBulkEnroll();

  // Filter learners by search
  const filteredLearners = useMemo(() => {
    if (!eligibleLearners) return [];
    if (!learnerSearch) return eligibleLearners;
    const q = learnerSearch.toLowerCase();
    return eligibleLearners.filter(
      (l) =>
        l.first_name.toLowerCase().includes(q) ||
        l.last_name.toLowerCase().includes(q) ||
        (l.roll_number && l.roll_number.toLowerCase().includes(q))
    );
  }, [eligibleLearners, learnerSearch]);

  const newLearners = filteredLearners.filter((l) => !l.already_enrolled);
  const alreadyEnrolledCount = filteredLearners.filter((l) => l.already_enrolled).length;

  // Handlers
  const handleSelectAll = () => {
    const allNew = newLearners.map((l) => l.id);
    setSelectedLearnerIds(new Set(allNew));
  };

  const handleDeselectAll = () => {
    setSelectedLearnerIds(new Set());
  };

  const handleToggleLearner = (id: string) => {
    const next = new Set(selectedLearnerIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedLearnerIds(next);
  };

  const handleProceedToReview = () => {
    if (selectedLearnerIds.size === 0) return;
    setStep('review');
  };

  const handleConfirmEnroll = async () => {
    const res = await bulkEnrollMutation.mutateAsync({
      course_id: selectedCourseId,
      user_ids: Array.from(selectedLearnerIds),
      waive_fee: waiveFee,
    });
    setResult(res);
    setStep('result');
  };

  const handleClose = () => {
    setOpen(false);
    // Reset after animation
    setTimeout(() => {
      setStep('select');
      setSelectedCourseId('');
      setSelectedProgramme('all');
      setSelectedSemester('all');
      setSelectedSection('all');
      setWaiveFee(false);
      setSelectedLearnerIds(new Set());
      setLearnerSearch('');
      setResult(null);
    }, 200);
  };

  const selectedCourse = coursesData?.data?.find((c) => c.id === selectedCourseId);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Bulk Enroll
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        {/* ── STEP 1: SELECT COURSE + FILTERS ── */}
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>Bulk Enrollment</DialogTitle>
              <DialogDescription>
                Select a course and filter learners by programme, semester, or section to enroll them.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Course Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Course *</Label>
                <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course to enroll learners in" />
                  </SelectTrigger>
                  <SelectContent>
                    {(coursesData?.data || []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name} ({c.track}) — ₹{c.fee}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filter Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Programme</Label>
                  <Select value={selectedProgramme} onValueChange={setSelectedProgramme}>
                    <SelectTrigger>
                      <SelectValue placeholder="All programmes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Programmes</SelectItem>
                      {programmes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.program_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Semester</Label>
                  <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                    <SelectTrigger>
                      <SelectValue placeholder="All semesters" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Semesters</SelectItem>
                      {semesters.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.semester_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Section</Label>
                  <Select value={selectedSection} onValueChange={setSelectedSection}>
                    <SelectTrigger>
                      <SelectValue placeholder="All sections" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.section_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Waive Fee Toggle */}
              {selectedCourse && Number(selectedCourse.fee) > 0 && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Waive Course Fee</Label>
                    <p className="text-xs text-muted-foreground">
                      Course fee: ₹{selectedCourse.fee}. Toggle to waive for all enrolled learners.
                    </p>
                  </div>
                  <Switch checked={waiveFee} onCheckedChange={setWaiveFee} />
                </div>
              )}

              {/* Learner List */}
              {selectedCourseId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Eligible Learners
                        {eligibleLearners && (
                          <span className="text-muted-foreground ml-1">
                            ({newLearners.length} new, {alreadyEnrolledCount} already enrolled)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleSelectAll}>
                        Select All ({newLearners.length})
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or roll number..."
                      value={learnerSearch}
                      onChange={(e) => setLearnerSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <div className="border rounded-lg max-h-64 overflow-y-auto">
                    {learnersLoading ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : filteredLearners.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        No eligible learners found for the selected filters.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="p-2 w-8"></th>
                            <th className="p-2 text-left">Roll No.</th>
                            <th className="p-2 text-left">Name</th>
                            <th className="p-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLearners.map((learner) => (
                            <tr
                              key={learner.id}
                              className={`border-t ${learner.already_enrolled ? 'opacity-50' : 'hover:bg-muted/30 cursor-pointer'}`}
                              onClick={() =>
                                !learner.already_enrolled && handleToggleLearner(learner.id)
                              }
                            >
                              <td className="p-2">
                                <Checkbox
                                  checked={selectedLearnerIds.has(learner.id)}
                                  disabled={learner.already_enrolled}
                                  onCheckedChange={() => handleToggleLearner(learner.id)}
                                />
                              </td>
                              <td className="p-2 font-mono text-xs">
                                {learner.roll_number || '—'}
                              </td>
                              <td className="p-2">
                                {learner.first_name} {learner.last_name}
                              </td>
                              <td className="p-2">
                                {learner.already_enrolled ? (
                                  <Badge variant="secondary" className="text-xs">
                                    Already Enrolled
                                  </Badge>
                                ) : selectedLearnerIds.has(learner.id) ? (
                                  <Badge className="text-xs bg-blue-600">Selected</Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Available</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleProceedToReview}
                disabled={selectedLearnerIds.size === 0 || !selectedCourseId}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Review ({selectedLearnerIds.size} selected)
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 2: REVIEW & CONFIRM ── */}
        {step === 'review' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Bulk Enrollment</DialogTitle>
              <DialogDescription>Review the enrollment details before confirming.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Course:</span>
                      <p className="font-medium">
                        {selectedCourse?.code} — {selectedCourse?.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Track:</span>
                      <p>
                        <Badge variant="outline">{selectedCourse?.track}</Badge>
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Learners to Enroll:</span>
                      <p className="font-medium text-lg">{selectedLearnerIds.size}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Payment:</span>
                      <p className="font-medium">
                        {waiveFee || Number(selectedCourse?.fee || 0) === 0 ? (
                          <Badge className="bg-green-600">Fee Waived</Badge>
                        ) : (
                          <span>₹{selectedCourse?.fee} per learner (pending)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {!waiveFee && Number(selectedCourse?.fee || 0) > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-sm text-amber-600 dark:text-amber-400">
                      Learners will need to pay ₹{selectedCourse?.fee} each via the billing module to unlock course content.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Selected learner preview */}
              <div className="text-sm text-muted-foreground">
                Selected learners:
                <span className="font-medium text-foreground ml-1">
                  {Array.from(selectedLearnerIds)
                    .slice(0, 5)
                    .map((id) => {
                      const l = eligibleLearners?.find((x) => x.id === id);
                      return l ? `${l.first_name} ${l.last_name}` : id;
                    })
                    .join(', ')}
                  {selectedLearnerIds.size > 5 && ` +${selectedLearnerIds.size - 5} more`}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button
                onClick={handleConfirmEnroll}
                disabled={bulkEnrollMutation.isPending}
              >
                {bulkEnrollMutation.isPending ? (
                  <>Enrolling {selectedLearnerIds.size} learners...</>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm Enrollment
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 3: RESULT ── */}
        {step === 'result' && result && (
          <>
            <DialogHeader>
              <DialogTitle>Enrollment Complete</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{result.enrolled_count}</p>
                    <p className="text-xs text-muted-foreground">Enrolled</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">
                      {result.already_enrolled}
                    </p>
                    <p className="text-xs text-muted-foreground">Already Enrolled</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-amber-600">{result.skipped_count}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </CardContent>
                </Card>
              </div>

              {result.enrolled_count > 0 && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-md p-3 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Successfully enrolled {result.enrolled_count} learner(s) in{' '}
                  {selectedCourse?.name}.
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {result.errors.length} enrollment(s) failed:
                  </div>
                  <div className="border rounded-lg max-h-32 overflow-y-auto p-2 text-xs">
                    {result.errors.map((err, i) => (
                      <div key={i} className="py-1">
                        {err.name || err.user_id}: {err.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
