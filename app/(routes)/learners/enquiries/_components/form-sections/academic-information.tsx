// ============================================
// ACADEMIC INFORMATION FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Added conditional rendering for counseling number
// Purpose: Education history and marks details with auto-calculations
// Changes: Counseling number now shows only when "Applied for Counseling?" is Yes
//          Quota & Category fields moved to Course Selection tab
// ============================================

import { useEffect } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AcademicInformationProps {
  form: UseFormReturn<any>;
}

export function AcademicInformationSection({ form }: AcademicInformationProps) {
  // ============================================
  // AUTO-CALCULATION: 10th Marks Percentage
  // ============================================
  const tenthMaxMarks = useWatch({ control: form.control, name: 'tenth_marks.max_marks' });
  const tenthObtainedMarks = useWatch({ control: form.control, name: 'tenth_marks.obtained_marks' });

  useEffect(() => {
    if (tenthObtainedMarks && tenthMaxMarks && Number(tenthMaxMarks) > 0) {
      const percentage = ((Number(tenthObtainedMarks) / Number(tenthMaxMarks)) * 100).toFixed(2);
      form.setValue('tenth_marks.percentage', percentage);
    } else {
      form.setValue('tenth_marks.percentage', '');
    }
  }, [tenthObtainedMarks, tenthMaxMarks, form]);

  // ============================================
  // AUTO-CALCULATION: 12th Marks Percentage
  // ============================================
  const twelfthMaxMarks = useWatch({ control: form.control, name: 'twelfth_marks.max_marks' });
  const twelfthObtainedMarks = useWatch({ control: form.control, name: 'twelfth_marks.obtained_marks' });

  useEffect(() => {
    if (twelfthObtainedMarks && twelfthMaxMarks && Number(twelfthMaxMarks) > 0) {
      const percentage = ((Number(twelfthObtainedMarks) / Number(twelfthMaxMarks)) * 100).toFixed(2);
      form.setValue('twelfth_marks.percentage', percentage);
    } else {
      form.setValue('twelfth_marks.percentage', '');
    }
  }, [twelfthObtainedMarks, twelfthMaxMarks, form]);

  // ============================================
  // AUTO-CALCULATION: Cutoff Marks
  // ============================================
  const physicsMarks = useWatch({ control: form.control, name: 'twelfth_marks.subjects.physics' });
  const chemistryMarks = useWatch({ control: form.control, name: 'twelfth_marks.subjects.chemistry' });
  const mathsMarks = useWatch({ control: form.control, name: 'twelfth_marks.subjects.mathematics' });
  const biologyMarks = useWatch({ control: form.control, name: 'twelfth_marks.subjects.biology' });
  const botanyMarks = useWatch({ control: form.control, name: 'twelfth_marks.subjects.botany' });
  const zoologyMarks = useWatch({ control: form.control, name: 'twelfth_marks.subjects.zoology' });

  useEffect(() => {
    // Engineering Cutoff: ((Physics + Chemistry) / 2) + Mathematics
    if (physicsMarks && chemistryMarks && mathsMarks) {
      const engineeringCutoff = (
        (Number(physicsMarks) + Number(chemistryMarks)) / 2 + Number(mathsMarks)
      ).toFixed(2);
      form.setValue('engineering_cutoff_marks', engineeringCutoff);
    } else {
      form.setValue('engineering_cutoff_marks', '');
    }

    // Medical Cutoff (Biology): ((Physics + Chemistry) / 2) + Biology
    if (physicsMarks && chemistryMarks && biologyMarks) {
      const medicalCutoff = (
        (Number(physicsMarks) + Number(chemistryMarks)) / 2 + Number(biologyMarks)
      ).toFixed(2);
      form.setValue('medical_cutoff_marks', medicalCutoff);
    }
    // Medical Cutoff (Botany + Zoology): ((Physics + Chemistry) / 2) + Botany + (Zoology / 2)
    else if (physicsMarks && chemistryMarks && botanyMarks && zoologyMarks) {
      const medicalCutoff = (
        (Number(physicsMarks) + Number(chemistryMarks)) / 2 +
        Number(botanyMarks) +
        Number(zoologyMarks) / 2
      ).toFixed(2);
      form.setValue('medical_cutoff_marks', medicalCutoff);
    } else {
      form.setValue('medical_cutoff_marks', '');
    }
  }, [physicsMarks, chemistryMarks, mathsMarks, biologyMarks, botanyMarks, zoologyMarks, form]);

  // ============================================
  // DYNAMIC SUBJECT FIELDS: Based on 12th Group
  // ============================================
  const twelfthGroup = useWatch({ control: form.control, name: 'twelfth_marks.group' });

  // Watch counseling_applied for conditional rendering
  const counselingApplied = useWatch({ control: form.control, name: 'counseling_applied' });

  // Render subject-specific fields based on selected group
  const renderSubjectFields = () => {
    switch (twelfthGroup) {
      case 'pcbm': // Physics, Chemistry, Biology, Mathematics
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.physics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Physics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.chemistry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Chemistry marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.biology"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biology Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Biology marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.mathematics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mathematics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Mathematics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case 'pccs': // Physics, Chemistry, Computer Science, Mathematics
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.physics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Physics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.chemistry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Chemistry marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.computer_science"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Computer Science Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Computer Science marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.mathematics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mathematics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Mathematics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case 'pcbz': // Physics, Chemistry, Botany, Zoology
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.physics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Physics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.chemistry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Chemistry marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.botany"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Botany Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Botany marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.zoology"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zoology Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Zoology marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case 'science': // Generic Science - show common subjects
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.physics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Physics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.chemistry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Chemistry marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.mathematics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mathematics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Mathematics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.biology"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biology Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Biology marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      case 'commerce': // Commerce stream
      case 'cseca': // Computer Science, Economics, Commerce, Accountancy
      case 'heca': // History, Economics, Commerce, Accountancy
      case 'seca': // Statistics, Economics, Commerce, Accountancy
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.accountancy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Accountancy Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Accountancy marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.commerce"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commerce Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Commerce marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.economics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Economics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Economics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {twelfthGroup === 'cseca' && (
              <FormField
                control={form.control}
                name="twelfth_marks.subjects.computer_science"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Computer Science Marks</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Computer Science marks" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {twelfthGroup === 'heca' && (
              <FormField
                control={form.control}
                name="twelfth_marks.subjects.history"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>History Marks</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="History marks" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {twelfthGroup === 'seca' && (
              <FormField
                control={form.control}
                name="twelfth_marks.subjects.statistics"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statistics Marks</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Statistics marks" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        );

      case 'arts': // Arts stream
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.history"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>History Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="History marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.geography"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Geography Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Geography marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="twelfth_marks.subjects.economics"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Economics Marks</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Economics marks" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        );

      default:
        // No specific group selected - show common subjects
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Last School Information */}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="last_school"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last School/College Attended</FormLabel>
              <FormControl>
                <Input placeholder="Enter school/college name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="board_of_study"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Board of Study</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select board" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="state_board">State Board</SelectItem>
                  <SelectItem value="cbse">CBSE</SelectItem>
                  <SelectItem value="icse">ICSE</SelectItem>
                  <SelectItem value="matriculation">Matriculation</SelectItem>
                  <SelectItem value="anglo_indian">Anglo Indian</SelectItem>
                  <SelectItem value="others">Others</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* 10th Standard Marks */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">10th Standard Marks</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="tenth_marks.max_marks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximum Marks</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 500" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tenth_marks.obtained_marks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obtained Marks</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 450" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tenth_marks.percentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Percentage</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 90" {...field} value={field.value || ''} readOnly />
                </FormControl>
                <FormDescription>Auto-calculated if marks entered</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* 12th Standard Marks */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">12th Standard / Diploma Marks</h3>
        <FormField
          control={form.control}
          name="twelfth_marks.group"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Group/Stream</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="science">Science (General)</SelectItem>
                  <SelectItem value="pcbm">PCBM (Physics, Chemistry, Biology, Mathematics)</SelectItem>
                  <SelectItem value="pccs">PCCS (Physics, Chemistry, Computer Science, Mathematics)</SelectItem>
                  <SelectItem value="pcbz">PCBZ (Physics, Chemistry, Botany, Zoology)</SelectItem>
                  <SelectItem value="commerce">Commerce (General)</SelectItem>
                  <SelectItem value="cseca">CSECA (Computer Science, Economics, Commerce, Accountancy)</SelectItem>
                  <SelectItem value="heca">HECA (History, Economics, Commerce, Accountancy)</SelectItem>
                  <SelectItem value="seca">SECA (Statistics, Economics, Commerce, Accountancy)</SelectItem>
                  <SelectItem value="arts">Arts</SelectItem>
                  <SelectItem value="vocational">Vocational</SelectItem>
                  <SelectItem value="diploma">Diploma</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="twelfth_marks.max_marks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximum Marks</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 600" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="twelfth_marks.obtained_marks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obtained Marks</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 540" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="twelfth_marks.percentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Percentage</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 90" {...field} value={field.value || ''} readOnly />
                </FormControl>
                <FormDescription>Auto-calculated if marks entered</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Dynamic Subject-wise Marks based on selected group */}
        {twelfthGroup && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-4">Subject-wise Marks</h4>
            {renderSubjectFields()}
            {twelfthGroup && (
              <FormDescription className="mt-2">
                Cutoff marks will be calculated automatically based on subject marks
              </FormDescription>
            )}
          </div>
        )}
      </div>

      {/* Competitive Exam Details */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Competitive Exam Details (if applicable)</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="neet_roll_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>NEET Roll Number</FormLabel>
                <FormControl>
                  <Input placeholder="Enter NEET roll number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="neet_score"
            render={({ field }) => (
              <FormItem>
                <FormLabel>NEET Score</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="Enter NEET score" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="medical_cutoff_marks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Medical Cutoff Marks</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="Enter cutoff marks" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="engineering_cutoff_marks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Engineering Cutoff Marks</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="Enter cutoff marks" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Counseling Information */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Counseling Information</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="counseling_applied"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Applied for Counseling?</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Counseling Number - Show only if counseling_applied is true */}
          {counselingApplied && (
            <FormField
              control={form.control}
              name="counseling_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Counseling Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter counseling number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="first_graduate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Graduate? <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === 'true')}
                  value={field.value === true ? 'true' : field.value === false ? 'false' : ''}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
