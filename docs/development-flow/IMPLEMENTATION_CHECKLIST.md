# New Module Implementation Checklist

## Pre-Implementation Phase

- [ ] Define module scope and features
- [ ] Document module hierarchy (parent-child relationships)
- [ ] Identify required permissions
- [ ] List main entities and relationships
- [ ] Plan database schema

## Database Phase

- [ ] Create tables in supabase/setup/01_tables.sql
- [ ] Add foreign key constraints
- [ ] Create indexes on frequently queried columns
- [ ] Create triggers for updated_at (supabase/setup/04_triggers.sql)
- [ ] Create RLS policies (supabase/setup/03_policies.sql)
- [ ] Create database functions if needed (supabase/setup/02_functions.sql)
- [ ] Test all database operations in Supabase dashboard

## Type Definition Phase

- [ ] Create types/[module].ts
- [ ] Define main entity interface
- [ ] Define Create DTO
- [ ] Define Update DTO
- [ ] Define Filter interface
- [ ] Define response/list interface
- [ ] Export all types

## Service Layer Phase

- [ ] Create lib/services/[module]/[entity]-service.ts
- [ ] Implement getEntity (with pagination & filters)
- [ ] Implement getEntityById
- [ ] Implement createEntity
- [ ] Implement updateEntity
- [ ] Implement deleteEntity
- [ ] Add error handling and logging
- [ ] Test service methods

## Hook Layer Phase

- [ ] Create hooks/[module]/use-[entity].ts
- [ ] Implement useState for entities, loading, error
- [ ] Implement fetchEntity with useCallback
- [ ] Implement useEffect to call fetch
- [ ] Implement create/update/delete callbacks
- [ ] Handle institution filtering
- [ ] Test hook functionality

## Component Layer Phase

### Data Table Components
- [ ] Create _components/data-table-schema.ts (Zod schema)
- [ ] Create _components/columns.tsx (column definitions)
- [ ] Create _components/[entity]-data-table.tsx
- [ ] Create _components/[entity]-filters.tsx
- [ ] Create _components/row-actions.tsx
- [ ] Test data table rendering and filtering

### Form Components
- [ ] Create _components/[entity]-form.tsx
- [ ] Define Zod validation schema
- [ ] Implement all form fields
- [ ] Add error handling
- [ ] Test form submission

### Other Components
- [ ] Create detail components if needed
- [ ] Create dialog/modal components if needed
- [ ] Create stat cards if needed

## Page Layer Phase

### Listing Page
- [ ] Create page.tsx
- [ ] Add ContentLayout wrapper
- [ ] Add Breadcrumb navigation
- [ ] Add PermissionGuard
- [ ] Integrate Filters component
- [ ] Integrate DataTable component
- [ ] Add create button (CanCreate guard)
- [ ] Test filtering and pagination

### Create Page
- [ ] Create new/page.tsx
- [ ] Add Breadcrumb navigation
- [ ] Integrate Form component
- [ ] Handle form submission
- [ ] Redirect on success
- [ ] Test form submission

### Edit Page
- [ ] Create [id]/edit/page.tsx
- [ ] Fetch entity data
- [ ] Pass to Form as initialData
- [ ] Handle update submission
- [ ] Redirect on success

### Detail Page (if needed)
- [ ] Create [id]/page.tsx
- [ ] Display entity details
- [ ] Add action buttons
- [ ] Add back/edit navigation

## Permission & Navigation Phase

- [ ] Define permission keys (e.g., 'module.entity.view')
- [ ] Add to use-permissions.ts if custom logic needed
- [ ] Add to MENU_PERMISSIONS in lib/sidebarMenuLink.ts
- [ ] Add menu item to sidebar structure
- [ ] Add PermissionGuard to all pages
- [ ] Test permission-based access

## Testing Phase

- [ ] Manual test: Create new entity
- [ ] Manual test: Update entity
- [ ] Manual test: Delete entity
- [ ] Manual test: List with filters
- [ ] Manual test: Pagination
- [ ] Manual test: Sorting
- [ ] Test permission denial (if unauthorized)
- [ ] Test error handling (invalid inputs)
- [ ] Test loading states
- [ ] Cross-browser testing

## Documentation Phase

- [ ] Document module structure
- [ ] Document API/Service methods
- [ ] Document custom hooks
- [ ] Document permission requirements
- [ ] Document any special features
- [ ] Update main codebase docs
- [ ] Add code comments where needed

## Integration Phase

- [ ] Test with existing modules
- [ ] Test authentication flow
- [ ] Test permission system
- [ ] Test database constraints
- [ ] Test RLS policies
- [ ] Performance testing (large datasets)
- [ ] Test on mobile/tablet

## Final Checks

- [ ] No console.log left (except development)
- [ ] All TypeScript types are strict
- [ ] All error messages are user-friendly
- [ ] Loading states work correctly
- [ ] Success/error toasts appear
- [ ] Navigation is intuitive
- [ ] Code follows naming conventions
- [ ] Code follows formatting standards
- [ ] No security vulnerabilities
- [ ] Performance is acceptable

## Deployment

- [ ] Run full test suite
- [ ] Review code with team
- [ ] Test in staging environment
- [ ] Update deployment documentation
- [ ] Plan database migrations
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Document any issues found

---

## Reference: Directory Tree Example

```
app/(routes)/[module]/
├── page.tsx
├── new/
│   └── page.tsx
├── [id]/
│   ├── page.tsx
│   └── edit/
│       └── page.tsx
└── _components/
    ├── data-table-schema.ts
    ├── columns.tsx
    ├── [entity]-data-table.tsx
    ├── [entity]-form.tsx
    ├── [entity]-filters.tsx
    ├── row-actions.tsx
    └── [other-components].tsx

lib/services/[module]/
├── [entity]-service.ts
└── [other-services].ts

hooks/[module]/
└── use-[entity].ts

types/
└── [module].ts
```

---

## Quick Command Reference

```bash
# Create module directory
mkdir -p app/\(routes\)/[module]/{new,[id]/{edit},_components}
mkdir -p lib/services/[module]
mkdir -p hooks/[module]

# Check TypeScript errors
npm run lint

# Test local build
npm run build

# Run development server
npm run dev
```

