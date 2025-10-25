# Timetable Detail Page - Performance Optimization Plan

**Created:** 2025-10-25
**Module:** Academic Timetables
**Current File:** `app/(routes)/academic/timetables/[id]/page.tsx`
**Issue:** Slow page load, complex code structure

---

## 🚨 Current Problems

### Performance Issues
- **File Size:** 3,307 lines, 32,281 tokens (too large for single component)
- **Hook Count:** 73 React hooks (useState, useEffect, useCallback)
- **State Variables:** 30+ state variables in main component
- **Load Time:** Takes several seconds to render
- **Memory:** Heavy initial bundle, no code splitting

### Code Quality Issues
- **No Separation of Concerns:** Data fetching, UI logic, business logic all mixed
- **Massive Inline Logic:** Complex calculations inline in JSX
- **State Management Chaos:** Related state scattered across file
- **Hard to Maintain:** Changes require reading 3000+ lines
- **No Memoization:** Expensive computations re-run on every render

---

## 🎯 Optimization Strategy

### Phase 1: Extract Custom Hooks (Day 1)
**Goal:** Move data fetching and state management out of main component

#### 1.1 Create `hooks/academic/use-timetable-detail.ts`
**Responsibility:** Fetch and manage timetable data
```typescript
export function useTimetableDetail(timetableId: string) {
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch timetable logic
  }, [timetableId]);

  return {
    timetable,
    loading,
    error,
    refetch: () => {}, // Refetch function
    updateTimetable: () => {} // Update function
  };
}
```

#### 1.2 Create `hooks/academic/use-timetable-periods.ts`
**Responsibility:** Manage period selection and configuration
```typescript
export function useTimetablePeriods(timetable: Timetable | null) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(false);

  // Logic for fetching and managing periods

  return {
    periods,
    selectedPeriods,
    loading,
    selectPeriod: () => {},
    savePeriods: () => {}
  };
}
```

#### 1.3 Create `hooks/academic/use-timetable-dialogs.ts`
**Responsibility:** Manage all dialog states
```typescript
export function useTimetableDialogs() {
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [subdivisionDialogOpen, setSubdivisionDialogOpen] = useState(false);
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return {
    slotDialog: {
      isOpen: slotDialogOpen,
      open: () => setSlotDialogOpen(true),
      close: () => setSlotDialogOpen(false)
    },
    subdivisionDialog: {
      isOpen: subdivisionDialogOpen,
      open: () => setSubdivisionDialogOpen(true),
      close: () => setSubdivisionDialogOpen(false)
    },
    // ... other dialogs
  };
}
```

#### 1.4 Create `hooks/academic/use-staff-planning-data.ts`
**Responsibility:** Fetch staff planning courses and staff
```typescript
export function useStaffPlanningData(timetable: Timetable | null) {
  const [courses, setCourses] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!timetable) return;
    // Fetch staff planning data
  }, [timetable?.semester_id]);

  return { courses, staff, loading };
}
```

### Phase 2: Extract Utility Functions (Day 1-2)
**Goal:** Move complex logic out of component

#### 2.1 Create `lib/utils/timetable-utils.ts`
```typescript
/**
 * Validate date range for overlaps
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  existingRanges: Array<{ start: string; end: string }>
): { valid: boolean; overlappingDates?: string[] } {
  // Date range validation logic
}

/**
 * Generate all dates in a range
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Check if periods are locked (have attendance)
 */
export function checkLockedPeriods(
  timetableId: string,
  periodIds: string[]
): Promise<string[]> {
  // Check attendance logic
}

/**
 * Export timetable to PDF
 */
export function exportTimetableToPDF(
  timetable: Timetable,
  format: 'regular' | 'batch'
): Promise<void> {
  // PDF export logic
}
```

#### 2.2 Create `lib/utils/timetable-slot-utils.ts`
```typescript
/**
 * Build slot data for save
 */
export function buildSlotData(config: {
  period: Period;
  day: DayOfWeek | string;
  courseId?: string;
  staffIds?: string[];
  sectionIds?: string[];
  isBreak?: boolean;
  subdivisionConfig?: any;
}) {
  // Build slot data structure
}

/**
 * Validate slot before save
 */
export function validateSlot(slotData: any): { valid: boolean; error?: string } {
  // Validation logic
}
```

