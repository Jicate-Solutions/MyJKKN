# Personalized Dashboard System

**Date**: 2026-01-30
**Type**: Feature Implementation
**Status**: Phase 1 Complete (Settings UI and Core Infrastructure)
**Module**: Dashboard

---

## Overview

Implemented a personalized role-based dashboard system that allows users to customize which widgets appear on their dashboard. The system supports different widget sets for different user roles (student, faculty, leadership, admin) and stores individual user preferences.

---

## Implemented Features (Phase 1)

### 1. Database Schema

#### Table: `user_dashboard_preferences`
Stores individual user widget visibility preferences.

```sql
CREATE TABLE user_dashboard_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  widget_id VARCHAR(100) NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role, widget_id)
);

-- Indexes
CREATE INDEX idx_user_dashboard_prefs_user_role
  ON user_dashboard_preferences(user_id, role);
CREATE INDEX idx_user_dashboard_prefs_widget
  ON user_dashboard_preferences(widget_id);
```

**Purpose**: Tracks which widgets each user wants visible on their dashboard for each role they have.

**Key Fields**:
- `user_id`: Reference to auth.users
- `role`: User's role (student, faculty, principal, hod, admin, super_admin)
- `widget_id`: Unique identifier for widget (e.g., 'student_attendance', 'celebrations_today')
- `is_visible`: Boolean flag for visibility
- Composite primary key prevents duplicate preferences

#### Table: `dashboard_widgets`
Registry of available widgets per role.

```sql
CREATE TABLE dashboard_widgets (
  widget_id VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  default_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (widget_id, role)
);

-- Indexes
CREATE INDEX idx_dashboard_widgets_role
  ON dashboard_widgets(role);
CREATE INDEX idx_dashboard_widgets_category
  ON dashboard_widgets(category);
```

**Purpose**: Defines which widgets are available for each role, their metadata, and default visibility.

**Key Fields**:
- `widget_id`: Unique widget identifier
- `role`: Which role can see this widget
- `title`: Display name
- `description`: Help text
- `category`: Grouping (Academic, Finance, Community, Personal, etc.)
- `default_visible`: Whether widget shows by default
- `display_order`: Sort order (for future drag-and-drop)

**Migration**: `supabase/migrations/20260130140000_create_dashboard_tables.sql`

---

### 2. Widget Registry

**File**: `app/(routes)/dashboard/_components/widget-registry.ts`

Defines available widgets for each role:

**Student Widgets** (5 widgets):
- `student_attendance` - My Attendance (Academic)
- `student_timetable_today` - Today's Classes (Academic)
- `student_billing` - Fee Summary (Finance)
- `celebrations_today` - Today's Celebrations (Community)
- `my_celebration_countdown` - My Next Milestone (Personal)

**Faculty Widgets** (4 widgets):
- `faculty_classes_today` - Today's Teaching Schedule (Academic)
- `faculty_pending_attendance` - Pending Attendance (Academic)
- `faculty_students_overview` - My Students (Academic)
- `celebrations_today` - Today's Celebrations (Community)

**Leadership Widgets** (HOD, Principal) (4 widgets):
- `leadership_overview` - Department Overview (Overview)
- `leadership_attendance_summary` - Attendance Summary (Academic)
- `leadership_pending_approvals` - Pending Approvals (Administration)
- `celebrations_today` - Today's Celebrations (Community)

**Admin Widgets** (4 widgets):
- `admin_system_overview` - System Overview (System)
- `admin_recent_activity` - Recent Activity (Activity)
- `admin_at_risk_students` - At-Risk Students (Academic)
- `celebrations_today` - Today's Celebrations (Community)

---

### 3. Service Layer

**File**: `lib/services/dashboard/dashboard-preferences-service.ts`

**Class**: `DashboardPreferencesService`

**Methods**:

