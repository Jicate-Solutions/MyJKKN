### Implementation Plan: Batch Timetable Feature

This document outlines the steps to implement the "Batch Timetable" feature, which allows creating timetables based on a date range instead of days of the week.

#### 1. Database Schema Changes

First, I'll modify the `timetables` table to support different formats.

- **Add `timetable_format` to `timetables` table:**

  - I will add a new column `timetable_format` to the `timetables` table.
  - This column will be of type `text` and will have a `DEFAULT` value of `'regular'`.
  - It will store the format of the timetable, either `'regular'` (day-wise) or `'batch'` (date-wise).
  - I will execute the following SQL migration:

    ```sql
    ALTER TABLE public.timetables
    ADD COLUMN timetable_format TEXT NOT NULL DEFAULT 'regular';

    COMMENT ON COLUMN public.timetables.timetable_format IS 'The format of the timetable, e.g., ''regular'' (day-wise) or ''batch'' (date-wise).';
    ```

- **Update `timetable_slots` table:**
  - To support date-based slots for the "Batch" format, I will add a nullable `slot_date` column to the `timetable_slots` table.
  - The `day_of_week` column will become nullable as it will only be used for "Regular" timetables.
  - I will execute this SQL migration:

    ```sql
    ALTER TABLE public.timetable_slots
    ADD COLUMN slot_date DATE,
    ALTER COLUMN day_of_week DROP NOT NULL;

    COMMENT ON COLUMN public.timetable_slots.slot_date IS 'The specific date for a timetable slot, used for ''batch'' format timetables.';

    ALTER TABLE public.timetable_slots
    ADD CONSTRAINT check_slot_type
    CHECK (
      (day_of_week IS NOT NULL AND slot_date IS NULL) OR
      (day_of_week IS NULL AND slot_date IS NOT NULL) OR
      (is_break_slot = true)
    );
    ```

#### 2. Backend Service Layer (`lib/services/academic/`)

Next, I will update the backend services to handle the new timetable format.

- **`TimetableService`:**

  - I will update the `createTimetable` and `updateTimetable` functions to handle the `timetable_format` field.
  - I will modify `createTimetableSlot` and `updateTimetableSlot` to accept either `day_of_week` or `slot_date`.
  - The logic for fetching timetable data in `getTimetable` will be updated to correctly handle both formats.

- **`AttendanceService`:**
  - I will modify `getAvailablePeriodsForDate` to work with both "Regular" and "Batch" timetables. For "Batch" timetables, it will check for slots matching the given date.

#### 3. Frontend UI (`app/(routes)/academic/timetables/`)

I will then implement the necessary changes on the frontend.

- **Timetable Details Page (`[id]/page.tsx`):**

  - Before the "Configure Periods" button, I will add a `Select` component to choose the `timetable_format` ('Regular' or 'Batch'). This will be disabled after the first slot is created.
  - Based on the selected format, I will conditionally render either the existing day-wise grid (`TimetableGrid`) or a new `BatchTimetableGrid` component.

- **New Component: `BatchTimetableGrid`:**

  - I will create a new component `app/(routes)/academic/timetables/[id]/_components/batch-timetable-grid.tsx`.
  - This component will display dates on the vertical axis and periods on the horizontal axis.
  - It will fetch and display slots based on `slot_date`.

- **Slot Dialog (`[id]/_components/slot-dialog.tsx`):**
  - I will update the slot creation/editing dialog to conditionally show a `day_of_week` dropdown for "Regular" timetables or a `DatePicker` for "Batch" timetables.

#### 4. Type Definitions (`types/academics.ts`)

Finally, I will update the TypeScript types.

- I will add `timetable_format` to the `Timetable` interface.
- I will add an optional `slot_date` field to the `TimetableSlot` interface and make `day_of_week` optional.
