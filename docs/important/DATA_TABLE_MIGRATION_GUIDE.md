### Data Table Migration Guide

**1. Introduction**

This document outlines the process for replacing the current custom `DataTable` component with the more robust and feature-rich `tnks-data-table`. The primary motivation is to resolve existing pagination issues and leverage the advanced capabilities of the new table, such as improved server-side filtering, sorting, and a more modular architecture.

**2. Analysis of Current Implementation**

The current `DataTable` is a single component located at `components/ui/data-table.tsx`. It supports server-side pagination via the `serverSidePagination` prop. State for pagination (current page, page size) is managed within each page component that uses the table (e.g., `app/(routes)/organizations/degrees/page.tsx`) and passed down through props.

While the logic for handling pagination appears correct on the surface, the reported issues suggest a potential subtle bug in the state management or the interaction with the `@tanstack/react-table` library within the component. A monolithic component like this can be difficult to debug and maintain.

**3. Analysis of `tnks-data-table`**

The `tnks-data-table` is a more advanced and modular data table implementation. Its key features include:

- **Modular Architecture:** The table is split into smaller, reusable components:
  - `DataTable`: The core table structure.
  - `DataTableToolbar`: Handles filtering, column visibility, and other table-level actions.
  - `DataTablePagination`: Manages pagination logic and UI.
  - `DataTableColumnHeader`: Provides sortable column headers.
- **Hook-based State Management:** It likely uses a custom hook (e.g., `useDataTable`) to manage table state, abstracting away the complexity of `@tanstack/react-table` and search parameter management.
- **Search Param Driven:** It appears to use URL search parameters to manage state for filtering, sorting, and pagination. This is a robust pattern that allows for shareable and bookmarkable table states.
- **Server-Side Operations:** It has clear utilities for server-side data fetching (`data-fetching.ts`), which can be adapted for use with `DegreeService`.
- **Component-based Configuration:** Table columns, row actions, and toolbar filters are often defined in their own components, promoting code organization and reusability.
- **Advanced Features:** Built-in support for data export (`data-export.tsx`) and other utilities.

**4. Migration Plan**

This section details the steps to replace the old `DataTable` with `tnks-data-table` in the context of the Degrees module. The same pattern can be applied to other modules.

**Step 4.1: Integrate `tnks-data-table` Components**

1.  Create a new directory `components/data-table`.
2.  Copy the contents of the `src/components/data-table` directory from the `tnks-data-table` repository into `components/data-table`. This includes:
    - `data-table.tsx`
    - `pagination.tsx`
    - `toolbar.tsx`
    - `column-header.tsx`
    - `data-export.tsx`
    - `data-table-resizer.tsx`
    - And any subdirectories like `hooks/` and `utils/`.
3.  Review the copied files for any internal path aliases and update them to match your project's `tsconfig.json` (e.g., `@/lib` vs `@/components`).

**Step 4.2: Check Dependencies**

Review the `package.json` from `tnks-data-table` and install any missing dependencies in your project. It likely uses similar dependencies, but there may be new ones or different versions. Common dependencies would be `@tanstack/react-table`, `zod`, `lucide-react`, and `clsx`.

**Step 4.3: Adapt the Degrees Module**

The primary files to change in the degrees module are:

- `app/(routes)/organizations/degrees/page.tsx`
- `app/(routes)/organizations/degrees/_components/degree-list.tsx`
- `app/(routes)/organizations/degrees/_components/degree-filters.tsx`

We will centralize the data table logic in a new component.

**Step 4.3.1: Create a new `degrees-data-table.tsx` component**

Create a new file `app/(routes)/organizations/degrees/_components/degrees-data-table.tsx`. This component will be responsible for fetching data and rendering the `DataTable`. This pattern is inspired by the examples in `tnks-data-table`.

This new component will:

1.  Read search params for pagination, sorting, and filtering.
2.  Use the `useDegrees` hook to fetch data based on these params.
3.  Render the new `DataTable` component, passing the data and column definitions.

**Step 4.3.2: Create `columns.tsx` for Degrees**