```typescript
// Get user's widget preferences for their role
static async getPreferences(userId: string, role: string):
  Promise<Record<string, boolean>>

// Update single widget visibility
static async updatePreference(
  userId: string,
  role: string,
  widgetId: string,
  isVisible: boolean
): Promise<void>

// Delete all preferences (reset to defaults)
static async resetPreferences(userId: string, role: string): Promise<void>
```

**Features**:
- Upsert logic for preferences (create or update)
- Returns preferences as key-value map for easy lookup
- Enhanced logging for debugging
- Error handling with descriptive messages

---

### 4. React Query Hooks

**File**: `hooks/dashboard/use-dashboard-preferences.ts`

**Hooks**:

```typescript
// Fetch preferences (with infinite stale time - rarely change)
useDashboardPreferences(userId: string | null, role: string | null)

// Update preference (with optimistic updates)
useUpdatePreference()

// Reset all preferences (with loading state)
useResetPreferences()
```

**Features**:
- Optimistic UI updates for instant feedback
- Automatic rollback on error
- Toast notifications for success/error
- Query invalidation on reset
- Disabled state while updating

---

### 5. UI Components

#### Dashboard Settings Dialog
**File**: `app/(routes)/dashboard/_components/dashboard-settings-dialog.tsx`

**Component**: `DashboardSettingsDialog`

**Features**:
- Modal dialog with settings trigger button
- Mobile-responsive ("Settings" vs "Customize Dashboard")
- Scrollable content for many widgets
- Reset to defaults button with confirmation alert
- Loading states during reset operation
- Uses shadcn/ui Dialog and AlertDialog components

**Props**:
```typescript
interface DashboardSettingsDialogProps {
  userId: string;
  role: string;
}
```

#### Widget Visibility Settings
**File**: `app/(routes)/dashboard/_components/widget-visibility-settings.tsx`

**Component**: `WidgetVisibilitySettings`

**Features**:
- Grouped by category for organization
- Switch component for toggle
- Visual feedback with color coding:
  - Green background for visible widgets
  - Gray background for hidden widgets
- Optimistic UI updates
- Loading state with spinner
- Disabled state during updates
- Widget title, description, and category

**Props**:
```typescript
interface WidgetVisibilitySettingsProps {
  userId: string;
  role: string;
}
```

---

## Tech Stack

- **Database**: PostgreSQL (Supabase)
- **ORM**: Supabase Client
- **State Management**: React Query (TanStack Query v5)
- **UI Framework**: Next.js 14 (App Router)
- **UI Components**: shadcn/ui (Dialog, AlertDialog, Switch, Label, Separator, Button)
- **Icons**: Lucide React
- **Notifications**: react-hot-toast
- **TypeScript**: Strict mode

---

## File Structure

```
D:\Projects\MyJKKN\
├── supabase/
│   ├── migrations/
│   │   └── 20260130140000_create_dashboard_tables.sql
│   └── SQL_FILE_INDEX.md (updated)
├── lib/
│   └── services/
│       └── dashboard/
│           └── dashboard-preferences-service.ts
├── hooks/
│   └── dashboard/
│       └── use-dashboard-preferences.ts
├── app/
│   └── (routes)/
│       └── dashboard/
│           └── _components/
│               ├── dashboard-settings-dialog.tsx (NEW)
│               ├── widget-visibility-settings.tsx (NEW)
│               └── widget-registry.ts (existing)
└── docs/
    └── features/
        └── 2026-01-30-FEATURE-personalized-dashboard.md (this file)
```

---

## Remaining Work (Future Phases)

### Phase 2: Additional Widgets
- [ ] Implement remaining student widgets (timetable, billing)
- [ ] Implement faculty widgets (classes today, pending attendance, students overview)
- [ ] Implement leadership widgets (overview, attendance summary, approvals)
- [ ] Implement admin widgets (system overview, recent activity, at-risk students)

### Phase 3: Drag-and-Drop Reordering
- [ ] Add `display_order` field to preferences
- [ ] Implement drag-and-drop with @dnd-kit
- [ ] Save custom order to database
- [ ] Visual feedback during drag

