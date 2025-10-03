# Implementation Plan: Advanced Booking & Availability Configuration

**Date Created:** 2025-01-16
**Module:** Resource Management - Reservations
**Priority:** High
**Complexity:** High
**Estimated Effort:** 8-12 hours

---

## 📋 Table of Contents
1. [Executive Summary](#executive-summary)
2. [Current System Analysis](#current-system-analysis)
3. [Requirements](#requirements)
4. [Technical Architecture](#technical-architecture)
5. [Database Schema Changes](#database-schema-changes)
6. [Implementation Phases](#implementation-phases)
7. [File Changes](#file-changes)
8. [Testing Strategy](#testing-strategy)
9. [Rollout Plan](#rollout-plan)

---

## 🎯 Executive Summary

### Problem Statement
Currently, when users create a reservation, the system shows **default date and time options** for all resources. However, different resources have different availability patterns:

- **Seminar Hall**: Only Monday-Friday, 9 AM - 5 PM
- **Sports Equipment**: Any day, 6 AM - 9 PM
- **Lab Equipment**: Specific dates only (e.g., during semester)
- **Conference Room**: Custom time slots (9-11 AM, 2-4 PM, 5-7 PM)

### Solution Overview
Implement a comprehensive **Booking Configuration System** that allows administrators to:

1. **Date Availability Configuration**
   - All dates (always available)
   - Custom date ranges only
   - Weekly patterns (specific days of week)
   - Blackout dates (exceptions)

2. **Time Slot Configuration**
   - Default operating hours
   - Custom time slots
   - Slot duration customization
   - Break times/buffer periods
   - Day-specific schedules

3. **Dynamic Reservation Flow**
   - Calendar shows only available dates
   - Time picker shows only configured slots
   - Real-time availability checking
   - Visual availability indicators

---

## 🔍 Current System Analysis

### Current Booking Configuration Structure

```typescript
interface BookingConfiguration {
  // Time Limits
  max_advance_days?: number;          // How far in advance can book
  min_advance_hours?: number;         // Minimum notice required
  max_duration_hours?: number;        // Maximum booking duration
  min_duration_hours?: number;        // Minimum booking duration

  // Operating Hours (Simple)
  operating_hours?: {
    start: string;  // e.g., "09:00"
    end: string;    // e.g., "17:00"
  };

  // Slot Configuration
  slot_duration?: number;             // in minutes (default: 60)

  // Policies
  allow_overlap?: boolean;
  require_approval?: boolean;
  auto_cancel_no_show?: boolean;
  send_reminders?: boolean;

  // User Limits
  max_bookings_per_user?: number;
  concurrent_booking_limit?: number;
  buffer_time?: number;               // in minutes
}
```

### Current Slot Generation Logic

**Location:** `lib/services/reservation/reservation-service.ts:311-380`

```typescript
static async getAvailableSlots(resourceId: string, date: string): Promise<TimeSlot[]> {
  // Get resource booking configuration
  const { data: resource } = await supabase
    .from('resources')
    .select('booking_config, status')
    .eq('id', resourceId)
    .single();

  // Default: 1-hour slots from 9 AM to 5 PM
  const slotDuration = bookingConfig?.slot_duration || 60; // minutes
  const startHour = bookingConfig?.operating_hours?.start || 9;
  const endHour = bookingConfig?.operating_hours?.end || 17;

  // Generate hourly slots
  for (let hour = startHour; hour < endHour; hour++) {
    const slotStart = `${date}T${hour.toString().padStart(2, '0')}:00:00Z`;
    const slotEnd = `${date}T${(hour + 1).toString().padStart(2, '0')}:00:00Z`;

    const isBooked = reservations?.some(
      (r) => r.start_time <= slotStart && r.end_time >= slotEnd
    );

    slots.push({
      start_time: slotStart,
      end_time: slotEnd,
      is_available: !isBooked,
      resource_id: resourceId
    });
  }

  return slots;
}
```

### Problems with Current System

1. **No Date Restrictions**
   - All future dates are bookable
   - No way to restrict to specific dates
   - No weekly patterns (e.g., weekdays only)

2. **Inflexible Time Slots**
   - Only hourly slots
   - Fixed duration for all slots
   - Cannot create custom slot timings (e.g., 9-11 AM, 2-4 PM)

3. **No Day-Specific Configuration**
   - Same operating hours every day
   - Cannot have different schedules for different days

4. **Manual Slot Generation**
   - Slots generated on-the-fly
   - Performance issues for large date ranges
   - No pre-configured slot templates

---

## 📝 Requirements

### Functional Requirements

#### FR1: Date Availability Configuration

**FR1.1 - Availability Mode Selection**
- [ ] All Dates: Resource available every day
- [ ] Custom Dates: Specific date ranges only
- [ ] Weekly Pattern: Specific days of week
- [ ] Blackout Dates: Exclude specific dates

**FR1.2 - Custom Date Ranges**
- [ ] Add multiple date ranges
- [ ] Start and end date pickers
- [ ] Recurring date patterns
- [ ] Visual calendar for date selection

**FR1.3 - Weekly Patterns**
- [ ] Select specific days (Mon, Tue, Wed, etc.)
- [ ] Different patterns for different periods
- [ ] Exclude holidays automatically

**FR1.4 - Blackout Dates**
- [ ] Add exception dates
- [ ] Reason/notes for blackout
- [ ] Override for specific users/roles

#### FR2: Time Slot Configuration

**FR2.1 - Operating Hours**
- [ ] Default start/end time
- [ ] Day-specific operating hours
- [ ] Multiple shifts per day

**FR2.2 - Custom Time Slots**
- [ ] Create predefined time slots
- [ ] Set slot duration
- [ ] Add buffer time between slots
- [ ] Slot capacity (concurrent bookings)

**FR2.3 - Slot Templates**
- [ ] Morning slots (e.g., 9-11 AM, 11 AM-1 PM)
- [ ] Afternoon slots (e.g., 2-4 PM, 4-6 PM)
- [ ] Evening slots (e.g., 6-8 PM, 8-10 PM)
- [ ] Custom slot names

**FR2.4 - Break Times**
- [ ] Define break periods (no bookings)
- [ ] Lunch breaks
- [ ] Maintenance windows

#### FR3: Dynamic Reservation Flow

**FR3.1 - Calendar Integration**
- [ ] Show only available dates
- [ ] Visual indicators for different availability states
- [ ] Disable unavailable dates
- [ ] Tooltip with availability info

**FR3.2 - Time Slot Picker**
- [ ] Display only configured slots
- [ ] Show slot capacity
- [ ] Real-time availability updates
- [ ] Slot duration display

**FR3.3 - Validation**
- [ ] Prevent booking on unavailable dates
- [ ] Prevent booking outside operating hours
- [ ] Validate against blackout dates
- [ ] Check slot capacity

### Non-Functional Requirements

**NFR1: Performance**
- Calendar availability query: < 500ms
- Time slot generation: < 200ms
- Support 100+ resources

**NFR2: Usability**
- Intuitive configuration UI
- Visual feedback for settings
- Preview before saving
- Bulk configuration for similar resources

**NFR3: Maintainability**
- Clean separation of concerns
- Reusable components
- Well-documented code
- Easy to extend

**NFR4: Data Integrity**
- Validate date ranges
- Prevent overlapping configurations
- Automatic cleanup of past dates
- Transaction safety

---

## 🏗️ Technical Architecture

### Enhanced Booking Configuration Structure

```typescript
interface DateAvailabilityConfig {
  // Availability Mode
  mode: 'all_dates' | 'custom_dates' | 'weekly_pattern' | 'blackout_dates';

  // Custom Date Ranges
  custom_date_ranges?: DateRange[];

  // Weekly Pattern
  weekly_pattern?: {
    days_of_week: number[];  // 0 = Sunday, 6 = Saturday
    exclude_holidays: boolean;
  };

  // Blackout Dates
  blackout_dates?: BlackoutDate[];

  // Advanced
  advance_booking_limit?: number;     // days
  same_day_booking?: boolean;
}

interface DateRange {
  id: string;
  start_date: string;  // YYYY-MM-DD
  end_date: string;    // YYYY-MM-DD
  label?: string;
  recurring?: {
    frequency: 'yearly' | 'monthly';
    pattern?: string;
  };
}

interface BlackoutDate {
  id: string;
  date: string;        // YYYY-MM-DD
  reason: string;
  override_roles?: string[];  // Can bypass blackout
}

interface TimeSlotConfig {
  // Operating Hours
  operating_hours: OperatingHours;

  // Slot Generation
  slot_generation: 'automatic' | 'custom';

  // Automatic Slots
  automatic_config?: {
    slot_duration: number;  // minutes
    buffer_time: number;    // minutes between slots
    break_times?: BreakTime[];
  };

  // Custom Slots
  custom_slots?: CustomTimeSlot[];

  // Day-Specific Schedules
  day_specific_schedules?: DaySchedule[];
}

interface OperatingHours {
  default: {
    start: string;  // HH:MM
    end: string;    // HH:MM
  };
  timezone?: string;
}

interface CustomTimeSlot {
  id: string;
  name: string;           // e.g., "Morning Session"
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  max_capacity: number;   // concurrent bookings
  days_of_week?: number[]; // which days this slot is available
  is_active: boolean;
}

interface BreakTime {
  id: string;
  start_time: string;  // HH:MM
  end_time: string;    // HH:MM
  reason?: string;
}

interface DaySchedule {
  day_of_week: number;  // 0-6
  operating_hours: {
    start: string;
    end: string;
  };
  custom_slots?: CustomTimeSlot[];
  is_closed?: boolean;
}

// Enhanced Booking Configuration
interface EnhancedBookingConfiguration extends BookingConfiguration {
  date_availability: DateAvailabilityConfig;
  time_slot_config: TimeSlotConfig;
}
```

### Service Layer Architecture

```
┌─────────────────────────────────────────┐
│     Reservation Service                  │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Date Availability Service          │ │
│  │  - checkDateAvailable()             │ │
│  │  - getAvailableDates()              │ │
│  │  - validateDateRange()              │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Time Slot Generator Service        │ │
│  │  - generateSlots()                  │ │
│  │  - getCustomSlots()                 │ │
│  │  - validateTimeSlot()               │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Availability Checker Service       │ │
│  │  - checkAvailability()              │ │
│  │  - getConflicts()                   │ │
│  │  - calculateCapacity()              │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 🗄️ Database Schema Changes

### Option 1: JSON Column (Recommended - Faster to implement)

**Pros:**
- No schema migration needed
- Flexible structure
- Easy to extend
- Backward compatible

**Cons:**
- Cannot index nested fields
- Complex queries harder
- Larger storage

**Implementation:**
```sql
-- No changes needed to resources table
-- Just update booking_config JSONB column structure

-- Add validation function
CREATE OR REPLACE FUNCTION validate_booking_config(config JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate date_availability mode
  IF config->>'date_availability'->>'mode' IS NOT NULL THEN
    IF config->>'date_availability'->>'mode' NOT IN ('all_dates', 'custom_dates', 'weekly_pattern', 'blackout_dates') THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- More validations...

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add constraint
ALTER TABLE resources
ADD CONSTRAINT valid_booking_config
CHECK (validate_booking_config(booking_config));
```

### Option 2: Separate Tables (Better for complex queries)

**Pros:**
- Proper normalization
- Better queryability
- Indexable
- Referential integrity

**Cons:**
- Migration required
- More complex joins
- Harder to maintain

**Schema:**
```sql
-- Resource Date Availability
CREATE TABLE resource_date_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('all_dates', 'custom_dates', 'weekly_pattern', 'blackout_dates')),
  advance_booking_limit_days INTEGER,
  same_day_booking BOOLEAN DEFAULT true,
  exclude_holidays BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Custom Date Ranges
CREATE TABLE resource_custom_date_ranges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  label VARCHAR(100),
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency VARCHAR(20),
  recurring_pattern JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Blackout Dates
CREATE TABLE resource_blackout_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT,
  override_roles TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(resource_id, date)
);

-- Weekly Pattern
CREATE TABLE resource_weekly_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_available BOOLEAN DEFAULT true,

  UNIQUE(resource_id, day_of_week)
);

-- Custom Time Slots
CREATE TABLE resource_custom_time_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_capacity INTEGER DEFAULT 1,
  days_of_week INTEGER[],  -- NULL means all days
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Day-Specific Schedules
CREATE TABLE resource_day_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed BOOLEAN DEFAULT false,
  operating_start TIME,
  operating_end TIME,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(resource_id, day_of_week)
);

-- Break Times
CREATE TABLE resource_break_times (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason VARCHAR(100),
  days_of_week INTEGER[],  -- NULL means all days
  is_active BOOLEAN DEFAULT true,

  CONSTRAINT valid_break_time CHECK (end_time > start_time)
);

-- Indexes
CREATE INDEX idx_date_ranges_resource ON resource_custom_date_ranges(resource_id);
CREATE INDEX idx_date_ranges_dates ON resource_custom_date_ranges(start_date, end_date);
CREATE INDEX idx_blackout_dates_resource ON resource_blackout_dates(resource_id);
CREATE INDEX idx_blackout_dates_date ON resource_blackout_dates(date);
CREATE INDEX idx_time_slots_resource ON resource_custom_time_slots(resource_id);
CREATE INDEX idx_time_slots_active ON resource_custom_time_slots(is_active);
```

**Recommendation:** Start with **Option 1** (JSON) for MVP, migrate to **Option 2** (tables) if needed for performance.

---

## 🚀 Implementation Phases

### Phase 1: Backend Foundation (3-4 hours)

#### Step 1.1: Update TypeScript Types
**File:** `types/resource-management.ts`

```typescript
// Add new interfaces
export interface DateAvailabilityConfig { ... }
export interface TimeSlotConfig { ... }
export interface EnhancedBookingConfiguration { ... }
```

#### Step 1.2: Create Date Availability Service
**File:** `lib/services/resource-management/date-availability-service.ts` (NEW)

```typescript
export class DateAvailabilityService {
  /**
   * Check if a specific date is available for booking
   */
  static isDateAvailable(
    config: DateAvailabilityConfig,
    date: string
  ): boolean {
    // Implementation
  }

  /**
   * Get all available dates for a month
   */
  static getAvailableDatesForMonth(
    resourceId: string,
    month: number,
    year: number
  ): Promise<string[]> {
    // Implementation
  }

  /**
   * Validate date against all rules
   */
  static validateDate(
    config: DateAvailabilityConfig,
    date: string
  ): ValidationResult {
    // Implementation
  }
}
```

#### Step 1.3: Create Time Slot Generator Service
**File:** `lib/services/resource-management/time-slot-generator-service.ts` (NEW)

```typescript
export class TimeSlotGeneratorService {
  /**
   * Generate time slots for a specific date
   */
  static generateSlotsForDate(
    config: TimeSlotConfig,
    date: string
  ): TimeSlot[] {
    // Implementation
  }

  /**
   * Get custom slots for a resource
   */
  static getCustomSlots(
    resourceId: string,
    dayOfWeek?: number
  ): Promise<CustomTimeSlot[]> {
    // Implementation
  }

  /**
   * Validate time slot against configuration
   */
  static validateTimeSlot(
    config: TimeSlotConfig,
    startTime: string,
    endTime: string
  ): ValidationResult {
    // Implementation
  }
}
```

#### Step 1.4: Update Reservation Service
**File:** `lib/services/reservation/reservation-service.ts`

```typescript
// Update getAvailableSlots method
static async getAvailableSlots(
  resourceId: string,
  date: string
): Promise<TimeSlot[]> {
  const { data: resource } = await supabase
    .from('resources')
    .select('booking_config, status')
    .eq('id', resourceId)
    .single();

  if (!resource) throw new Error('Resource not found');

  // Step 1: Check if date is available
  const dateConfig = resource.booking_config?.date_availability;
  if (dateConfig && !DateAvailabilityService.isDateAvailable(dateConfig, date)) {
    return []; // No slots if date unavailable
  }

  // Step 2: Generate slots based on configuration
  const timeConfig = resource.booking_config?.time_slot_config;
  const slots = timeConfig
    ? TimeSlotGeneratorService.generateSlotsForDate(timeConfig, date)
    : this.generateDefaultSlots(date, resource.booking_config);

  // Step 3: Check existing reservations
  const reservations = await this.getReservationsForDate(resourceId, date);

  // Step 4: Mark booked slots
  return slots.map(slot => ({
    ...slot,
    is_available: !this.isSlotBooked(slot, reservations)
  }));
}
```

### Phase 2: UI Components (4-5 hours)

#### Step 2.1: Date Availability Configuration Component
**File:** `app/(routes)/resource-management/resources/_components/date-availability-config.tsx` (NEW)

**Features:**
- Availability mode selector (radio group)
- Custom date range picker
- Weekly pattern selector (checkboxes for days)
- Blackout dates manager
- Visual preview

```tsx
export function DateAvailabilityConfig({
  config,
  onChange
}: DateAvailabilityConfigProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Date Availability</CardTitle>
        <CardDescription>
          Configure which dates this resource is available for booking
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <FormField name="availability_mode">
          <RadioGroup>
            <RadioGroupItem value="all_dates">All Dates (Always Available)</RadioGroupItem>
            <RadioGroupItem value="custom_dates">Custom Date Ranges</RadioGroupItem>
            <RadioGroupItem value="weekly_pattern">Weekly Pattern</RadioGroupItem>
          </RadioGroup>
        </FormField>

        {/* Custom Date Ranges */}
        {mode === 'custom_dates' && (
          <CustomDateRangesManager />
        )}

        {/* Weekly Pattern */}
        {mode === 'weekly_pattern' && (
          <WeeklyPatternSelector />
        )}

        {/* Blackout Dates */}
        <BlackoutDatesManager />
      </CardContent>
    </Card>
  );
}
```

#### Step 2.2: Time Slot Configuration Component
**File:** `app/(routes)/resource-management/resources/_components/time-slot-config.tsx` (NEW)

**Features:**
- Operating hours picker
- Slot generation mode (automatic/custom)
- Custom slot creator
- Break times manager
- Day-specific schedules
- Preview time slots

```tsx
export function TimeSlotConfig({
  config,
  onChange
}: TimeSlotConfigProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Slot Configuration</CardTitle>
        <CardDescription>
          Define available time slots and operating hours
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Operating Hours */}
        <div>
          <Label>Operating Hours</Label>
          <div className="grid grid-cols-2 gap-4">
            <TimePicker label="Start Time" />
            <TimePicker label="End Time" />
          </div>
        </div>

        {/* Slot Generation Mode */}
        <RadioGroup>
          <RadioGroupItem value="automatic">
            Automatic (Equal Duration Slots)
          </RadioGroupItem>
          <RadioGroupItem value="custom">
            Custom Time Slots
          </RadioGroupItem>
        </RadioGroup>

        {/* Automatic Configuration */}
        {mode === 'automatic' && (
          <AutomaticSlotConfig />
        )}

        {/* Custom Slots */}
        {mode === 'custom' && (
          <CustomSlotsManager />
        )}

        {/* Break Times */}
        <BreakTimesManager />

        {/* Preview */}
        <TimeSlotPreview />
      </CardContent>
    </Card>
  );
}
```

#### Step 2.3: Update Resource Form
**File:** `app/(routes)/resource-management/resources/_components/resource-form.tsx`

Add new sections in the form:
- After "Booking Configuration" section
- Add Date Availability Configuration
- Add Time Slot Configuration

#### Step 2.4: Enhanced Calendar Component
**File:** `app/(routes)/resource-management/reservations/_components/availability-calendar.tsx`

**Updates:**
- Use DateAvailabilityService to check dates
- Show different icons for unavailable reasons:
  - ❌ Not in allowed date range
  - 📅 Not in weekly pattern
  - 🚫 Blackout date
  - ⚠️ Maintenance
- Tooltip with availability info

#### Step 2.5: Enhanced Time Slot Picker
**File:** `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx`

**Updates:**
- Use TimeSlotGeneratorService for slots
- Show custom slot names
- Display slot capacity
- Show break times (grayed out)
- Better visual grouping

### Phase 3: Integration & Testing (1-2 hours)

#### Step 3.1: Integration Testing
- Create resource with all date modes
- Create resource with custom slots
- Test reservation flow end-to-end
- Test edge cases (blackout dates, breaks, etc.)

#### Step 3.2: UI/UX Testing
- Test configuration UI responsiveness
- Test calendar interactions
- Test time slot picker usability
- Test form validation

#### Step 3.3: Performance Testing
- Test with 100+ resources
- Test calendar loading time
- Test slot generation performance
- Optimize queries if needed

### Phase 4: Documentation & Deployment (1 hour)

#### Step 4.1: Documentation
- Update resource management docs
- Create admin guide for configuration
- Create user guide for reservations
- Add API documentation

#### Step 4.2: Migration Script (if needed)
- Convert existing booking_config to new structure
- Set default values for existing resources
- Backup data before migration

#### Step 4.3: Deployment
- Deploy to staging
- QA testing
- Deploy to production
- Monitor for issues

---

## 📁 File Changes

### New Files (16 files)

#### Services
1. `lib/services/resource-management/date-availability-service.ts`
2. `lib/services/resource-management/time-slot-generator-service.ts`
3. `lib/utils/date-helpers.ts`
4. `lib/utils/time-helpers.ts`

#### Components - Configuration
5. `app/(routes)/resource-management/resources/_components/date-availability-config.tsx`
6. `app/(routes)/resource-management/resources/_components/time-slot-config.tsx`
7. `app/(routes)/resource-management/resources/_components/custom-date-ranges-manager.tsx`
8. `app/(routes)/resource-management/resources/_components/weekly-pattern-selector.tsx`
9. `app/(routes)/resource-management/resources/_components/blackout-dates-manager.tsx`
10. `app/(routes)/resource-management/resources/_components/custom-slots-manager.tsx`
11. `app/(routes)/resource-management/resources/_components/break-times-manager.tsx`
12. `app/(routes)/resource-management/resources/_components/time-slot-preview.tsx`

#### Hooks
13. `hooks/resource-management/use-date-availability.ts`
14. `hooks/resource-management/use-time-slot-config.ts`

#### Documentation
15. `docs/modules/resource-management/BOOKING-CONFIGURATION-GUIDE.md`
16. `docs/modules/resource-management/ADMIN-BOOKING-SETUP.md`

### Modified Files (8 files)

1. `types/resource-management.ts` - Add new interfaces
2. `lib/services/reservation/reservation-service.ts` - Update slot generation
3. `app/(routes)/resource-management/resources/_components/resource-form.tsx` - Add config sections
4. `app/(routes)/resource-management/resources/[id]/_components/booking-config-tab.tsx` - Display new config
5. `app/(routes)/resource-management/reservations/_components/availability-calendar.tsx` - Use date availability service
6. `app/(routes)/resource-management/reservations/_components/time-slot-picker.tsx` - Use time slot generator
7. `app/(routes)/resource-management/reservations/_components/booking-form.tsx` - Enhanced validation
8. `app/(routes)/resource-management/reservations/new/page.tsx` - Better user guidance

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// date-availability-service.test.ts
describe('DateAvailabilityService', () => {
  describe('isDateAvailable', () => {
    it('should return true for all dates mode', () => {
      const config = { mode: 'all_dates' };
      expect(DateAvailabilityService.isDateAvailable(config, '2025-02-01')).toBe(true);
    });

    it('should validate custom date ranges', () => {
      const config = {
        mode: 'custom_dates',
        custom_date_ranges: [
          { start_date: '2025-02-01', end_date: '2025-02-28' }
        ]
      };
      expect(DateAvailabilityService.isDateAvailable(config, '2025-02-15')).toBe(true);
      expect(DateAvailabilityService.isDateAvailable(config, '2025-03-01')).toBe(false);
    });

    it('should validate weekly patterns', () => {
      const config = {
        mode: 'weekly_pattern',
        weekly_pattern: {
          days_of_week: [1, 2, 3, 4, 5] // Mon-Fri
        }
      };
      expect(DateAvailabilityService.isDateAvailable(config, '2025-01-20')).toBe(true); // Monday
      expect(DateAvailabilityService.isDateAvailable(config, '2025-01-25')).toBe(false); // Saturday
    });

    it('should respect blackout dates', () => {
      const config = {
        mode: 'all_dates',
        blackout_dates: [
          { date: '2025-02-14', reason: 'Holiday' }
        ]
      };
      expect(DateAvailabilityService.isDateAvailable(config, '2025-02-14')).toBe(false);
      expect(DateAvailabilityService.isDateAvailable(config, '2025-02-15')).toBe(true);
    });
  });
});

// time-slot-generator-service.test.ts
describe('TimeSlotGeneratorService', () => {
  describe('generateSlotsForDate', () => {
    it('should generate automatic slots', () => {
      const config = {
        operating_hours: { default: { start: '09:00', end: '17:00' } },
        slot_generation: 'automatic',
        automatic_config: { slot_duration: 60, buffer_time: 0 }
      };
      const slots = TimeSlotGeneratorService.generateSlotsForDate(config, '2025-02-01');
      expect(slots).toHaveLength(8); // 9 AM to 5 PM
    });

    it('should use custom slots', () => {
      const config = {
        slot_generation: 'custom',
        custom_slots: [
          { name: 'Morning', start_time: '09:00', end_time: '12:00', max_capacity: 1 },
          { name: 'Afternoon', start_time: '14:00', end_time: '17:00', max_capacity: 1 }
        ]
      };
      const slots = TimeSlotGeneratorService.generateSlotsForDate(config, '2025-02-01');
      expect(slots).toHaveLength(2);
    });

    it('should exclude break times', () => {
      const config = {
        operating_hours: { default: { start: '09:00', end: '17:00' } },
        slot_generation: 'automatic',
        automatic_config: {
          slot_duration: 60,
          buffer_time: 0,
          break_times: [
            { start_time: '12:00', end_time: '13:00', reason: 'Lunch' }
          ]
        }
      };
      const slots = TimeSlotGeneratorService.generateSlotsForDate(config, '2025-02-01');
      expect(slots.find(s => s.start_time.includes('12:00'))).toBeUndefined();
    });
  });
});
```

### Integration Tests

```typescript
describe('Reservation Flow with Booking Configuration', () => {
  it('should create reservation with custom slots', async () => {
    // 1. Create resource with custom slots
    const resource = await createResource({
      ...resourceData,
      booking_config: {
        time_slot_config: {
          slot_generation: 'custom',
          custom_slots: [
            { name: 'Morning Session', start_time: '09:00', end_time: '11:00', max_capacity: 1 }
          ]
        }
      }
    });

    // 2. Get available slots
    const slots = await ReservationService.getAvailableSlots(resource.id, '2025-02-01');
    expect(slots).toHaveLength(1);
    expect(slots[0].start_time).toContain('09:00');

    // 3. Create reservation
    const reservation = await ReservationService.createReservation({
      resource_id: resource.id,
      start_time: slots[0].start_time,
      end_time: slots[0].end_time,
      purpose: 'Test booking'
    }, userId);

    expect(reservation).toBeDefined();
  });
});
```

---

## 📦 Rollout Plan

### Pre-Deployment Checklist

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Migration script tested
- [ ] Backup strategy in place
- [ ] Rollback plan ready

### Deployment Steps

1. **Staging Deployment**
   - Deploy to staging environment
   - Run migration scripts
   - QA testing
   - Performance testing
   - User acceptance testing

2. **Production Deployment**
   - Backup database
   - Deploy code
   - Run migrations (if using Option 2)
   - Monitor logs
   - Test critical paths
   - Alert team

3. **Post-Deployment**
   - Monitor error rates
   - Check performance metrics
   - Gather user feedback
   - Document issues
   - Plan hotfixes if needed

### Rollback Strategy

If critical issues are found:

```bash
# 1. Revert code deployment
git revert <commit-hash>
npm run build
npm run deploy

# 2. Revert database (if using Option 2)
# Run rollback migration

# 3. Clear cache
# Clear booking config cache if implemented

# 4. Notify users
# Send notification about temporary issues
```

---

## 📊 Success Metrics

### Functional Metrics
- [ ] 100% of date modes working correctly
- [ ] Custom slots displayed in time picker
- [ ] Blackout dates prevent bookings
- [ ] Weekly patterns enforced

### Performance Metrics
- [ ] Calendar load time < 500ms
- [ ] Slot generation time < 200ms
- [ ] No performance regression

### User Experience Metrics
- [ ] Configuration completion rate > 80%
- [ ] User errors during booking < 5%
- [ ] Admin satisfaction with config UI > 4/5

---

## 🔄 Future Enhancements

1. **Recurring Availability Patterns**
   - Bi-weekly patterns
   - Monthly patterns (e.g., first Monday of month)
   - Seasonal availability

2. **Dynamic Pricing**
   - Peak hour pricing
   - Weekend vs weekday pricing
   - Advanced booking discounts

3. **Capacity Management**
   - Concurrent bookings per slot
   - Resource sharing
   - Overflow to similar resources

4. **Smart Scheduling**
   - AI-suggested time slots
   - Auto-optimization of slots
   - Predict availability based on patterns

5. **Bulk Operations**
   - Copy config to similar resources
   - Bulk blackout date management
   - Template-based configuration

---

## 📝 Appendix

### A. Example Configurations

#### Example 1: Seminar Hall (Weekdays Only)
```json
{
  "date_availability": {
    "mode": "weekly_pattern",
    "weekly_pattern": {
      "days_of_week": [1, 2, 3, 4, 5],
      "exclude_holidays": true
    }
  },
  "time_slot_config": {
    "operating_hours": {
      "default": { "start": "09:00", "end": "17:00" }
    },
    "slot_generation": "custom",
    "custom_slots": [
      { "name": "Morning Session", "start_time": "09:00", "end_time": "12:00", "max_capacity": 1 },
      { "name": "Afternoon Session", "start_time": "14:00", "end_time": "17:00", "max_capacity": 1 }
    ]
  }
}
```

#### Example 2: Sports Equipment (Flexible Hours)
```json
{
  "date_availability": {
    "mode": "all_dates",
    "advance_booking_limit": 30,
    "same_day_booking": true
  },
  "time_slot_config": {
    "operating_hours": {
      "default": { "start": "06:00", "end": "21:00" }
    },
    "slot_generation": "automatic",
    "automatic_config": {
      "slot_duration": 120,
      "buffer_time": 15
    }
  }
}
```

#### Example 3: Lab Equipment (Semester Only)
```json
{
  "date_availability": {
    "mode": "custom_dates",
    "custom_date_ranges": [
      {
        "start_date": "2025-01-15",
        "end_date": "2025-05-15",
        "label": "Spring Semester"
      },
      {
        "start_date": "2025-08-01",
        "end_date": "2025-12-15",
        "label": "Fall Semester"
      }
    ],
    "blackout_dates": [
      { "date": "2025-03-15", "reason": "Mid-term Break" },
      { "date": "2025-11-23", "reason": "Thanksgiving" }
    ]
  },
  "time_slot_config": {
    "operating_hours": {
      "default": { "start": "08:00", "end": "18:00" }
    },
    "slot_generation": "automatic",
    "automatic_config": {
      "slot_duration": 180,
      "buffer_time": 30,
      "break_times": [
        { "start_time": "12:00", "end_time": "13:00", "reason": "Lunch Break" }
      ]
    }
  }
}
```

### B. API Endpoints (if needed)

```typescript
// GET /api/resources/:id/available-dates?month=2&year=2025
// Returns: string[] - List of available dates

// GET /api/resources/:id/available-slots?date=2025-02-01
// Returns: TimeSlot[] - Available time slots for date

// POST /api/resources/:id/validate-booking
// Body: { date, start_time, end_time }
// Returns: { valid: boolean, errors: string[] }

// GET /api/resources/:id/booking-config
// Returns: EnhancedBookingConfiguration

// PUT /api/resources/:id/booking-config
// Body: EnhancedBookingConfiguration
// Returns: Resource
```

---

**Document Version:** 1.0
**Last Updated:** 2025-01-16
**Prepared By:** Claude Code
**Status:** Ready for Review & Implementation