### Phase 3: Component Extraction (Day 2-3)
**Goal:** Split monolithic component into smaller, focused components

#### 3.1 Extract Dialogs (with Lazy Loading)
```typescript
// Use dynamic imports for heavy dialogs
const SlotDialog = lazy(() => import('./_components/slot-dialog'));
const SubdivisionDialog = lazy(() => import('./_components/subdivision-config-dialog'));
const TemplateDialog = lazy(() => import('./_components/template-dialog'));
```

#### 3.2 Create `_components/timetable-actions.tsx`
**Responsibility:** Action buttons (Save, Export, Template, etc.)
```typescript
export function TimetableActions({
  timetable,
  onSave,
  onExport,
  onSaveAsTemplate,
  canEdit
}: TimetableActionsProps) {
  return (
    <div className="flex gap-2">
      {canEdit && (
        <Button onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      )}
      {/* ... other action buttons */}
    </div>
  );
}
```

#### 3.3 Create `_components/timetable-controls.tsx`
**Responsibility:** Format selector, day config, period selection
```typescript
export function TimetableControls({
  format,
  onFormatChange,
  selectedDays,
  onDaysChange,
  selectedPeriods,
  onPeriodsChange
}: TimetableControlsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timetable Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Format selector */}
        {/* Day configuration */}
        {/* Period selection */}
      </CardContent>
    </Card>
  );
}
```

#### 3.4 Create `_components/date-range-manager.tsx`
**Responsibility:** Batch mode date range management
```typescript
export function DateRangeManager({
  ranges,
  onAddRange,
  onRemoveRange,
  existingDates
}: DateRangeManagerProps) {
  // Date range management UI
}
```

### Phase 4: Performance Optimizations (Day 3-4)
**Goal:** Add memoization and optimize renders

#### 4.1 Memoize Expensive Computations
```typescript
// In main component
const processedSlots = useMemo(() => {
  return slots.map(slot => enrichSlotWithDetails(slot, courses, staff));
}, [slots, courses, staff]);

const lockedPeriods = useMemo(() => {
  return checkLockedPeriods(timetableId, periods.map(p => p.id));
}, [timetableId, periods]);
```

#### 4.2 Optimize Components with React.memo
```typescript
export const TimetableGrid = memo(function TimetableGrid({
  slots,
  periods,
  days,
  format,
  onSlotClick
}: TimetableGridProps) {
  // Component logic
}, (prevProps, nextProps) => {
  // Custom comparison
  return prevProps.slots === nextProps.slots &&
         prevProps.periods === nextProps.periods;
});
```

#### 4.3 Debounce Search Inputs
```typescript
const debouncedStaffSearch = useMemo(
  () => debounce((query: string) => setStaffSearchQuery(query), 300),
  []
);
```

#### 4.4 Virtual Scrolling for Large Lists
```typescript
// For period selector with many periods
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={periods.length}
  itemSize={50}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <PeriodItem period={periods[index]} />
    </div>
  )}
</FixedSizeList>
```

### Phase 5: State Management Optimization (Day 4)
**Goal:** Group related state, reduce re-renders

#### 5.1 Group Related State with useReducer
```typescript
// Instead of multiple useState for dialog states
type DialogState = {
  slotDialog: boolean;
  subdivisionDialog: boolean;
  templateDialog: boolean;
  deleteDialog: boolean;
  periodSelector: boolean;
};

const [dialogStates, setDialogState] = useReducer(
  (state: DialogState, update: Partial<DialogState>) => ({
    ...state,
    ...update
  }),
  {
    slotDialog: false,
    subdivisionDialog: false,
    templateDialog: false,
    deleteDialog: false,
    periodSelector: false
  }
);
```

#### 5.2 Context for Timetable Data
```typescript
// Create context to avoid prop drilling
const TimetableContext = createContext<TimetableContextValue | null>(null);

export function TimetableProvider({ children, timetableId }) {
  const timetableData = useTimetableDetail(timetableId);
  const periods = useTimetablePeriods(timetableData.timetable);
  const staffPlanning = useStaffPlanningData(timetableData.timetable);

  return (
    <TimetableContext.Provider value={{
      ...timetableData,
      periods,
      staffPlanning
    }}>
      {children}
    </TimetableContext.Provider>
  );
}
```

---

## 📊 Expected Results