### Phase 4: Widget Size/Layout
- [ ] Add `size` field (small, medium, large)
- [ ] Responsive grid layout based on size
- [ ] User-configurable widget sizing

### Phase 5: Dashboard Analytics
- [ ] Track which widgets are most used
- [ ] Track which widgets are most hidden
- [ ] Usage analytics for each widget
- [ ] Dashboard engagement metrics

### Phase 6: Performance
- [ ] Widget lazy loading
- [ ] Skeleton loaders for widgets
- [ ] React.memo optimization
- [ ] Code splitting for heavy widgets

---

## Testing Notes

### Manual Testing Checklist

**Settings Dialog**:
- [x] Dialog opens on button click
- [x] Dialog is scrollable with many widgets
- [x] Mobile-responsive button text
- [x] Reset button shows confirmation alert
- [x] Loading states during reset

**Widget Visibility Settings**:
- [x] Widgets grouped by category
- [x] Toggle switch updates preference
- [x] Visual feedback (green/gray)
- [x] Optimistic updates (instant feedback)
- [x] Error rollback works
- [x] Loading state shows spinner
- [x] Disabled state during updates

**Database**:
- [x] Preferences saved correctly
- [x] Composite primary key prevents duplicates
- [x] Cascade delete on user deletion
- [x] Indexes improve query performance

**Edge Cases**:
- [x] No preferences = all visible (default)
- [x] Multiple roles per user work correctly
- [x] Reset removes all preferences for role
- [x] Concurrent updates handled gracefully

---

## Known Limitations

1. **No drag-and-drop reordering yet** - Widgets display in predefined order
2. **No widget size customization** - All widgets same size
3. **No real-time sync** - Changes don't sync across tabs (requires refresh)
4. **No undo/redo** - Reset is permanent (no rollback)
5. **Limited to predefined widgets** - Can't add custom widgets dynamically

---

## Migration Notes

### Running the Migration

```bash
# Apply migration via Supabase Dashboard SQL Editor
# Or via CLI:
supabase db push

# Verify tables created:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('user_dashboard_preferences', 'dashboard_widgets');
```

### Seeding Widget Data

Widget data is seeded via `supabase/migrations/20260130140001_seed_dashboard_widgets.sql`:

```sql
-- Inserts all widgets from widget-registry.ts
-- Sets default_visible = true for all
-- Sets display_order based on array order
```

### RLS Policies

```sql
-- Users can only see/update their own preferences
CREATE POLICY "Users can view own preferences"
  ON user_dashboard_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_dashboard_preferences FOR ALL
  USING (auth.uid() = user_id);

-- Anyone can read widget registry
CREATE POLICY "Anyone can view widgets"
  ON dashboard_widgets FOR SELECT
  TO authenticated
  USING (true);
```

---

## Performance Considerations

1. **Query Optimization**:
   - Composite index on (user_id, role) for fast preference lookup
   - Separate index on widget_id for admin queries
   - Small table size (< 100 rows per user typically)

2. **React Query Caching**:
   - `staleTime: Infinity` for preferences (rarely change)
   - Optimistic updates prevent unnecessary refetches
   - Manual invalidation only on reset

3. **Component Optimization**:
   - Minimal re-renders with useMemo for grouped widgets
   - Disabled state prevents multiple simultaneous updates
   - Toast notifications batched (one per mutation)

4. **Database**:
   - Upsert reduces round trips
   - Cascade delete prevents orphaned preferences
   - Timestamptz for updated_at tracking

---

## Related Documentation

- `supabase/SQL_FILE_INDEX.md` - SQL file tracking
- `CLAUDE.md` - Project setup and conventions
- Widget implementation docs (future)
- Dashboard analytics docs (future)

---

## Contributors

- Claude Sonnet 4.5
- Development Team

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-30 | Initial implementation (Phase 1) |
| 1.1 | TBD | Phase 2 - Additional widgets |
| 2.0 | TBD | Phase 3 - Drag-and-drop |

---

**Last Updated**: 2026-01-30
