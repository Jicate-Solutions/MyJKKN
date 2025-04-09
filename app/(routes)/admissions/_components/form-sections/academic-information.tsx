'use client';

import { useState, useEffect } from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface AcademicInformationFormProps {
  form: UseFormReturn<any>;
}

export function AcademicInformationForm({
  form
}: AcademicInformationFormProps) {
  // Board of study options
  const boardOptions = [
    { value: 'State Board', label: 'State Board' },
    { value: 'CBSE', label: 'CBSE' },
    { value: 'ICSE', label: 'ICSE' },
    { value: 'Others', label: 'Others' }
  ];

  // Group/Stream options for Class 12
  const groupOptions = [
    { value: 'pcbm', label: 'Physics, Chemistry, Biology, Mathematics' },
    {
      value: 'pccs',
      label: 'Physics, Chemistry, Computer Science, Mathematics'
    },
    { value: 'pcbz', label: 'Physics, Chemistry, Botany, Zoology' },
    { value: 'pcbc', label: 'Physics, Chemistry, Biology, Computer Science' },
    { value: 'pcbn', label: 'Physics, Chemistry, Biology, Nursing' },
    { value: 'pcmh', label: 'Physics, Chemistry, Mathematics, Home Science' },
    {
      value: 'cseca',
      label: 'Computer Science, Economics, Commerce, Accountancy'
    },
    { value: 'heca', label: 'History, Economics, Commerce, Accountancy' },
    { value: 'seca', label: 'Statistics, Economics, Commerce, Accountancy' },
    { value: 'aa', label: 'Accountancy & Auditing' },
    { value: 'others', label: 'Other Groups' }
  ];

  // Get the current 12th group value
  const twelfthGroup = useWatch({
    control: form.control,
    name: 'twelfthMarks.group'
  });

  // Get 10th and 12th marks for auto-calculation
  const tenthMaxMarks = useWatch({
    control: form.control,
    name: 'tenthMarks.maxMarks'
  });

  const tenthObtainedMarks = useWatch({
    control: form.control,
    name: 'tenthMarks.obtainedMarks'
  });

  const twelfthMaxMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.maxMarks'
  });

  const twelfthObtainedMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.obtainedMarks'
  });

  // Subject marks for cutoff calculation
  const physicsMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.subjects.physics'
  });

  const chemistryMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.subjects.chemistry'
  });

  const mathsMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.subjects.mathematics'
  });

  const biologyMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.subjects.biology'
  });

  const botanyMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.subjects.botany'
  });

  const zoologyMarks = useWatch({
    control: form.control,
    name: 'twelfthMarks.subjects.zoology'
  });

  // Calculate percentage when those values change
  useEffect(() => {
    if (tenthObtainedMarks && tenthMaxMarks && Number(tenthMaxMarks) > 0) {
      const percentage = (
        (Number(tenthObtainedMarks) / Number(tenthMaxMarks)) *
        100
      ).toFixed(2);
      form.setValue('tenthMarks.percentage', percentage);
    } else {
      form.setValue('tenthMarks.percentage', '');
    }
  }, [tenthObtainedMarks, tenthMaxMarks, form]);

  // Calculate 12th percentage
  useEffect(() => {
    if (
      twelfthObtainedMarks &&
      twelfthMaxMarks &&
      Number(twelfthMaxMarks) > 0
    ) {
      const percentage = (
        (Number(twelfthObtainedMarks) / Number(twelfthMaxMarks)) *
        100
      ).toFixed(2);
      form.setValue('twelfthMarks.percentage', percentage);
    } else {
      form.setValue('twelfthMarks.percentage', '');
    }
  }, [twelfthObtainedMarks, twelfthMaxMarks, form]);

  // Calculate cutoff marks when subject marks change
  const watchPhysicsMarks = form.watch('physicsMarks');
  const watchChemistryMarks = form.watch('chemistryMarks');
  const watchMathsMarks = form.watch('mathsMarks');
  const watchBiologyMarks = form.watch('biologyMarks');
  const watchPhysicsMaxMarks = form.watch('physicsMaxMarks');
  const watchChemistryMaxMarks = form.watch('chemistryMaxMarks');
  const watchMathsMaxMarks = form.watch('mathsMaxMarks');
  const watchBiologyMaxMarks = form.watch('biologyMaxMarks');

  useEffect(() => {
    // For physics, chemistry, maths (Engineering)
    if (
      physicsMarks &&
      chemistryMarks &&
      mathsMarks &&
      Number(physicsMarks) > 0 &&
      Number(chemistryMarks) > 0 &&
      Number(mathsMarks) > 0
    ) {
      const physicsValue = Number(physicsMarks);
      const chemistryValue = Number(chemistryMarks);
      const mathsValue = Number(mathsMarks);

      const engineeringCutoff = (
        (physicsValue + chemistryValue) / 2 +
        mathsValue
      ).toFixed(2);
      form.setValue('engineeringCutoffMarks', engineeringCutoff);
    }

    // For medical cutoff calculation
    // Formula 1: ((PHY + CHEM) / 2) + BIO = Medical Cutoff
    // Formula 2: ((PHY + CHEM) / 2) + BOT + (ZOO / 2) = Medical Cutoff
    if (
      physicsMarks &&
      chemistryMarks &&
      Number(physicsMarks) > 0 &&
      Number(chemistryMarks) > 0
    ) {
      const physicsValue = Number(physicsMarks);
      const chemistryValue = Number(chemistryMarks);

      // If Biology marks are available, use the first formula
      if (biologyMarks && Number(biologyMarks) > 0) {
        const biologyValue = Number(biologyMarks);
        const medicalCutoff = (
          (physicsValue + chemistryValue) / 2 +
          biologyValue
        ).toFixed(2);
        form.setValue('medicalCutoffMarks', medicalCutoff);
      }
      // If Botany and Zoology marks are available, use the second formula
      else if (
        botanyMarks &&
        zoologyMarks &&
        Number(botanyMarks) > 0 &&
        Number(zoologyMarks) > 0
      ) {
        const botanyValue = Number(botanyMarks);
        const zoologyValue = Number(zoologyMarks);
        const medicalCutoff = (
          (physicsValue + chemistryValue) / 2 +
          botanyValue +
          zoologyValue / 2
        ).toFixed(2);
        form.setValue('medicalCutoffMarks', medicalCutoff);
      }
      // Clear the value if conditions are not met
      else {
        form.setValue('medicalCutoffMarks', '');
      }
    }
  }, [
    physicsMarks,
    chemistryMarks,
    mathsMarks,
    biologyMarks,
    botanyMarks,
    zoologyMarks,
    form
  ]);

  // Determine which subject fields to display based on group selection
  const getSubjectFields = () => {
    if (!twelfthGroup) return null;

    // Subject fields based on group
    switch (twelfthGroup) {
      case 'pcbm': // Physics, Chemistry, Biology, Mathematics
        return (
          <>
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.physics'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Physics marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.chemistry'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Chemistry marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.biology'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Biology Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Biology marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.mathematics'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mathematics Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Mathematics marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );

      case 'pccs': // Physics, Chemistry, Computer Science, Mathematics
        return (
          <>
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.physics'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Physics marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.chemistry'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Chemistry marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.computerScience'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Computer Science Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Computer Science marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.mathematics'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mathematics Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Mathematics marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );

      case 'pcbz': // Physics, Chemistry, Botany, Zoology
        return (
          <>
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.physics'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Physics Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Physics marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.chemistry'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemistry Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Chemistry marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.botany'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Botany Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Botany marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.zoology'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Zoology Marks</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Zoology marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );

      // Add cases for other groups...
      default:
        // For other groups, allow custom subjects
        return (
          <>
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.subject1'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject 1</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Subject name and marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.subject2'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject 2</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Subject name and marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.subject3'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject 3</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Subject name and marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='twelfthMarks.subjects.subject4'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject 4</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || '')}
                      placeholder='Subject name and marks'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        );
    }
  };

  // Show NEET fields for medical-related groups
  const shouldShowNEETFields = () => {
    return ['pcbm', 'pcbz', 'pcbc', 'pcbn'].includes(twelfthGroup);
  };

  return (
    <div className='space-y-8'>
      <div>
        <h2 className='text-xl font-semibold mb-2'>Academic Information</h2>
        <p className='text-sm text-muted-foreground'>
          Enter previous academic details and qualifications.
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <FormField
          control={form.control}
          name='lastSchool'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last School/College</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder='Name of previous school/college'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='boardOfStudy'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Board of Study</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder='Select board' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {boardOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <Separator className='my-4' />

      <div>
        <h3 className='text-lg font-medium mb-4'>Class 10 Marks</h3>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          <FormField
            control={form.control}
            name='tenthMarks.maxMarks'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximum Marks</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min='0'
                    placeholder='Maximum possible marks'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='tenthMarks.obtainedMarks'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obtained Marks</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min='0'
                    placeholder='Marks obtained'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='tenthMarks.percentage'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Percentage (%)</FormLabel>
                <FormControl>
                  <Input
                    placeholder='Auto-calculated'
                    disabled
                    value={
                      field.value === '' ||
                      field.value === undefined ||
                      field.value === null
                        ? ''
                        : field.value
                    }
                    className='text-center'
                  />
                </FormControl>
                <FormDescription>Auto-calculated</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <Separator className='my-4' />

      <div>
        <h3 className='text-lg font-medium mb-4'>Class 12 Marks</h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-6'>
          <FormField
            control={form.control}
            name='twelfthMarks.group'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Group/Stream</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder='Select group/stream' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {groupOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Select your 12th standard group to show relevant subject
                  fields
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 mb-6'>
          <FormField
            control={form.control}
            name='twelfthMarks.maxMarks'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximum Marks</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min='0'
                    placeholder='Maximum possible marks'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='twelfthMarks.obtainedMarks'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Obtained Marks</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type='number'
                    min='0'
                    placeholder='Marks obtained'
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='twelfthMarks.percentage'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Percentage (%)</FormLabel>
                <FormControl>
                  <Input
                    placeholder='Auto-calculated'
                    disabled
                    value={
                      field.value === '' ||
                      field.value === undefined ||
                      field.value === null
                        ? ''
                        : field.value
                    }
                    className='text-center'
                  />
                </FormControl>
                <FormDescription>Auto-calculated</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {twelfthGroup && (
          <>
            <h4 className='text-md font-medium mb-4'>Subject-wise Marks</h4>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6 mb-6'>
              {getSubjectFields()}
            </div>
          </>
        )}
      </div>

      <Separator className='my-4' />

      <div>
        <h3 className='text-lg font-medium mb-4'>Cutoff Marks</h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {['pcbm', 'pcbz', 'pcbc', 'pcbn'].includes(twelfthGroup) && (
            <FormField
              control={form.control}
              name='medicalCutoffMarks'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medical Cutoff</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Auto-calculated'
                      disabled
                      value={
                        field.value === '' ||
                        field.value === undefined ||
                        field.value === null
                          ? ''
                          : field.value
                      }
                      className='text-center'
                    />
                  </FormControl>
                  <FormDescription>
                    Auto-calculated based on subject marks
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {['pcbm', 'pccs', 'pcmh'].includes(twelfthGroup) && (
            <FormField
              control={form.control}
              name='engineeringCutoffMarks'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Engineering Cutoff</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='Auto-calculated'
                      disabled
                      value={
                        field.value === '' ||
                        field.value === undefined ||
                        field.value === null
                          ? ''
                          : field.value
                      }
                      className='text-center'
                    />
                  </FormControl>
                  <FormDescription>
                    Auto-calculated based on subject marks
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>

      {shouldShowNEETFields() && (
        <>
          <Separator className='my-4' />

          <div>
            <h3 className='text-lg font-medium mb-4'>
              NEET/Counseling Details
            </h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <FormField
                control={form.control}
                name='neetRollNumber'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NEET Roll Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='Enter NEET roll number if applicable'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='counselingApplied'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className='space-y-1 leading-none'>
                      <FormLabel>Applied for Counseling</FormLabel>
                      <FormDescription>
                        Check if you have applied for counseling
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {form.watch('counselingApplied') && (
                <FormField
                  control={form.control}
                  name='counselingNumber'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Counseling Application Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder='Enter counseling application number'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
        </>
      )}

      <Separator className='my-4' />

      <div>
        <h3 className='text-lg font-medium mb-4'>Additional Information</h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <FormField
            control={form.control}
            name='firstGraduate'
            render={({ field }) => (
              <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className='space-y-1 leading-none'>
                  <FormLabel>First Graduate</FormLabel>
                  <FormDescription>
                    Check if you are the first graduate in your family
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