### Before Optimization
- **File Size:** 3,307 lines
- **Hooks:** 73 hooks in one component
- **Load Time:** 3-5 seconds
- **Bundle Size:** ~150KB for page
- **Maintainability:** Very Low

### After Optimization
- **Main File Size:** ~300-400 lines
- **Hooks per Component:** <10 hooks average
- **Load Time:** <1 second
- **Bundle Size:** ~80KB (lazy loaded dialogs)
- **Maintainability:** High

### Performance Gains
- ✅ **60% faster initial load** (lazy loading dialogs)
- ✅ **70% smaller main component** (extracted hooks and utils)
- ✅ **50% fewer re-renders** (memoization)
- ✅ **Better code splitting** (smaller initial bundle)
- ✅ **Improved developer experience** (easier to find and fix bugs)

---

## 🗂️ New File Structure

```
app/(routes)/academic/timetables/[id]/
├── page.tsx (300-400 lines - main coordinator)
├── _components/
│   ├── timetable-header.tsx ✅ (exists)
│   ├── timetable-grid.tsx ✅ (exists)
│   ├── batch-timetable-grid.tsx ✅ (exists)
│   ├── slot-dialog.tsx ✅ (exists)
│   ├── subdivision-config-dialog.tsx ✅ (exists)
│   ├── timetable-actions.tsx ⭐ NEW
│   ├── timetable-controls.tsx ⭐ NEW
│   ├── date-range-manager.tsx ⭐ NEW
│   ├── template-dialog.tsx ⭐ NEW
│   ├── unsaved-changes-dialog.tsx ⭐ NEW
│   └── period-selector-dialog.tsx ⭐ NEW
├── _hooks/
│   ├── use-timetable-detail.ts ⭐ NEW
│   ├── use-timetable-periods.ts ⭐ NEW
│   ├── use-timetable-dialogs.ts ⭐ NEW
│   └── use-staff-planning-data.ts ⭐ NEW
└── _utils/
    ├── timetable-utils.ts ⭐ NEW
    └── timetable-slot-utils.ts ⭐ NEW
```

---

## 🚀 Implementation Timeline

### Day 1: Custom Hooks
- [ ] Create `use-timetable-detail.ts`
- [ ] Create `use-timetable-periods.ts`
- [ ] Create `use-timetable-dialogs.ts`
- [ ] Create `use-staff-planning-data.ts`
- [ ] Test hooks in isolation

### Day 2: Utility Functions & Components
- [ ] Create `timetable-utils.ts`
- [ ] Create `timetable-slot-utils.ts`
- [ ] Extract `timetable-actions.tsx`
- [ ] Extract `timetable-controls.tsx`
- [ ] Extract `date-range-manager.tsx`

### Day 3: Dialog Extraction & Lazy Loading
- [ ] Extract `template-dialog.tsx`
- [ ] Extract `unsaved-changes-dialog.tsx`
- [ ] Extract `period-selector-dialog.tsx`
- [ ] Implement lazy loading for all dialogs
- [ ] Test dialog interactions

### Day 4: Performance Optimizations
- [ ] Add useMemo for expensive computations
- [ ] Add React.memo to grid components
- [ ] Implement debouncing for search inputs
- [ ] Create TimetableContext (if needed)
- [ ] Add virtual scrolling for period list

### Day 5: Refactor Main Component
- [ ] Integrate all custom hooks
- [ ] Replace inline logic with utils
- [ ] Remove extracted components
- [ ] Test full page functionality
- [ ] Performance testing

### Day 6: Testing & Polish
- [ ] Test with large datasets
- [ ] Test all user interactions
- [ ] Verify no regressions
- [ ] Measure performance improvements
- [ ] Document changes

**Total Estimated Time:** 5-6 days

---

## ✅ Success Criteria

- [ ] Main component <500 lines
- [ ] Page loads in <1 second
- [ ] No functionality regressions
- [ ] All existing features work
- [ ] Code is easier to maintain
- [ ] Ready for dual-mode implementation

---

## 🎯 Next Steps

1. **Approve this plan**
2. **Begin Phase 1: Extract custom hooks**
3. **Test incrementally** (don't break existing functionality)
4. **Merge optimizations**
5. **Then proceed with dual-mode implementation**

**Note:** We'll do this refactoring BEFORE implementing the dual-mode period system to ensure we're building new features on a solid, performant foundation.
