// app/(routes)/resource-management/resources/_components/time-slot-config.tsx

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Clock } from 'lucide-react';
import type { TimeSlotConfig, CustomTimeSlot, BreakTime } from '@/types/resource-management';

interface TimeSlotConfigProps {
  config: TimeSlotConfig;
  onChange: (config: TimeSlotConfig) => void;
}

export function TimeSlotConfigComponent({ config, onChange }: TimeSlotConfigProps) {
  const slotGeneration = config.slot_generation || 'automatic';

  const updateConfig = (updates: Partial<TimeSlotConfig>) => {
    onChange({ ...config, ...updates });
  };

  // Add custom slot
  const addCustomSlot = () => {
    const newSlot: CustomTimeSlot = {
      id: `slot-${Date.now()}`,
      name: '',
      start_time: '09:00',
      end_time: '10:00',
      max_capacity: 1,
      is_active: true
    };
    const slots = [...(config.custom_slots || []), newSlot];
    updateConfig({ custom_slots: slots });
  };

  // Remove custom slot
  const removeCustomSlot = (id: string) => {
    const slots = config.custom_slots?.filter((s) => s.id !== id) || [];
    updateConfig({ custom_slots: slots });
  };

  // Update custom slot
  const updateCustomSlot = (id: string, updates: Partial<CustomTimeSlot>) => {
    const slots = config.custom_slots?.map((s) => (s.id === id ? { ...s, ...updates } : s)) || [];
    updateConfig({ custom_slots: slots });
  };

  // Add break time
  const addBreakTime = () => {
    const newBreak: BreakTime = {
      id: `break-${Date.now()}`,
      start_time: '12:00',
      end_time: '13:00',
      reason: 'Lunch Break'
    };
    const breaks = [
      ...(config.automatic_config?.break_times || []),
      newBreak
    ];
    updateConfig({
      automatic_config: {
        ...config.automatic_config,
        slot_duration: config.automatic_config?.slot_duration || 60,
        buffer_time: config.automatic_config?.buffer_time || 0,
        break_times: breaks
      }
    });
  };

  // Remove break time
  const removeBreakTime = (id: string) => {
    const breaks = config.automatic_config?.break_times?.filter((b) => b.id !== id) || [];
    updateConfig({
      automatic_config: {
        ...config.automatic_config,
        slot_duration: config.automatic_config?.slot_duration || 60,
        buffer_time: config.automatic_config?.buffer_time || 0,
        break_times: breaks
      }
    });
  };

  // Update break time
  const updateBreakTime = (id: string, updates: Partial<BreakTime>) => {
    const breaks =
      config.automatic_config?.break_times?.map((b) => (b.id === id ? { ...b, ...updates } : b)) ||
      [];
    updateConfig({
      automatic_config: {
        ...config.automatic_config,
        slot_duration: config.automatic_config?.slot_duration || 60,
        buffer_time: config.automatic_config?.buffer_time || 0,
        break_times: breaks
      }
    });
  };

  const daysOfWeek = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Slot Configuration</CardTitle>
        <CardDescription>
          Define available time slots and operating hours for this resource
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {/* Operating Hours */}
        <div className='space-y-4 rounded-lg border p-4'>
          <Label className='text-sm font-medium'>Operating Hours</Label>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label className='text-xs'>Start Time</Label>
              <Input
                type='time'
                value={config.operating_hours?.default?.start || '09:00'}
                onChange={(e) =>
                  updateConfig({
                    operating_hours: {
                      ...config.operating_hours,
                      default: {
                        start: e.target.value,
                        end: config.operating_hours?.default?.end || '17:00'
                      }
                    }
                  })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label className='text-xs'>End Time</Label>
              <Input
                type='time'
                value={config.operating_hours?.default?.end || '17:00'}
                onChange={(e) =>
                  updateConfig({
                    operating_hours: {
                      ...config.operating_hours,
                      default: {
                        start: config.operating_hours?.default?.start || '09:00',
                        end: e.target.value
                      }
                    }
                  })
                }
              />
            </div>
          </div>
        </div>

        {/* Slot Generation Mode */}
        <div className='space-y-3'>
          <Label>Slot Generation Method</Label>
          <RadioGroup
            value={slotGeneration}
            onValueChange={(value: any) => updateConfig({ slot_generation: value })}
          >
            <div className='flex items-center space-x-2'>
              <RadioGroupItem value='automatic' id='automatic' />
              <Label htmlFor='automatic' className='font-normal cursor-pointer'>
                Automatic (Equal Duration Slots)
              </Label>
            </div>
            <div className='flex items-center space-x-2'>
              <RadioGroupItem value='custom' id='custom' />
              <Label htmlFor='custom' className='font-normal cursor-pointer'>
                Custom Time Slots (Define Specific Slots)
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Automatic Configuration */}
        {slotGeneration === 'automatic' && (
          <div className='space-y-4 rounded-lg border p-4 bg-muted/20'>
            <Label className='text-sm font-medium'>Automatic Slot Settings</Label>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label className='text-xs'>Slot Duration (minutes)</Label>
                <Input
                  type='number'
                  min='15'
                  step='15'
                  placeholder='60'
                  value={config.automatic_config?.slot_duration || 60}
                  onChange={(e) =>
                    updateConfig({
                      automatic_config: {
                        ...config.automatic_config,
                        slot_duration: parseInt(e.target.value) || 60,
                        buffer_time: config.automatic_config?.buffer_time || 0
                      }
                    })
                  }
                />
                <p className='text-xs text-muted-foreground'>
                  Duration of each time slot
                </p>
              </div>

              <div className='space-y-2'>
                <Label className='text-xs'>Buffer Time (minutes)</Label>
                <Input
                  type='number'
                  min='0'
                  step='5'
                  placeholder='0'
                  value={config.automatic_config?.buffer_time || 0}
                  onChange={(e) =>
                    updateConfig({
                      automatic_config: {
                        ...config.automatic_config,
                        slot_duration: config.automatic_config?.slot_duration || 60,
                        buffer_time: parseInt(e.target.value) || 0
                      }
                    })
                  }
                />
                <p className='text-xs text-muted-foreground'>
                  Gap between consecutive slots
                </p>
              </div>
            </div>

            {/* Break Times */}
            <div className='space-y-3 mt-4'>
              <div className='flex items-center justify-between'>
                <Label className='text-xs font-medium'>Break Times</Label>
                <Button type='button' size='sm' variant='outline' onClick={addBreakTime}>
                  <Plus className='h-4 w-4 mr-2' />
                  Add Break
                </Button>
              </div>

              {config.automatic_config?.break_times?.map((breakTime) => (
                <div key={breakTime.id} className='rounded-lg border p-3 space-y-3 bg-background'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-xs font-medium'>Break Period</Label>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => removeBreakTime(breakTime.id)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>

                  <div className='grid gap-3 md:grid-cols-3'>
                    <div className='space-y-2'>
                      <Label className='text-xs'>Start Time</Label>
                      <Input
                        type='time'
                        value={breakTime.start_time}
                        onChange={(e) =>
                          updateBreakTime(breakTime.id, { start_time: e.target.value })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label className='text-xs'>End Time</Label>
                      <Input
                        type='time'
                        value={breakTime.end_time}
                        onChange={(e) =>
                          updateBreakTime(breakTime.id, { end_time: e.target.value })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label className='text-xs'>Reason</Label>
                      <Input
                        placeholder='e.g., Lunch'
                        value={breakTime.reason || ''}
                        onChange={(e) => updateBreakTime(breakTime.id, { reason: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Slots */}
        {slotGeneration === 'custom' && (
          <div className='space-y-4 rounded-lg border p-4 bg-muted/20'>
            <div className='flex items-center justify-between'>
              <Label className='text-sm font-medium'>Custom Time Slots</Label>
              <Button type='button' size='sm' variant='outline' onClick={addCustomSlot}>
                <Clock className='h-4 w-4 mr-2' />
                Add Slot
              </Button>
            </div>

            {(!config.custom_slots || config.custom_slots.length === 0) && (
              <p className='text-sm text-muted-foreground text-center py-4'>
                No custom slots configured. Click "Add Slot" to define time slots.
              </p>
            )}

            <div className='space-y-3'>
              {config.custom_slots?.map((slot) => (
                <div key={slot.id} className='rounded-lg border p-4 space-y-3 bg-background'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-sm font-medium'>Time Slot</Label>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => removeCustomSlot(slot.id)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>

                  <div className='space-y-2'>
                    <Label className='text-xs'>Slot Name</Label>
                    <Input
                      placeholder='e.g., Morning Session'
                      value={slot.name}
                      onChange={(e) => updateCustomSlot(slot.id, { name: e.target.value })}
                    />
                  </div>

                  <div className='grid gap-3 md:grid-cols-3'>
                    <div className='space-y-2'>
                      <Label className='text-xs'>Start Time</Label>
                      <Input
                        type='time'
                        value={slot.start_time}
                        onChange={(e) =>
                          updateCustomSlot(slot.id, { start_time: e.target.value })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label className='text-xs'>End Time</Label>
                      <Input
                        type='time'
                        value={slot.end_time}
                        onChange={(e) => updateCustomSlot(slot.id, { end_time: e.target.value })}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label className='text-xs'>Max Capacity</Label>
                      <Input
                        type='number'
                        min='1'
                        value={slot.max_capacity}
                        onChange={(e) =>
                          updateCustomSlot(slot.id, { max_capacity: parseInt(e.target.value) || 1 })
                        }
                      />
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label className='text-xs'>Available Days (leave empty for all days)</Label>
                    <div className='flex flex-wrap gap-2'>
                      {daysOfWeek.map((day) => (
                        <div key={day.value} className='flex items-center space-x-1'>
                          <Checkbox
                            id={`${slot.id}-day-${day.value}`}
                            checked={slot.days_of_week?.includes(day.value) || false}
                            onCheckedChange={(checked) => {
                              const currentDays = slot.days_of_week || [];
                              const newDays = checked
                                ? [...currentDays, day.value].sort()
                                : currentDays.filter((d) => d !== day.value);
                              updateCustomSlot(slot.id, {
                                days_of_week: newDays.length > 0 ? newDays : undefined
                              });
                            }}
                          />
                          <Label
                            htmlFor={`${slot.id}-day-${day.value}`}
                            className='text-xs font-normal cursor-pointer'
                          >
                            {day.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id={`${slot.id}-active`}
                      checked={slot.is_active}
                      onCheckedChange={(checked) =>
                        updateCustomSlot(slot.id, { is_active: !!checked })
                      }
                    />
                    <Label htmlFor={`${slot.id}-active`} className='font-normal text-xs'>
                      Slot is active
                    </Label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
