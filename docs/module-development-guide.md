````md
# Full-Stack Module Development Flow

This guide demonstrates a standardized approach for building new modules in a full-stack application using:

- **Next.js (App Router)**
- **TypeScript**
- **Tailwind CSS**
- **[shadcn/ui](https://ui.shadcn.com/)** (optional UI components)
- **[Supabase](https://supabase.com/)**
- **[Zod](https://github.com/colinhacks/zod)** (validation)
- **[React Query](https://tanstack.com/query/v4)** (data fetching & caching)
- **RLS (Row-Level Security)** in Supabase

We’ll walk through an example “Institution” module from **domain types** to **service logic**, **validation**, **React Query integration**, and **UI components**. Adjust the specifics (field names, table names, etc.) to suit your real-world needs.

---

## 1. Define Domain Types & Zod Schemas

First, create your TypeScript domain types (e.g., in `types/organization.ts`) and corresponding Zod schemas for validation. This ensures your data structures are typed and validated before reaching your database.

```ts
// types/organization.ts

import { z } from "zod";

// Domain Model
export interface Institution {
  id: string;
  name: string;
  code: string;
  logo_url?: string;
  // ... additional fields ...
}

// Create DTO Schema with Zod
export const createInstitutionSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().min(2, "Code must be at least 2 characters"),
  logo_url: z.string().optional(),
  // Add other required fields with validation here
});

// Update DTO Schema allows partial updates
export const updateInstitutionSchema = createInstitutionSchema.partial();

// Export TypeScript types derived from Zod
export type CreateInstitutionDto = z.infer<typeof createInstitutionSchema>;
export type UpdateInstitutionDto = z.infer<typeof updateInstitutionSchema>;
````

**Key Points**:

- We’re using **Zod** for schema validation.
- We export both the Zod schemas (`createInstitutionSchema`, `updateInstitutionSchema`) **and** TypeScript types (`CreateInstitutionDto`, `UpdateInstitutionDto`) to ensure consistency across our codebase.

---

## 2. RLS Policy Considerations (Supabase)

1. In your Supabase dashboard, create a table named `institutions` with columns:

   - `id` (uuid) – primary key (default value: `uuid_generate_v4()`)
   - `name` (text)
   - `code` (text)
   - `logo_url` (text, optional)
   - Any additional columns you need.

2. **Enable RLS (Row-Level Security)**:

   - In the Supabase dashboard, go to `Auth` → `Policies`.
   - Enable RLS for the `institutions` table.

3. **Create RLS Policies** according to your app’s requirements:
   - For example, let any authenticated user read all institutions:
     ```sql
     CREATE POLICY "Allow authenticated read"
     ON public.institutions
     FOR SELECT
     TO authenticated
     USING (true);
     ```
   - For create/update/delete, you might limit actions to users with certain roles or conditions. For instance, if you store a `user_id` on each row:
     ```sql
     CREATE POLICY "Allow row owner insert"
     ON public.institutions
     FOR INSERT
     TO authenticated
     WITH CHECK (auth.uid() = user_id);
     ```
   - Adjust these policies to match your real-world authorization model.

**Important**: This guide won’t delve too deep into RLS details, but always test that your RLS policies align with your intended security model.

---

## 3. Implement the Service Layer

Encapsulate all business logic and database operations in a dedicated service class. This ensures the rest of the application only interacts with a clean, well-defined API, hiding Supabase details.

```ts
// lib/services/organization/organization-service.ts

import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "react-hot-toast"; // or any toast library
import type { Institution } from "@/types/organization";
import {
  createInstitutionSchema,
  updateInstitutionSchema,
  CreateInstitutionDto,
  UpdateInstitutionDto,
} from "@/types/organization";

export class OrganizationService {
  private static supabase = createClientComponentClient();

  // Create Institution
  static async createInstitution(
    data: CreateInstitutionDto
  ): Promise<Institution> {
    // Validate with Zod
    const parsed = createInstitutionSchema.parse(data);

    try {
      const { data: institution, error } = await this.supabase
        .from("institutions")
        .insert([parsed])
        .single();

      if (error) throw error;
      toast.success("Institution created successfully");
      return institution as Institution;
    } catch (error: any) {
      console.error("Error creating institution:", error);
      toast.error(error.message || "Failed to create institution");
      throw error;
    }
  }

  // Fetch All Institutions
  static async getInstitutions(): Promise<Institution[]> {
    try {
      const { data, error } = await this.supabase
        .from("institutions")
        .select("*"); // adjust if you need specific columns

      if (error) throw error;
      return data as Institution[];
    } catch (error: any) {
      console.error("Error fetching institutions:", error);
      throw error;
    }
  }

  // Fetch Single Institution
  static async getInstitution(id: string): Promise<Institution> {
    try {
      const { data, error } = await this.supabase
        .from("institutions")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Institution;
    } catch (error: any) {
      console.error("Error fetching institution:", error);
      throw error;
    }
  }

  // Update Institution
  static async updateInstitution(
    id: string,
    data: UpdateInstitutionDto
  ): Promise<Institution> {
    // Validate with Zod
    const parsed = updateInstitutionSchema.parse(data);

    try {
      const { data: institution, error } = await this.supabase
        .from("institutions")
        .update(parsed)
        .eq("id", id)
        .single();

      if (error) throw error;
      toast.success("Institution updated successfully");
      return institution as Institution;
    } catch (error: any) {
      console.error("Error updating institution:", error);
      toast.error(error.message || "Failed to update institution");
      throw error;
    }
  }

  // Delete Institution
  static async deleteInstitution(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("institutions")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Institution deleted successfully");
    } catch (error: any) {
      console.error("Error deleting institution:", error);
      toast.error(error.message || "Failed to delete institution");
      throw error;
    }
  }
}
```

**Notes**:

- `getSupabaseClient()` uses your custom client code in lib/supabase/client.ts.
- RLS protects data on the database side. Your Zod validation ensures correct shape of data before insertion/update.
- For server-side usage (e.g., within Next.js Server Components or API endpoints), you might prefer `createServerSupabaseClient()` from lib/supabase/server.ts instead.

---

## 4. Create React Query Hooks

Instead of manually managing `useState` for loading/errors, we use **React Query** to handle caching, refetching, and state management. Make sure you have React Query set up (e.g., a `<QueryClientProvider>` at the root of your app). (e.g., in app/layout.tsx).

### 4.1. Hook for Fetching All Institutions

```ts
// hooks/organization/useInstitutions.ts

import { useQuery } from "@tanstack/react-query";
import { OrganizationService } from "@/lib/services/organization/organization-service";

export function useInstitutions() {
  return useQuery({
    queryKey: ["institutions"],
    queryFn: () => OrganizationService.getInstitutions(),
  });
}
```

- **queryKey**: Identifies the resource in the cache (e.g., `["institutions"]`).
- **queryFn**: The actual fetch logic from our service.

### 4.2. Hook for Creating an Institution

```ts
// hooks/organization/useCreateInstitution.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrganizationService } from "@/lib/services/organization/organization-service";
import { CreateInstitutionDto } from "@/types/organization";

export function useCreateInstitution() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInstitutionDto) =>
      OrganizationService.createInstitution(data),
    onSuccess: () => {
      // Invalidate the "institutions" query to refetch fresh data
      queryClient.invalidateQueries(["institutions"]);
    },
  });
}
```

**Similarly**, create `useUpdateInstitution` and `useDeleteInstitution` hooks as needed.

---

## 5. Build the UI Components

Use the hooks from above in your Next.js components. Tailwind CSS + shadcn/ui can be used for styling. Below is a minimal example.

### 5.1. Listing Institutions

```tsx
// app/(routes)/institutions/InstitutionsList.tsx