Create `app/(routes)/organizations/degrees/_components/columns.tsx`. This file will define the column definitions for the degrees table, including headers, cell renderers, and sorting configuration. It will also define row actions (or you can create a separate `row-actions.tsx`).

This modularizes the column logic, cleaning up `degree-list.tsx`. The `columns` definition will look something like this, but adapted from your current `degree-list.tsx`:

```typescript
// Example structure for columns.tsx
'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Degree } from '@/types/organizations';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { DataTableRowActions } from './row-actions'; // You will create this

export const columns: ColumnDef<Degree>[] = [
  // ... selection column
  {
    accessorKey: 'degree_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Degree ID" />,
    // ... cell rendering
  },
  // ... other columns (degree_name, degree_type, institution, status, created_at)
  {
    id: 'actions',
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
```

**Step 4.3.3: Refactor `DegreesPage`**

Modify `app/(routes)/organizations/degrees/page.tsx`.
Instead of managing state with `useState` for `page`, `pageSize`, `searchQuery`, and `filters`, this component will now simply render the new `degrees-data-table.tsx`. The state will be managed by the data table itself using URL search parameters. The page will need to be a server component that can read initial search params and pass them to the data table component, which will be a client component. The example from the repo suggests that `searchParams` would be passed as a prop.

Your `DegreesPage` will be simplified to something like:

```typescript
// app/(routes)/organizations/degrees/page.tsx

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { DegreesDataTable } from './_components/degrees-data-table'; // The new component
import { searchParamsSchema } from './_components/data-table-schema'; // A new schema file

export default function DegreesPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined }}) {
  const search = searchParamsSchema.parse(searchParams);

  return (
    <ContentLayout title="Degrees">
      {/* ... Breadcrumb and Title ... */}
      <DegreesDataTable search={search} />
    </ContentLayout>
  );
}
```

**Step 4.3.4: Deprecate `degree-list.tsx` and `degree-filters.tsx`**

The functionality of `degree-list.tsx` and `degree-filters.tsx` will be absorbed into the new `degrees-data-table.tsx` and its `DataTableToolbar`. You can either delete these old files or refactor them. The `tnks-data-table` approach favors a single `DataTableToolbar` that encapsulates filtering controls.

The `toolbar.tsx` from `tnks-data-table` is generic. You would create a `degrees-data-table-toolbar.tsx` that uses it and provides the specific filter components (like the institution and degree type dropdowns).

**Step 4.4: Managing State with URL Search Params**

`tnks-data-table` likely uses a hook like `useDataTable` which reads from and writes to URL search params. You will need to create a Zod schema to validate the search params for the degrees table.

Create `app/(routes)/organizations/degrees/_components/data-table-schema.ts`:

```typescript
// app/(routes)/organizations/degrees/_components/data-table-schema.ts
import { z } from 'zod';

export const searchParamsSchema = z.object({
  page: z.coerce.number().default(1),
  per_page: z.coerce.number().default(10),
  sort: z.string().optional(),
  degree_name: z.string().optional(),
  institution_id: z.string().optional(),
  degree_type: z.enum(['ug', 'pg']).optional(),
  // ... other filters
});
```

The `useDataTable` hook (or similar utility from the new table) will use this schema to provide typed and validated state to your components.

**Step 4.5: Adapting `useDegrees` and `DegreeService`**

The `useDegrees` hook and `DegreeService.getDegrees` method are already set up to accept filters, which is great. You will just need to ensure the parameters from the URL search params are correctly passed to them. The new `degrees-data-table.tsx` component will be responsible for this.

The `useDegrees` hook might need to be adapted or wrapped if `tnks-data-table` provides its own data-fetching abstractions. However, given it uses TanStack Query, your existing hook should be largely compatible.

**5. Conclusion**

By migrating to `tnks-data-table`, you will replace a single, complex component with a modular, maintainable, and feature-rich system. This will resolve the pagination issues and provide a consistent, robust foundation for all data tables throughout the application. The use of URL search params for state management is a significant improvement that enhances user experience with bookmarkable and shareable table views.
