'use client';

// Created: 2025-10-11
// Subdivision Configuration Dialog - Configure student groups for practical classes

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SubdivisionGroup,
  SubdivisionType,
  SubdivisionMode,
  SubdivisionConfig,
  Timetable
} from '@/types/academics';
import {
  validateSubdivisionAssignments,
  createDefaultSubdivisionGroups,
  calculateDistributionStats,
  rebalanceGroups
} from '@/lib/utils/subdivision-validation';
import { SubdivisionGroupCard } from './subdivision-group-card';

interface SubdivisionConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: SubdivisionConfig) => void;
  sectionId: string;
  courseId?: string; // Optional - for backward compatibility
  availableCourses: Array<{ id: string; course_name: string; course_code: string }>; // Updated: 2025-10-11 - Allow course selection per group
  subdivisionType: SubdivisionType;
  subdivisionMode: SubdivisionMode;
  allStudents: Array<{ id: string; first_name: string; last_name: string; roll_number: string }>;
  availableStaff: Array<{ id: string; first_name: string; last_name: string; staff_id: string }>;
  existingConfig?: SubdivisionConfig; // For editing existing subdivision
  timetable: Timetable | null; // Updated: 2025-10-13 - Added for staff planning context
}

export function SubdivisionConfigDialog({
  isOpen,
  onClose,
  onSave,
  sectionId,
  courseId,
  availableCourses,
  subdivisionType,
  subdivisionMode,
  allStudents,
  availableStaff,
  existingConfig,
  timetable
}: SubdivisionConfigDialogProps) {
  const [groupCount, setGroupCount] = useState(existingConfig?.group_count || 2);
  const [groups, setGroups] = useState<SubdivisionGroup[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [hasLoadedExistingConfig, setHasLoadedExistingConfig] = useState(false);

  // Initialize groups when dialog opens or group count changes
  // Updated: 2025-10-13 - Fixed to not overwrite existing config when props change
  useEffect(() => {
    if (isOpen) {
      if (existingConfig && !hasLoadedExistingConfig) {
        // Load existing configuration ONCE
        console.log('[subdivision-config-dialog] Loading existingConfig:', existingConfig);
        console.log('[subdivision-config-dialog] Groups to load:', existingConfig.groups);
        setGroups(existingConfig.groups);
        setGroupCount(existingConfig.group_count);
        setHasLoadedExistingConfig(true);
      } else if (!existingConfig && !hasLoadedExistingConfig && subdivisionMode === 'auto') {
        // Auto-generate groups with even distribution
        // Updated: 2025-10-11 - Use empty course_id, let user select per group
        const studentIds = allStudents.map((s) => s.id);
        const autoGroups = createDefaultSubdivisionGroups(
          studentIds,
          groupCount,
          '', // Empty course_id - will be selected per group
          subdivisionType
        );
        setGroups(autoGroups);
      } else if (!existingConfig && !hasLoadedExistingConfig) {
        // Manual mode: Create empty groups (only if no existing config was loaded)
        // Updated: 2025-10-13 - Fixed to not overwrite loaded groups
        console.log('[subdivision-config-dialog] Creating new empty groups (no existing config)');
        const emptyGroups: SubdivisionGroup[] = Array.from({ length: groupCount }, (_, i) => ({
          group_order: i + 1,
          group_name: `Group ${String.fromCharCode(65 + i)} - ${subdivisionType.charAt(0).toUpperCase() + subdivisionType.slice(1)} ${i + 1}`,
          course_id: '', // Empty - user selects per group
          staff_ids: [],
          student_ids: [],
          lab_room: '',
          max_capacity: undefined
        }));
        setGroups(emptyGroups);
      } else if (hasLoadedExistingConfig) {
        // Config already loaded, skip re-initialization
        console.log('[subdivision-config-dialog] Skipping initialization - existing config already loaded, groups count:', groups.length);
      }
    }
  }, [isOpen, groupCount, subdivisionMode, existingConfig, allStudents, subdivisionType, hasLoadedExistingConfig, groups.length]);

  // Reset the flag when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setHasLoadedExistingConfig(false);
    }
  }, [isOpen]);

  // Validate assignments whenever groups change
  useEffect(() => {
    if (groups.length > 0 && allStudents.length > 0) {
      const studentIds = allStudents.map((s) => s.id);
      const result = validateSubdivisionAssignments(groups, studentIds);
      setValidationResult(result);
    }
  }, [groups, allStudents]);

  const handleGroupCountChange = (newCount: number) => {
    if (newCount < 2 || newCount > 10) return;
    setGroupCount(newCount);

    if (subdivisionMode === 'auto') {
      // Regenerate groups with new count
      // Updated: 2025-10-11 - Use empty course_id, let user select per group
      const studentIds = allStudents.map((s) => s.id);
      const autoGroups = createDefaultSubdivisionGroups(
        studentIds,
        newCount,
        '', // Empty course_id - will be selected per group
        subdivisionType
      );
      setGroups(autoGroups);
    } else {
      // Add or remove groups manually
      if (newCount > groups.length) {
        // Add new empty groups
        // Updated: 2025-10-11 - Use empty course_id, let user select per group
        const newGroups = [...groups];
        for (let i = groups.length; i < newCount; i++) {
          newGroups.push({
            group_order: i + 1,
            group_name: `Group ${String.fromCharCode(65 + i)} - ${subdivisionType.charAt(0).toUpperCase() + subdivisionType.slice(1)} ${i + 1}`,
            course_id: '', // Empty - user selects per group
            staff_ids: [],
            student_ids: [],
            lab_room: '',
            max_capacity: undefined
          });
        }
        setGroups(newGroups);
      } else {
        // Remove groups from end
        setGroups(groups.slice(0, newCount));
      }
    }
  };

  const handleUpdateGroup = (groupOrder: number, updates: Partial<SubdivisionGroup>) => {
    setGroups(groups.map(g =>
      g.group_order === groupOrder ? { ...g, ...updates } : g
    ));
  };

  const handleRebalance = () => {
    const studentIds = allStudents.map((s) => s.id);
    const rebalanced = rebalanceGroups(groups, studentIds);
    setGroups(rebalanced);
  };

  const handleSave = () => {
    setShowValidation(true);

    if (!validationResult?.isValid) {
      return;
    }

    // Updated: 2025-10-11 - course_id is now per-group, not at config level
    const config: SubdivisionConfig = {
      section_id: sectionId,
      course_id: courseId || groups[0]?.course_id || '', // Use first group's course or empty
      group_count: groupCount,
      groups: groups,
      subdivision_type: subdivisionType,
      subdivision_mode: subdivisionMode
    };

    onSave(config);
    onClose();
  };

  const stats = groups.length > 0 ? calculateDistributionStats(groups) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='max-w-6xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            Configure {subdivisionType.charAt(0).toUpperCase() + subdivisionType.slice(1)} Groups
            <Badge variant='secondary' className='text-xs bg-purple-100 text-purple-800 border-purple-300'>
              {allStudents.length} Students
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Configure student groups for {subdivisionType} sessions. Students will be assigned to specific groups for this period only.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {/* Group Count & Stats */}
          <div className='flex items-center justify-between border rounded-lg p-4 bg-slate-50 dark:bg-slate-900'>
            <div className='space-y-2'>
              <Label>Number of Groups</Label>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleGroupCountChange(groupCount - 1)}
                  disabled={groupCount <= 2}
                >
                  -
                </Button>
                <Input
                  type='number'
                  value={groupCount}
                  onChange={(e) => handleGroupCountChange(parseInt(e.target.value) || 2)}
                  className='w-20 text-center'
                  min={2}
                  max={10}
                />
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handleGroupCountChange(groupCount + 1)}
                  disabled={groupCount >= 10}
                >
                  +
                </Button>
              </div>
            </div>

            {stats && (
              <div className='flex items-center gap-4 text-sm'>
                <div className='text-center'>
                  <div className='text-xs text-muted-foreground'>Avg per group</div>
                  <div className='font-semibold'>{stats.averageGroupSize.toFixed(1)}</div>
                </div>
                <div className='text-center'>
                  <div className='text-xs text-muted-foreground'>Range</div>
                  <div className='font-semibold'>{stats.minGroupSize} - {stats.maxGroupSize}</div>
                </div>
                <div className='text-center'>
                  <div className='text-xs text-muted-foreground'>Balance</div>
                  <Badge variant={stats.isBalanced ? 'default' : 'secondary'} className='text-xs'>
                    {stats.isBalanced ? '✓ Balanced' : '⚠ Uneven'}
                  </Badge>
                </div>
                {!stats.isBalanced && subdivisionMode === 'manual' && (
                  <Button variant='outline' size='sm' onClick={handleRebalance}>
                    Rebalance
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Validation Messages */}
          {showValidation && validationResult && !validationResult.isValid && (
            <Alert variant='destructive'>
              <AlertDescription>
                {validationResult.message}
                {validationResult.duplicates.length > 0 && (
                  <div className='mt-2'>
                    <strong>Students assigned to multiple groups:</strong>
                    <ul className='ml-4 mt-1 text-xs'>
                      {validationResult.duplicates.slice(0, 5).map((studentId: string) => {
                        const student = allStudents.find(s => s.id === studentId);
                        return (
                          <li key={studentId}>
                            {student?.first_name} {student?.last_name} ({student?.roll_number})
                          </li>
                        );
                      })}
                      {validationResult.duplicates.length > 5 && (
                        <li>... and {validationResult.duplicates.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {validationResult.missing.length > 0 && (
                  <div className='mt-2'>
                    <strong>Students not assigned to any group:</strong>
                    <ul className='ml-4 mt-1 text-xs'>
                      {validationResult.missing.slice(0, 5).map((studentId: string) => {
                        const student = allStudents.find(s => s.id === studentId);
                        return (
                          <li key={studentId}>
                            {student?.first_name} {student?.last_name} ({student?.roll_number})
                          </li>
                        );
                      })}
                      {validationResult.missing.length > 5 && (
                        <li>... and {validationResult.missing.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {showValidation && validationResult?.isValid && (
            <Alert className='border-green-200 bg-green-50 dark:bg-green-900/20'>
              <AlertDescription className='text-green-800 dark:text-green-200'>
                {validationResult.message}
              </AlertDescription>
            </Alert>
          )}

          {validationResult?.warnings && validationResult.warnings.length > 0 && (
            <Alert className='border-amber-200 bg-amber-50 dark:bg-amber-900/20'>
              <AlertDescription className='text-amber-800 dark:text-amber-200'>
                <strong>Warnings:</strong>
                <ul className='ml-4 mt-1 text-xs'>
                  {validationResult.warnings.map((warning: string, i: number) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Group Cards */}
          <ScrollArea className='h-[400px] pr-4'>
            <div className='space-y-4'>
              {groups.map((group) => {
                // Updated: 2025-10-11 - Calculate students assigned to OTHER groups for better UX
                const studentsInOtherGroups = groups
                  .filter((g) => g.group_order !== group.group_order)
                  .flatMap((g) => g.student_ids);

                return (
                  <SubdivisionGroupCard
                    key={group.group_order}
                    group={group}
                    allStudents={allStudents}
                    studentsInOtherGroups={studentsInOtherGroups}
                    availableStaff={availableStaff}
                    availableCourses={availableCourses}
                    onUpdate={(updates) => handleUpdateGroup(group.group_order, updates)}
                    subdivisionMode={subdivisionMode}
                    timetable={timetable}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={showValidation && !validationResult?.isValid}>
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