"use client";

import { useInstitutions } from "@/hooks/organization/useInstitutions";

export default function InstitutionsList() {
  const { data: institutions, isLoading, isError, error } = useInstitutions();

  if (isLoading) {
    return <div className="text-center p-4">Loading institutions...</div>;
  }

  if (isError) {
    return (
      <div className="text-center p-4 text-red-600">
        Error: {(error as Error).message}
      </div>
    );
  }

  if (!institutions || institutions.length === 0) {
    return <div className="p-4 text-center">No institutions found.</div>;
  }

  return (
    <ul className="space-y-2 p-4">
      {institutions.map((inst) => (
        <li key={inst.id} className="border p-2 rounded">
          {inst.name} ({inst.code})
        </li>
      ))}
    </ul>
  );
}
```

### 5.2. Creating an Institution

Here’s a simple form using **react-hook-form** + **ZodResolver** (optional but recommended for easy form-state management).

```tsx
// app/(routes)/institutions/components/InstitutionForm.tsx

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createInstitutionSchema, CreateInstitutionDto } from "@/types/organization";
import { useCreateInstitution } from "@/hooks/organization/useCreateInstitution";

export default function InstitutionForm() {
  const { mutate: createInstitution, isLoading } = useCreateInstitution();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateInstitutionDto>({
    resolver: zodResolver(createInstitutionSchema),
  });

  const onSubmit = (data: CreateInstitutionDto) => {
    createInstitution(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium">Institution Name</label>
        <input
          type="text"
          {...register("name")}
          className="mt-1 block w-full border rounded p-2"
        />
        {errors.name && (
          <p className="text-red-500 text-sm">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Code</label>
        <input
          type="text"
          {...register("code")}
          className="mt-1 block w-full border rounded p-2"
        />
        {errors.code && (
          <p className="text-red-500 text-sm">{errors.code.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Logo URL (optional)</label>
        <input
          type="text"
          {...register("logo_url")}
          className="mt-1 block w-full border rounded p-2"
        />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white py-2 px-4 rounded"
        disabled={isLoading}
      >
        {isLoading ? "Creating..." : "Create Institution"}
      </button>
    </form>
  );
}
```

- **`zodResolver(createInstitutionSchema)`** automatically validates form data.
- The **React Query** mutation (`useCreateInstitution`) handles the API call.

---

## 6. Putting It All Together

Your `/app/(routes)/institutions/page.tsx` (or a similar layout) could combine these components:

```tsx
// app/(routes)/institutions/page.tsx

import InstitutionsList from "./InstitutionsList";
import InstitutionForm from "./InstitutionForm";

export default function InstitutionsPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Institutions</h1>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Create a New Institution</h2>
        <InstitutionForm />
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-4">Existing Institutions</h2>
        <InstitutionsList />
      </section>
    </main>
  );
}
```

---

## 7. Summary & Best Practices

1. **Domain Types & Validation**

   - Keep your domain model in TypeScript interfaces.
   - Use Zod for robust validation of DTOs.

2. **Service Layer**

   - Abstract away Supabase calls (and any future DB changes) behind a clean API.
   - Use RLS in Supabase for security and keep your service methods minimal.

3. **React Query**

   - Simplify data fetching, caching, and synchronization.
   - Use hooks like `useQuery`, `useMutation`, and `useQueryClient.invalidateQueries()` to keep your UI reactive.

4. **UI Components**

   - Keep your presentational logic minimal.
   - For forms, consider `react-hook-form` + `zodResolver` to handle validation elegantly.
   - Use Tailwind or shadcn/ui for styling.

5. **RLS Policies**

   - Carefully set up row-level security to control read/write access.
   - Test your RLS policies with different user roles.

6. **Error Handling**

   - Decide where to handle toasts or user-facing errors (service vs. UI layer).
   - Consider building a central error boundary or hooking into React Query’s onError callbacks.

7. **Project Structure**

   - Keep your modules consistent:
     - `types/` for domain models and Zod schemas.
     - `lib/services/` for service classes.
     - `hooks/` for React Query hooks.
     - `app/` (routes) for UI components.

8. **Deployment & Migrations**
   - Use Supabase migrations or a schema migration strategy to keep your DB in sync across environments.
   - Ensure environment variables for Supabase are correctly set in production.

By following these steps, you create a maintainable, testable, and consistent architecture for any new module in your Next.js + Supabase project. Happy coding!

```

```
