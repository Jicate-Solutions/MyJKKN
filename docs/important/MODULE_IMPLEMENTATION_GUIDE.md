# Common Module Implementation Guide

This guide provides a standardized approach for building and refactoring modules in the application. Following this pattern ensures consistency, scalability, and a clear separation of concerns, leveraging a modern stack with Next.js, React Query, and a server-driven `DataTable`.

## Core Principles

1.  **URL as the Single Source of Truth**: All state for data views (filters, pagination, sorting, search) is stored in the URL. This makes the UI state shareable, bookmarkable, and refresh-proof.
2.  **Server-Driven Data**: The backend (Service Layer) handles all data processing. The frontend sends parameters and renders the result.
3.  **Component Composition**: The UI is broken down into clear, single-responsibility components (`Page`, `Filters`, `DataTable`, `Columns`, `RowActions`) that are composed together.
4.  **Centralized Logic**:
    - **Service Layer**: For data fetching and business logic.
    - **React Query Hooks**: For managing server state, caching, and mutations in the UI.
5.  **Type Safety**: Zod validates and types URL search parameters, ensuring type safety from the browser's URL down to the database query.

---

## Standard File Structure

For any given entity (e.g., `departments`), the file structure should be:

```
app/(routes)/[module]/[entity]/
├── _components/
│   ├── [entity]-data-table.tsx   # Main data table component
│   ├── [entity]-filters.tsx      # Filter UI components
│   ├── [entity]-form.tsx         # Create/Edit form component
│   ├── columns.tsx               # Column definitions for the table
│   ├── data-table-schema.ts      # Zod schema for URL params
│   └── row-actions.tsx           # Actions for each table row
├── [id]/
│   ├── edit/
│   │   └── page.tsx              # Edit entity page
│   └── page.tsx                  # View entity details page
├── new/
│   └── page.tsx                  # Create new entity page
└── page.tsx                      # Main list view page (Client Component)
```

Additionally, these files are created or updated:

```
hooks/[module]/
└── use-[entity].ts               # React Query hooks for the entity

lib/services/[module]/
└── [entity]-service.ts           # Service layer for data operations

types/
└── [module].ts                   # Entity-specific types and interfaces
```

---

## Component & Logic Patterns

### 1. Type Definitions (`types/[module].ts`)

Define all TypeScript interfaces for the entity.

- **`[Entity]`**: The main entity type.
- **`Create[Entity]Dto` / `Update[Entity]Dto`**: Data Transfer Objects for forms.
- **`[Entity]Filters`**: The shape of the filters object passed to the service layer.
- **`[Entity]ListResponse`**: The expected response shape from the list endpoint.

### 2. Service Layer (`lib/services/[module]/[entity]-service.ts`)

This class handles all communication with the database.

- **Responsibility**:

  - Contains all logic for CRUD operations (`get[Entity]`, `get[Entities]`, `create[Entity]`, etc.).
  - Builds Supabase queries dynamically based on the `[Entity]Filters` object.
  - It is completely UI-agnostic.

- **Example (`get[Entities]` method):**

  ```typescript
  static async getEntities(filters: EntityFilters = {}): Promise<EntityListResponse> {
    let query = this.supabase.from('entities').select(`...`, { count: 'exact' });

    // Apply filters dynamically from the filters object
    if (filters.search) { /* ... */ }
    if (filters.status) { query = query.eq('is_active', filters.status === 'active'); }

    // Apply sorting and pagination
    // ...

    const { data, error, count } = await query;
    // ... return formatted response
  }
  ```

### 3. React Query Hooks (`hooks/[module]/use-[entity].ts`)

This file encapsulates all server state management for an entity.

- **Responsibility**:

  - **`use[Entities](filters)`**: Fetches a list of entities. While this hook is perfect for populating dropdowns or simple lists, our main `DataTable` **does not use this hook directly**. Instead, the table's internal logic calls the service layer via a `fetchDataFn` prop.
  - **`use[Entity](id)`**: Fetches a single entity. Used on detail and edit pages.
  - **`useCreate[Entity]`, `useUpdate[Entity]`, `useDelete[Entity]`**: Mutation hooks for CUD operations. They handle API calls, success/error notifications, and query invalidation to keep the UI in sync.

- **Example (`hooks/[module]/use-entities.ts`):**

  ```typescript
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { queryKeys } from '@/lib/query/query-keys';
  import { EntityService } from '@/lib/services/[module]/entity-service';
  import { toast } from 'sonner';

  // Hook for fetching a single entity (for detail/edit pages)
  export function useEntity(id: string) {
    return useQuery({
      queryKey: queryKeys.entity.detail(id), // e.g., ['entities', 'detail', id]
      queryFn: () => EntityService.getEntity(id),
      enabled: !!id,
    });
  }

  // Hook for creating an entity (for forms)
  export function useCreateEntity() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: CreateEntityDto) => EntityService.createEntity(data),
      onSuccess: () => {
        toast.success('Entity created successfully');
        queryClient.invalidateQueries({ queryKey: queryKeys.entity.lists() });
      },
      onError: (error) => toast.error(error.message),
    });
  }
  // ... similar hooks for update and delete
  ```

### 4. URL Schema (`_components/data-table-schema.ts`)

Uses Zod to define the shape and validation of URL search parameters.

### 5. Page Component (`page.tsx`)

The top-level client component that orchestrates the module's UI.

- **Responsibility**:
  - Manages URL state via `useRouter` and `useSearchParams`.
  - Parses URL params with the Zod schema.
  - Provides callbacks (`handleFilterChange`, `handleClearFilters`) to the `Filters` component.
  - Passes the parsed `search` object down to the `Filters` and `DataTable` components.

### 6. Filters Component (`_components/[entity]-filters.tsx`)

A "dumb" component for displaying filter controls.

- **Responsibility**: Renders the UI for filters and action buttons, receiving its state and callbacks from the `Page` component.

### 7. Data Table Component (`_components/[entity]-data-table.tsx`)

A wrapper for the global `DataTable`.

- **Responsibility**: Defines the `fetchDataFn` which bridges the `DataTable`'s internal state (pagination, search, sort) with the module-specific filters (`search` prop) and calls the correct `Service Layer` method.

### 8. Row Actions & Forms (`_components/row-actions.tsx`, `_components/[entity]-form.tsx`)

These components handle user interactions for modifying data.

- **Responsibility**:

  - Use the mutation hooks (`useUpdate[Entity]`, `useDelete[Entity]`, etc.).
  - Call the mutation's `mutate` function on user action (e.g., form submission, clicking "Delete").
  - React Query handles the API call, toast notifications, and cache invalidation automatically.

- **Example (`_components/row-actions.tsx`):**

  ```typescript
  export function EntityRowActions({ row }) {
    const { mutate: deleteEntity, isPending } = useDeleteEntity();

    const handleDelete = () => {
      deleteEntity(row.original.id);
    };

    return (
      <AlertDialog>
        {/* ... Trigger ... */}
        <AlertDialogContent>
          {/* ... */}
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
  ```
