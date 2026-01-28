# Dashboard Widget System Cleanup - Implementation Plan

**Date:** 2025-01-28
**Option:** B - Remove Entire Dashboard Widget System
**Status:** 🚧 IN PROGRESS

---

## ✅ Pre-Cleanup Checklist

- [x] User confirmed Option B
- [x] Backup plan created (git commit before cleanup)
- [x] Implementation tasks created
- [ ] Files backed up
- [ ] Cleanup executed
- [ ] Testing completed

---

## 📋 Phase 1: Delete Component Files

### Files to Delete (Components):
- [ ] `components/dashboard/dashboard-layout.tsx`
- [ ] `components/dashboard/dashboard-widget.tsx`
- [ ] `components/dashboard/dashboard-drag-context.tsx`
- [ ] `components/dashboard/widget-resize-handles.tsx`
- [ ] `components/dashboard/stat-card-with-chart.tsx`

### Files to Delete (App Components):
- [ ] `app/(routes)/dashboard/_components/dashboard-client-wrapper.tsx`
- [ ] `app/(routes)/dashboard/_components/dashboard-controls.tsx`
- [ ] `app/(routes)/dashboard/_components/widget-selection-dialog.tsx`
- [ ] `app/(routes)/dashboard/_components/dashboard-skeleton.tsx`

### Files to Delete (Data Layer):
- [ ] `app/(routes)/dashboard/_data/get-dashboard-data.ts`

---

## 📋 Phase 2: Delete Service & Utility Files

### Service Files to Delete:
- [ ] `lib/services/dashboard/dashboard-service.ts`
- [ ] `lib/services/dashboard/student-widget-service.ts`

### Utility Files to Delete:
- [ ] `lib/utils/dashboard-grid-utils.ts`
- [ ] `lib/utils/chart-utils.ts`

### Hook Files to Delete:
- [ ] `hooks/use-dashboard.ts`

### Type Files to Delete:
- [ ] `types/dashboard.ts`

---

## 📋 Phase 3: Delete API Routes

### API Route Files to Delete:
- [ ] `app/api/dashboard/widgets/route.ts`
- [ ] `app/api/dashboard/configurations/route.ts`
- [ ] `app/api/dashboard/student-widgets/route.ts`
- [ ] `app/api/dashboard/widget-types/route.ts`

---

## 📋 Phase 4: Update Main Dashboard Page

### File: `app/(routes)/dashboard/page.tsx`

**Remove:**
- Lines 8-9: `getDashboardConfigurations`, `getAvailableWidgetTypes` imports
- Lines 12-13: `DashboardControls`, `DashboardClientWrapper` imports
- Lines 14-18: Dashboard skeleton imports
- Lines 50-60: DashboardControlsSection
- Lines 62-65: DashboardWidgetsSection
- Lines 86-103: DashboardControlsSection component
- Lines 105-129: DashboardWidgetsSection component
- Lines 134-148: EmptyDashboard component
- Lines 153-171: ErrorDashboard component

**Keep:**
- Lines 1-11: Core imports (Suspense, ContentLayout, BentoGrid)
- Lines 36-48: Background gradient
- Lines 46-48: BentoGridSection
- Lines 74-83: BentoGridSection component

---

## 📋 Phase 5: Clean Up Dependencies

### File: `lib/query-keys.ts`

**Remove dashboard query keys:**
```typescript
dashboard: {
  configurations: ['dashboard', 'configurations'],
  widgets: (configId: string) => ['dashboard', 'widgets', configId],
  widgetTypes: ['dashboard', 'widget-types'],
}
```

---

## 📋 Phase 6: Database Cleanup

### Create Migration: `20250128_remove_dashboard_widget_system.sql`

```sql
-- Drop dashboard tables and all dependencies
DROP TABLE IF EXISTS public.dashboard_widgets CASCADE;
DROP TABLE IF EXISTS public.dashboard_widget_types CASCADE;
DROP TABLE IF EXISTS public.dashboard_configurations CASCADE;

-- Remove any related functions
DROP FUNCTION IF EXISTS update_dashboard_configuration_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_dashboard_widget_updated_at() CASCADE;

-- Remove any related views
DROP VIEW IF EXISTS dashboard_widgets_with_types CASCADE;
DROP VIEW IF EXISTS user_dashboard_summary CASCADE;
```

### Update: `supabase/setup/01_tables.sql`

**Remove SECTION 13 (Lines 1220-1262):**
```sql
-- SECTION 13: DASHBOARD AND ANALYTICS
-- Remove entire section
```

### Update: `supabase/setup/03_policies.sql`

**Remove all dashboard RLS policies:**
- Search for "dashboard_configurations"
- Search for "dashboard_widget_types"
- Search for "dashboard_widgets"
- Delete all matching policy blocks

### Update: `supabase/setup/04_triggers.sql`

**Remove dashboard triggers:**
- Search for "dashboard_configurations"
- Search for "dashboard_widgets"
- Delete all matching trigger blocks

### Update: `supabase/setup/06_foreign_keys.sql`

**Remove dashboard foreign keys:**
- Search for "dashboard_widgets"
- Search for "dashboard_configurations"
- Delete all matching FK blocks

### Delete: `supabase/migrations/20251227_add_student_dashboard_widgets.sql`

---

## 📋 Phase 7: Clean Up Documentation

### Files to Delete:
- [ ] `STAT_CARDS_IMPROVEMENT_SUMMARY.md`
- [ ] `docs/features/2025-01-28-FIX-stat-cards-charts.md`
- [ ] `docs/features/2025-01-28-FEATURE-enhanced-stat-cards-bento-grid.md`

### Files to Update:
- [ ] `supabase/SQL_FILE_INDEX.md` - Remove dashboard table references
- [ ] `docs/DOCUMENTATION_INDEX.md` - Remove dashboard feature docs

---

## 📋 Phase 8: Final Verification

### Test Checklist:
- [ ] Dashboard page loads without errors
- [ ] BentoGrid displays correctly (greeting, time, weather)
- [ ] No console errors related to missing components
- [ ] No TypeScript errors
- [ ] No broken imports
- [ ] Database migration runs successfully
- [ ] No orphaned files remain

---

## 🔄 Rollback Plan

If issues arise:
1. `git revert` to previous commit
2. Restore database tables from backup
3. Re-run setup scripts

---

## 📝 Summary of Changes

### Files Deleted: 24
- **Components**: 9 files
- **Services**: 2 files
- **Utilities**: 2 files
- **Hooks**: 1 file
- **Types**: 1 file
- **API Routes**: 4 files
- **Migrations**: 1 file
- **Documentation**: 3 files
- **Other**: 1 file

### Files Modified: 7
- `app/(routes)/dashboard/page.tsx` - Simplified to BentoGrid only
- `lib/query-keys.ts` - Removed dashboard keys
- `supabase/setup/01_tables.sql` - Removed SECTION 13
- `supabase/setup/03_policies.sql` - Removed dashboard policies
- `supabase/setup/04_triggers.sql` - Removed dashboard triggers
- `supabase/setup/06_foreign_keys.sql` - Removed dashboard FKs
- `supabase/SQL_FILE_INDEX.md` - Updated index

### Database Changes:
- **Tables Dropped**: 3 (dashboard_configurations, dashboard_widget_types, dashboard_widgets)
- **Policies Removed**: ~6-9 RLS policies
- **Triggers Removed**: ~2-3 triggers
- **Foreign Keys Removed**: ~3-4 constraints

---

**Status:** Ready to execute cleanup
**Estimated Time:** 2-3 hours
**Risk Level:** HIGH (Major feature removal)

