# Solutions Hub: Products & TRL Tracking Module

> **Module:** Products & TRL Tracking
> **Location:** `/solutions/products/`
> **Created:** 2026-02-10
> **Status:** Built (pages use mock data; service layer and hooks are production-ready)
> **Driven By:** FST-Team Recalibration Analysis (NED Feb 2026)

---

## 1. Overview

### What This Module Does

The Products & TRL Tracking module tracks JKKN-owned technology products that emerge from client solution deliveries. It introduces two key systems:

1. **Product Lifecycle Management** -- Tracks products from concept (TRL 1) through proven deployment (TRL 9), with validation evidence at each level.
2. **RDIF Readiness Dashboard** -- Tracks the 9 organizational prerequisites required for Research Development and Innovation Fund eligibility, with a three-year bridge plan.

### Why It Exists

The FST-Team adversarial analysis (2026-02-10) identified a critical structural flaw in JICATE's business model: the **Service Trap** (Loop 1). Every client solution delivers IP to the client, meaning revenue never compounds and JICATE never builds assets.

The recommended fix: a **licensing pivot** -- change one contract clause so clients receive a perpetual license while JICATE retains IP ownership. This module is the system that captures, tracks, and matures retained IP into JKKN-owned products.

Key findings from the FST analysis that drove this implementation:

| Finding | Impact on Module Design |
|---------|------------------------|
| JKKN has 2 of 9 RDIF prerequisites (company + Indian control) | RDIF scorecard shows current state honestly |
| "Entirely" recalibrating toward RDIF is catastrophically wrong | Products are a parallel track, not a pivot -- Solutions Model remains primary |
| Licensing pivot is the minimum viable change with maximum systemic impact | `retained_ip` flag on solutions links client work to product development |
| Health-tech is the target product domain (28 departments, 64% of JKKN) | Domain classification prioritizes health-tech variants |
| TRL 4+ is the critical RDIF gate | TRL progress component highlights TRL 4 as the RDIF threshold |
| Three-year bridge plan with year-end gates | RDIF service implements bridge status with go/no-go logic |

### Relationship to Solutions (SHSolution vs SHProduct)

These are **separate entities** with different ownership models:

| Attribute | SHSolution (Client Delivery) | SHProduct (JKKN-Owned) |
|-----------|-------------------------------|------------------------|
| **Owner** | Client (fee-for-service) | JKKN/JICATE (retained IP) |
| **Revenue** | One-time deal value | Licensing, RDIF grants, recurring |
| **IP** | Goes to client | Retained by JICATE |
| **Lifecycle** | Prospecting -> Live -> AMC | Concept -> TRL 1-9 -> Deployed |
| **Table** | `sh_solutions` | `sh_products` |
| **Link** | `originating_solution_ids[]` on product references the solutions it came from |

A product may originate from one or more client solutions where reusable technology was identified. The `retained_ip` boolean on `sh_solutions` flags which solutions contributed IP to product development.

---

## 2. Data Model

### 2.1 Table: `sh_solutions` (Modified)

Two columns added to the existing solutions table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `retained_ip` | `BOOLEAN` | `FALSE` | Whether JKKN retained IP/learnings from this client solution |
| `ip_retention_notes` | `TEXT` | `NULL` | Notes on what IP was retained and how it feeds into product development |

**Index:** `idx_sh_solutions_retained_ip` -- partial index where `retained_ip = TRUE`.

### 2.2 Table: `sh_products`

Main product registry. Tracks JKKN-owned products and technologies.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `UUID` | PK | `gen_random_uuid()` | Primary key |
| `product_code` | `TEXT` | UNIQUE, NOT NULL | -- | Format: `JKKN-PRD-YYYY-XXX` (auto-generated) |
| `title` | `TEXT` | NOT NULL | -- | Product name |
| `description` | `TEXT` | -- | -- | Product description |
| `current_trl` | `INTEGER` | CHECK 1-9 | `1` | Current Technology Readiness Level |
| `target_trl` | `INTEGER` | CHECK 1-9 | -- | Target TRL for current development cycle |
| `trl_assessed_at` | `TIMESTAMPTZ` | -- | -- | When TRL was last formally assessed |
| `trl_assessed_by` | `UUID` | -- | -- | Who performed the last TRL assessment |
| `originating_solution_ids` | `UUID[]` | -- | -- | Array of solution IDs this product originated from |
| `lead_department_id` | `UUID` | -- | -- | FK to departments table |
| `domain` | `TEXT` | -- | -- | Product domain classification |
| `sector` | `TEXT` | -- | -- | RDIF priority sector classification |
| `patent_status` | `TEXT` | CHECK enum | `'none'` | Patent lifecycle status |
| `patent_number` | `TEXT` | -- | -- | Patent number if filed/granted |
| `patent_filed_at` | `TIMESTAMPTZ` | -- | -- | Date patent was filed |
| `status` | `TEXT` | CHECK enum | `'concept'` | Product lifecycle status |
| `rdif_readiness_score` | `INTEGER` | CHECK 0-9 | `0` | Calculated from prerequisites met |
| `development_budget` | `NUMERIC(12,2)` | -- | `0` | Allocated development budget |
| `development_spent` | `NUMERIC(12,2)` | -- | `0` | Amount spent so far |
| `tags` | `TEXT[]` | -- | -- | Tagging for organization |
| `notes` | `TEXT` | -- | -- | Free-form notes |
| `metadata` | `JSONB` | -- | `'{}'` | Extensible metadata store |
| `created_at` | `TIMESTAMPTZ` | -- | `NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | -- | `NOW()` | Last update (trigger-managed) |
| `created_by` | `UUID` | -- | -- | User who created the product |

**Product Code Format:** `JKKN-PRD-YYYY-XXX` -- auto-generated by the service layer. Year is extracted from current date, sequence number is zero-padded to 3 digits, auto-incremented per year.

**Domain Enum Values:**

| Value | Label |
|-------|-------|
| `health_tech` | Health Tech |
| `edu_tech` | Edu Tech |
| `pharma_tech` | Pharma Tech |
| `dental_tech` | Dental Tech |
| `nursing_tech` | Nursing Tech |
| `construction_tech` | Construction Tech |
| `other` | Other |

**RDIF Sector Enum Values:**

| Value | Label |
|-------|-------|
| `health_technologies` | Health Technologies |
| `digital_economy` | Digital Economy |
| `energy` | Energy |
| `agriculture` | Agriculture |
| `defence` | Defence |
| `space` | Space |
| `telecom` | Telecom |

**Patent Status Enum Values:**

| Value | Label |
|-------|-------|
| `none` | None |
| `provisional_filed` | Provisional Filed |
| `full_filed` | Full Filed |
| `granted` | Granted |
| `rejected` | Rejected |

**Product Status Enum Values:**

| Value | Label | Description |
|-------|-------|-------------|
| `concept` | Concept | Initial idea or concept phase |
| `prototype` | Prototype | Working prototype developed |
| `lab_validated` | Lab Validated | Validated in laboratory environment |
| `field_validated` | Field Validated | Validated in field/real environment |
| `market_ready` | Market Ready | Ready for market deployment |
| `deployed` | Deployed | Deployed and in use |
| `archived` | Archived | No longer actively developed |

**Trigger:** `trg_sh_products_updated_at` -- automatically sets `updated_at = NOW()` on every UPDATE.

**Indexes:**
- `idx_sh_products_status` on `status`
- `idx_sh_products_domain` on `domain`
- `idx_sh_products_trl` on `current_trl`
- `idx_sh_products_patent_status` on `patent_status`

### 2.3 Table: `sh_product_validations`

Evidence and validation records for TRL level claims.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `UUID` | PK | `gen_random_uuid()` | Primary key |
| `product_id` | `UUID` | FK NOT NULL, CASCADE | -- | References `sh_products.id` |
| `trl_level` | `INTEGER` | CHECK 1-9, NOT NULL | -- | TRL level this validation supports |
| `validation_type` | `TEXT` | CHECK enum, NOT NULL | -- | Type of validation evidence |
| `title` | `TEXT` | NOT NULL | -- | Validation title/name |
| `evidence_description` | `TEXT` | -- | -- | Description of the evidence |
| `evidence_url` | `TEXT` | -- | -- | URL to evidence document/artifact |
| `validated_by` | `TEXT` | -- | -- | Name of the validator |
| `validator_affiliation` | `TEXT` | -- | -- | Organization of the validator |
| `is_external` | `BOOLEAN` | -- | `FALSE` | Whether validation is from outside JKKN |
| `validation_date` | `TIMESTAMPTZ` | -- | -- | When validation occurred |
| `status` | `TEXT` | CHECK enum | `'pending'` | Verification status |
| `created_at` | `TIMESTAMPTZ` | -- | `NOW()` | Creation timestamp |
| `created_by` | `UUID` | -- | -- | Who added this record |

**Validation Type Enum Values:**

| Value | Label |
|-------|-------|
| `internal_review` | Internal Review |
| `lab_test` | Lab Test |
| `field_test` | Field Test |
| `external_review` | External Review |
| `user_validation` | User Validation |
| `publication` | Publication |
| `patent` | Patent |

**Validation Status Enum Values:** `pending`, `verified`, `rejected`

**Indexes:**
- `idx_sh_product_validations_product` on `product_id`
- `idx_sh_product_validations_trl` on `trl_level`

### 2.4 Table: `sh_rdif_prerequisites`

Tracks the 9 organizational prerequisites required for RDIF eligibility. This is a system-level table (not per-product) since RDIF readiness is an organizational attribute.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `UUID` | PK | `gen_random_uuid()` | Primary key |
| `prerequisite_key` | `TEXT` | UNIQUE, NOT NULL | -- | Programmatic key for the prerequisite |
| `label` | `TEXT` | NOT NULL | -- | Human-readable label |
| `description` | `TEXT` | -- | -- | Detailed description |
| `is_met` | `BOOLEAN` | -- | `FALSE` | Whether this prerequisite is currently met |
| `evidence` | `TEXT` | -- | -- | Evidence supporting the met/unmet status |
| `evidence_url` | `TEXT` | -- | -- | URL to supporting document |
| `target_date` | `TIMESTAMPTZ` | -- | -- | Target date to meet this prerequisite |
| `updated_at` | `TIMESTAMPTZ` | -- | `NOW()` | Last update timestamp |
| `updated_by` | `UUID` | -- | -- | Who last updated this record |

**Seeded Data (9 prerequisites):**

| Key | Label | Initial `is_met` | Initial Evidence |
|-----|-------|-------------------|------------------|
| `registered_company` | Registered Company | `TRUE` | JICATE Solutions - registered under Companies Act |
| `indian_control` | Indian Citizen Control (51%+) | `TRUE` | Same management as JKKN Institutions |
| `trl_4_plus` | Technology at TRL 4+ | `FALSE` | -- |
| `ip_portfolio` | IP Portfolio | `FALSE` | -- |
| `co_investment` | Capital for 50% Co-investment | `FALSE` | -- |
| `rd_track_record` | R&D Track Record | `FALSE` | -- |
| `slfm_relationships` | SLFM/VC Relationships | `FALSE` | -- |
| `dsir_recognition` | DSIR-SIRO Recognition | `FALSE` | -- |
| `research_output` | Research Publications | `FALSE` | -- |

The INSERT uses `ON CONFLICT (prerequisite_key) DO NOTHING` to be idempotent.

### 2.5 Row Level Security (RLS)

All three tables have RLS enabled. Policies follow existing Solution Hub patterns using helper functions (`sh_has_management_access()`, `sh_is_staff()`, `sh_is_builder()`, `sh_is_hod()`, `sh_is_admin()`, `sh_user_department_id()`).

#### `sh_products` RLS

| Operation | Policy |
|-----------|--------|
| **SELECT** | Management access OR Staff OR Builder |
| **INSERT** | Management access only |
| **UPDATE** | Management access OR HOD of the product's lead department |
| **DELETE** | Admin only |

#### `sh_product_validations` RLS

| Operation | Policy |
|-----------|--------|
| **SELECT** | Management access OR Staff OR Builder |
| **INSERT** | Management access OR Staff |
| **UPDATE** | Management access OR Staff |
| **DELETE** | Admin only |

#### `sh_rdif_prerequisites` RLS

| Operation | Policy |
|-----------|--------|
| **SELECT** | Management access OR Staff |
| **INSERT** | Admin only (seeded at migration time) |
| **UPDATE** | Management access |
| **DELETE** | Admin only |

---

## 3. Service Layer

### 3.1 ProductsService (`/lib/services/solutions/products-service.ts`)

Extends `BaseService`. All methods are static. Exported both as class methods and as a `productsService` singleton object.

#### Products CRUD

| Method | Signature | Description |
|--------|-----------|-------------|
| `getProducts` | `(filters?: ProductFilters) => Promise<BaseListResponse<ProductWithValidations>>` | List products with filters, pagination, and department join |
| `getProductById` | `(id: string) => Promise<ProductWithValidations \| null>` | Get single product with validations and department |
| `createProduct` | `(input: CreateProductInput) => Promise<SHProduct>` | Create product with auto-generated `JKKN-PRD-YYYY-XXX` code |
| `updateProduct` | `(id: string, input: UpdateProductInput) => Promise<SHProduct>` | Update product fields |
| `deleteProduct` | `(id: string) => Promise<void>` | Hard delete (use archiveProduct for soft delete) |
| `archiveProduct` | `(id: string) => Promise<SHProduct>` | Soft delete -- sets status to `archived` |
| `updateProductStatus` | `(id: string, status: ProductStatus) => Promise<SHProduct>` | Update just the status field |

**ProductFilters:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `ProductStatus` | Filter by product status |
| `domain` | `ProductDomain` | Filter by domain |
| `sector` | `RDIFSector` | Filter by RDIF sector |
| `min_trl` | `number` | Minimum TRL level |
| `max_trl` | `number` | Maximum TRL level |
| `patent_status` | `PatentStatus` | Filter by patent status |
| `lead_department_id` | `string` | Filter by department |
| `search` | `string` | Search in title and product_code |
| `page` | `number` | Page number (from PaginationParams) |
| `limit` | `number` | Items per page (from PaginationParams) |

#### TRL Management

| Method | Signature | Description |
|--------|-----------|-------------|
| `updateTRL` | `(productId: string, newTRL: number, assessedBy?: string) => Promise<SHProduct>` | Update TRL level (validates 1-9 range), sets `trl_assessed_at` and `trl_assessed_by` |
| `getTRLHistory` | `(productId: string) => Promise<SHProductValidation[]>` | Get all validations ordered by TRL level and date |

#### Validations

| Method | Signature | Description |
|--------|-----------|-------------|
| `getValidations` | `(productId: string) => Promise<SHProductValidation[]>` | Get validations for a product (newest first) |
| `addValidation` | `(input: CreateValidationInput) => Promise<SHProductValidation>` | Add new validation evidence (validates TRL 1-9) |
| `updateValidation` | `(id: string, input: UpdateValidationInput) => Promise<SHProductValidation>` | Update validation fields |
| `deleteValidation` | `(id: string) => Promise<void>` | Delete a validation record |

#### RDIF Prerequisites

| Method | Signature | Description |
|--------|-----------|-------------|
| `getPrerequisites` | `() => Promise<SHRDIFPrerequisite[]>` | Get all 9 prerequisites ordered by key |
| `updatePrerequisite` | `(key: string, input: UpdatePrerequisiteInput) => Promise<SHRDIFPrerequisite>` | Update a single prerequisite by key |
| `getRDIFReadinessScore` | `() => Promise<{ score: number; total: number; prerequisites: SHRDIFPrerequisite[] }>` | Calculate score (count of `is_met = true`) |

#### Dashboard Stats

| Method | Signature | Description |
|--------|-----------|-------------|
| `getProductStats` | `() => Promise<ProductStats>` | Aggregated stats: total, byStatus, byDomain, averageTRL, totalBudget, totalSpent |
| `getRetainedIPSolutions` | `() => Promise<SHProduct[]>` | Products that have originating_solution_ids (non-null, non-archived) |

**ProductStats interface:**

```typescript
interface ProductStats {
  total: number;
  byStatus: Record<ProductStatus, number>;
  byDomain: Record<ProductDomain, number>;
  averageTRL: number;
  totalBudget: number;
  totalSpent: number;
}
```

### 3.2 RDIFService (`/lib/services/solutions/rdif-service.ts`)

Focused service for RDIF readiness calculations and bridge status tracking.

| Method | Signature | Description |
|--------|-----------|-------------|
| `calculateRDIFScore` | `() => Promise<RDIFReadinessResult>` | Full breakdown: score, percentage, met/unmet lists |
| `getThreeYearBridgeStatus` | `() => Promise<ThreeYearBridgeStatus>` | Determines current year (1/2/3), next milestones, eligibility |
| `getNextMilestones` | `() => Promise<RDIFMilestone[]>` | Unmet prerequisites sorted by priority |

**RDIFReadinessResult:**

```typescript
interface RDIFReadinessResult {
  score: number;          // Count of met prerequisites
  total: number;          // Always 9
  percentage: number;     // Rounded percentage
  prerequisites: SHRDIFPrerequisite[];
  metPrerequisites: SHRDIFPrerequisite[];
  unmetPrerequisites: SHRDIFPrerequisite[];
}
```

**ThreeYearBridgeStatus:**

```typescript
interface ThreeYearBridgeStatus {
  currentYear: 1 | 2 | 3;
  yearLabel: string;       // e.g., "Year 1: Foundation"
  description: string;
  scoreRange: { min: number; max: number };
  currentScore: number;
  nextMilestones: RDIFMilestone[];
  isEligible: boolean;    // true when score >= 7
}
```

**Bridge Year Thresholds:**

| Year | Score Range | Label | Description |
|------|------------|-------|-------------|
| Year 1 | 0-3 | Foundation | Establishing basics -- company structure, initial IP, first TRL 4+ product |
| Year 2 | 4-6 | Growth | Building track record -- R&D publications, DSIR recognition, SLFM relationships |
| Year 3 | 7-9 | Readiness | Full eligibility -- VC connections, co-investment capital, complete portfolio |

**Priority Mapping for Milestones:**

| Prerequisite | Priority |
|--------------|----------|
| `registered_company` | Critical |
| `indian_citizen_control` | Critical |
| `trl_4_plus` | Critical |
| `ip_portfolio` | Critical |
| `rd_track_record` | High |
| `dsir_recognition` | High |
| `co_investment_capital` | High |
| `slfm_relationships` | Medium |
| `vc_connections` | Medium |

---

## 4. React Hooks

All hooks are in `/hooks/solutions/use-products.ts`. They use TanStack Query (React Query) with the `solutionsHubKeys.products.*` query key hierarchy.

### 4.1 Query Hooks

| Hook | Query Key | Returns | Config |
|------|-----------|---------|--------|
| `useProducts(filters?)` | `products.list(filters)` | `BaseListResponse<ProductWithValidations>` | DYNAMIC_DATA |
| `useProduct(id)` | `products.detail(id)` | `ProductWithValidations \| null` | SEMI_STABLE_DATA, enabled when id truthy |
| `useProductStats()` | `products.stats()` | `ProductStats` | DASHBOARD_DATA |
| `useRetainedIPSolutions()` | `products.retainedIP()` | `SHProduct[]` | SEMI_STABLE_DATA |
| `useTRLHistory(productId)` | `products.trlHistory(id)` | `SHProductValidation[]` | SEMI_STABLE_DATA, enabled when id truthy |
| `useProductValidations(productId)` | `products.validations(id)` | `SHProductValidation[]` | DYNAMIC_DATA, enabled when id truthy |
| `useRDIFPrerequisites()` | `products.rdifPrerequisites()` | `SHRDIFPrerequisite[]` | SEMI_STABLE_DATA |
| `useRDIFReadinessScore()` | `products.rdifScore()` | `RDIFReadinessResult` | DASHBOARD_DATA |
| `useThreeYearBridgeStatus()` | `products.bridgeStatus()` | `ThreeYearBridgeStatus` | DASHBOARD_DATA |
| `useNextRDIFMilestones()` | `products.nextMilestones()` | `RDIFMilestone[]` | SEMI_STABLE_DATA |

### 4.2 Mutation Hooks

| Hook | Invalidates | Description |
|------|-------------|-------------|
| `useCreateProduct()` | `products.all` | Creates a new product |
| `useUpdateProduct()` | `products.all` + sets detail cache | Updates product fields |
| `useDeleteProduct()` | `products.all` | Hard deletes a product |
| `useArchiveProduct()` | `products.all` + sets detail cache | Soft deletes (archives) |
| `useUpdateProductStatus()` | `products.all` + sets detail cache | Updates just the status |
| `useUpdateTRL()` | `products.all` + detail + trlHistory | Updates TRL level |
| `useAddValidation()` | validations + detail + trlHistory + all | Adds validation evidence |
| `useUpdateValidation()` | validations + detail | Updates existing validation |
| `useDeleteValidation()` | validations + detail | Deletes a validation |
| `useUpdatePrerequisite()` | rdifPrerequisites + rdifScore + bridgeStatus + nextMilestones | Updates a single RDIF prerequisite |

### 4.3 Query Key Hierarchy

```
['solutions-hub', 'products']                          // products.all
['solutions-hub', 'products', 'list', filters]         // products.list(filters)
['solutions-hub', 'products', 'detail', id]            // products.detail(id)
['solutions-hub', 'products', 'stats']                 // products.stats()
['solutions-hub', 'products', 'retained-ip']           // products.retainedIP()
['solutions-hub', 'products', 'trl-history', id]       // products.trlHistory(id)
['solutions-hub', 'products', 'validations', id]       // products.validations(id)
['solutions-hub', 'products', 'rdif-prerequisites']    // products.rdifPrerequisites()
['solutions-hub', 'products', 'rdif-score']            // products.rdifScore()
['solutions-hub', 'products', 'bridge-status']         // products.bridgeStatus()
['solutions-hub', 'products', 'next-milestones']       // products.nextMilestones()
```

### 4.4 Re-exported Types and Constants

The hooks file re-exports all types and constants so consumers can import from a single location:

**Types:** `ProductWithValidations`, `SHProduct`, `SHProductValidation`, `SHRDIFPrerequisite`, `ProductStats`, `ProductStatus`, `ProductDomain`, `RDIFSector`, `PatentStatus`, `ValidationType`, `ValidationStatus`, `RDIFReadinessResult`, `ThreeYearBridgeStatus`, `RDIFMilestone`

**Constants:** `PRODUCT_STATUSES`, `TRL_LEVELS`, `DOMAIN_LABELS`, `PATENT_STATUS_LABELS`, `VALIDATION_TYPE_LABELS`, `RDIF_PREREQUISITE_KEYS`, `BRIDGE_YEAR_THRESHOLDS`

---

## 5. Pages & Routes

### 5.1 Route Map

| Route | File | Description |
|-------|------|-------------|
| `/solutions/products` | `products/page.tsx` | Products list with stats, filters, and table |
| `/solutions/products/new` | `products/new/page.tsx` | Create new product form |
| `/solutions/products/[id]` | `products/[id]/page.tsx` | Product detail with tabs |
| `/solutions/products/[id]/edit` | Not yet built | Edit product (linked from detail page) |
| `/solutions/products/rdif` | Not yet built | RDIF readiness dashboard (linked from list page) |

### 5.2 Products List Page (`/solutions/products`)

**Layout:**
1. Breadcrumb: Home > Solutions Hub > Products
2. Header with "New Product" button
3. Four stat cards: Total Products, Average TRL, TRL 4+ Products, RDIF Readiness (X/9)
4. RDIF Readiness quick link card (JKKN-branded green on cream background)
5. Filter bar: search input + domain dropdown + TRL dropdown
6. Products table: Product (title + code), TRL badge, Domain, Patent status, Status, Solutions count, Created date

**States handled:** Loading (skeletons), Error (alert), Empty (first-time CTA), No results (filter mismatch), Data (table)

**Current status:** Uses mock data. TODO comments indicate where to connect `useProducts` and `useProductStats` hooks.

### 5.3 Create Product Page (`/solutions/products/new`)

**Form sections:**
1. **Basic Information** -- Title (required), Description, Domain (required), RDIF Sector
2. **Technology Readiness** -- Initial TRL Level (required, select 1-9), Lead Department
3. **Originating Solutions** -- Multi-select of existing solutions (TODO: not yet wired)
4. **Additional Information** -- Notes, Tags (comma-separated)

**Info card** explains the Products & TRL concept (JKKN-branded green on cream).

**Current status:** Form UI complete. Submit handler logs to console and simulates API call. TODO: wire to `useCreateProduct` mutation.

### 5.4 Product Detail Page (`/solutions/products/[id]`)

**Layout:**
1. Breadcrumb: Home > Solutions Hub > Products > [product code]
2. Header with title, status badge, product code, description, domain/sector badges
3. Back + Edit buttons
4. **TRL Header Card** -- gradient background, shows current TRL badge, target TRL badge, arrow between them, and full `TRLProgress` component
5. **Tabbed content area** with 5 tabs:

| Tab | Content |
|-----|---------|
| **TRL Validations** | Table of validation evidence with: title, TRL level badge, type badge, validator name + affiliation, date, status (verified/pending/rejected icons). "Add Validation" button. |
| **IP & Patents** | Patent status display, patent number (if exists), IP retention notes |
| **Originating Solutions** | List of linked solutions with title, code, client name. Links to solution detail pages. |
| **Financial** | Development budget card (allocated / spent / remaining / utilization bar). Funding sources card. |
| **RDIF Readiness** | `RDIFScorecard` component (2/3 width) with full detail view. Quick stats sidebar (current TRL, RDIF threshold check). RDIF funding info card. |

**Current status:** Uses mock data. TODO: wire to `useProduct(id)` hook.

---

## 6. Components

### 6.1 TRLBadge (`/app/(routes)/solutions/_components/trl-badge.tsx`)

Renders a colored badge showing the TRL level number.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `level` | `number` | -- | TRL level (1-9) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Badge size |
| `showName` | `boolean` | `false` | Whether to show TRL name after number |
| `className` | `string` | -- | Additional CSS classes |

**Color scheme (graduated red to blue):**

| TRL | Color Scheme |
|-----|-------------|
| 1 | Red (bg-red-100 text-red-800 border-red-300) |
| 2 | Orange |
| 3 | Amber |
| 4 | Yellow |
| 5 | Lime |
| 6 | Green |
| 7 | Emerald |
| 8 | Cyan |
| 9 | Blue |

**Size classes:**

| Size | Classes |
|------|---------|
| `sm` | `text-xs px-2 py-0.5` |
| `md` | `text-sm px-3 py-1` |
| `lg` | `text-base px-4 py-1.5` |

Falls back to `TRL ?` with outline variant for invalid level numbers.

Also exports the `TRL_LEVELS` constant map used by the New Product page.

### 6.2 TRLProgress (`/app/(routes)/solutions/_components/trl-progress.tsx`)

Visual progress indicator showing all 9 TRL levels as a horizontal timeline.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentTRL` | `number` | -- | Current TRL level |
| `targetTRL` | `number` | -- | Optional target TRL level |
| `className` | `string` | -- | Additional CSS classes |

**Visual elements:**
- **RDIF Threshold Marker** -- positioned at TRL 4 (33% from left), shows "RDIF Threshold" label with JKKN green (`#0b6d41`) connector line
- **9 level circles** -- each 40x40px rounded-full:
  - Completed (below current): green background with checkmark icon
  - Current: blue background with pulsing animation, shows level number
  - Future: gray background with circle icon
  - TRL 4: highlighted with JKKN green ring (`ring-2 ring-[#0b6d41] ring-offset-2`)
  - Target: yellow dot indicator (absolute positioned, top-right)
- **Level numbers** -- below each circle
- **Level names** -- below numbers (hidden on small screens, `hidden sm:block`)
- **Legend** -- Completed / Current / Future indicators

### 6.3 RDIFScorecard (`/app/(routes)/solutions/_components/rdif-scorecard.tsx`)

Circular progress chart + prerequisite checklist for RDIF readiness.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `prerequisites` | `RDIFPrerequisite[]` | -- | Array of prerequisites with `id`, `name`, `met`, `evidence?`, `targetDate?`, `lastUpdated?` |
| `showDetails` | `boolean` | `false` | Whether to show full list or summary (first 3) |
| `className` | `string` | -- | Additional CSS classes |

**Visual elements:**
- **Header** -- "RDIF Readiness" title + score badge (X of 9), badge color varies: green (7+), yellow (4-6), red (<4)
- **SVG Progress Circle** -- 128x128px, stroke-based ring, colored by score threshold:
  - Green (`text-green-500`) when 7+ met
  - Yellow (`text-yellow-500`) when 4-6 met
  - Red (`text-red-500`) when <4 met
  - Center shows percentage + "Ready" label
- **Detail mode** (`showDetails=true`): Full list of all prerequisites, each in a card with:
  - Green background + check icon if met, gray background + X icon if not
  - Evidence text (if provided)
  - Target date with clock icon (if not met and target date exists)
- **Summary mode** (`showDetails=false`): First 3 prerequisites with check/X icons, "+ N more" text

---

## 7. Business Rules

### 7.1 TRL Progression Rules

1. TRL values must be integers from 1 to 9. Enforced at database level (CHECK constraint) and service level (validation before update).
2. TRL can be set to any value -- there is no enforcement of sequential progression. This is intentional: a reassessment might lower a TRL if prior evidence is invalidated.
3. When TRL is updated via `updateTRL()`, `trl_assessed_at` is automatically set to the current timestamp and `trl_assessed_by` is recorded.
4. TRL history is reconstructed from the `sh_product_validations` table, ordered by `trl_level ASC, validation_date ASC`.
5. TRL 4 is the critical RDIF threshold. The UI highlights this with a ring indicator on the progress component and a conditional status message on the detail page.

### 7.2 RDIF Scoring Logic

1. The RDIF readiness score is a simple count: `score = count(prerequisites where is_met = true)`.
2. There are exactly 9 prerequisites, so the score is always 0-9.
3. The three-year bridge year is determined by score thresholds:
   - Score 0-3: Year 1 (Foundation)
   - Score 4-6: Year 2 (Growth)
   - Score 7-9: Year 3 (Readiness)
4. RDIF eligibility requires a minimum score of 7.
5. Next milestones are sorted by a static priority map: Critical > High > Medium > Low.
6. The `rdif_readiness_score` on `sh_products` is a denormalized field. It is NOT automatically synced with the prerequisite table -- it must be updated manually or through a future background sync.

### 7.3 Licensing Pivot Workflow

The module supports the "licensing pivot" from the FST analysis:

1. **When a client deal uses Template B (licensing):** Set `retained_ip = true` on the `sh_solutions` record.
2. **When reusable technology is identified:** Create an `SHProduct` with `originating_solution_ids` pointing to the relevant solution(s).
3. **Product starts at TRL 1** (basic principles observed). Add validation evidence as the technology matures.
4. **Track patent lifecycle** through `patent_status` progression: none -> provisional_filed -> full_filed -> granted.
5. **Budget tracking** via `development_budget` and `development_spent` fields.

### 7.4 Product Code Generation

The `generateProductCode()` method:
1. Gets the current year (e.g., 2026)
2. Queries for the highest existing code with prefix `JKKN-PRD-2026-`
3. Increments the sequence number
4. Zero-pads to 3 digits
5. Returns format: `JKKN-PRD-2026-001`, `JKKN-PRD-2026-002`, etc.
6. Resets to 001 each calendar year

---

## 8. RDIF Prerequisites -- Full Reference

The 9 prerequisites with current JKKN/JICATE status (as of 2026-02-10):

| # | Key | Label | Met? | Current Evidence | What's Needed |
|---|-----|-------|------|------------------|---------------|
| 1 | `registered_company` | Registered Company | YES | JICATE Solutions registered under Companies Act | Maintained |
| 2 | `indian_control` | Indian Citizen Control (51%+) | YES | Same management as JKKN Institutions | Maintained |
| 3 | `trl_4_plus` | Technology at TRL 4+ | NO | No products at TRL 4+ | Build first health-tech product, validate in lab environment |
| 4 | `ip_portfolio` | IP Portfolio | NO | No patents filed | File provisional patent on retained IP from client solutions |
| 5 | `co_investment` | Capital for 50% Co-investment | NO | No earmarked R&D capital | Solutions Model revenue must fund R&D budget line |
| 6 | `rd_track_record` | R&D Track Record | NO | Zero publications, zero validated research | 2-3 ANRF grant applications, faculty publications |
| 7 | `slfm_relationships` | SLFM/VC Relationships | NO | No relationships with Strategic Lead Financial Members | Attend RDIF/ANRF events, map health-tech SLFMs |
| 8 | `dsir_recognition` | DSIR-SIRO Recognition | NO | No DSIR recognition | Apply via Pharmacy or Dental research unit |
| 9 | `research_output` | Research Publications | NO | Likely weak, unknown exact count | Target 5 research-adjacent departments for Scopus-indexed papers |

**Current Score: 2 of 9 (22%)**

---

## 9. Three-Year Bridge

The bridge plan from the FST analysis maps directly to this module's data model:

### Year 1: 2026 -- Foundation (Score target: 2 -> 3)

| Track | Module Feature Used | Expected Outcome |
|-------|---------------------|------------------|
| Solutions Model (70%) | `sh_solutions.retained_ip` flag | 10-20 deals, some with Template B |
| Licensing Pivot (2%) | `SHProduct` creation from retained IP | First products registered at TRL 1-2 |
| ANRF Grants (5%) | `sh_rdif_prerequisites.research_output` update | Grant applications submitted (counts as progress) |

**Year-End Gate:** If < 8 deals close and < Rs 30L collected, all RDIF tracks pause.

### Year 2: 2027 -- Growth (Score target: 3 -> 5)

| Track | Module Feature Used | Expected Outcome |
|-------|---------------------|------------------|
| IP Portfolio (5%) | `patent_status` progression, validation evidence | First provisional patent filed |
| Research Output (10%) | RDIF prerequisite updates | 1 published paper, 2 in review |
| Product Development (5%) | TRL progression tracking, validations | 2-3 retained IP assets at TRL 2+ |

**Year-End Gate:** IP assets >= 3 with TRL 2+, >= 1 published paper, escalation ratio <= 40%.

### Year 3: 2028 -- Readiness (Score target: 5 -> 7)

| Track | Module Feature Used | Expected Outcome |
|-------|---------------------|------------------|
| TRL 4+ Product (5%) | Full TRL progression with external validation | One product at TRL 4 with evidence package |
| DSIR Recognition (10%) | Prerequisite update | Application submitted/approved |
| SLFM Relationships (5%) | Prerequisite update | Introductory meeting with health-tech SLFM |

**Year-End Assessment:** 7 of 9 prerequisites met = ready for RDIF application consideration.

### How the Module Tracks Bridge Progress

1. **Bridge status** is calculated live by `RDIFService.getThreeYearBridgeStatus()` based on current prerequisite scores
2. **Year determination** is automatic: score 0-3 = Year 1, 4-6 = Year 2, 7-9 = Year 3
3. **Next milestones** prioritize unmet prerequisites by importance (critical > high > medium)
4. **Eligibility flag** turns true at score >= 7
5. **No time-based forcing** -- the bridge year is purely score-based. If JKKN stays at score 2 for three calendar years, the system still shows Year 1. This is honest by design.

---

## 10. Future Enhancements

### 10.1 Planned (From FST Analysis and TODO Comments)

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| **Wire pages to real hooks** | HIGH | Replace mock data in list, detail, and create pages with actual `useProducts`, `useProduct`, `useCreateProduct` calls |
| **Product edit page** | HIGH | `/solutions/products/[id]/edit` -- referenced in detail page but not yet built |
| **RDIF dashboard page** | HIGH | `/solutions/products/rdif` -- linked from list page, should show full scorecard + bridge status + milestones |
| **Originating solutions multi-select** | MEDIUM | Create product form has TODO for linking to existing solutions |
| **Dashboard integration** | MEDIUM | `SolutionsDashboard` currently shows hardcoded "0 Products" and "2 of 9 RDIF Ready" -- wire to `useProductStats` and `useRDIFReadinessScore` |
| **Auto-sync RDIF score** | LOW | Automatically recalculate `rdif_readiness_score` on `sh_products` when prerequisites change |
| **TRL assessment workflow** | LOW | Formal workflow where TRL changes require validation evidence before the level is updated |
| **Product timeline view** | LOW | Visual timeline showing TRL progression over time with validation milestones |
| **ANRF grant tracker** | LOW | Track grant applications as a sub-entity linked to research_output prerequisite |
| **Essential Infrastructure tracker** | LOW | Track partnerships with RDIF-funded companies |
| **NIF startup integration** | LOW | Link NIF startups to products when they share technology |

### 10.2 Not Planned (Explicitly Rejected by FST Analysis)

| Feature | Why Rejected |
|---------|-------------|
| Full RDIF application workflow | JKKN is 3+ years away from eligibility. Building this now is premature. |
| SLFM CRM integration | Only 2 SLFMs are active nationally. Not enough volume to justify a system. |
| Co-investment calculator | Financial modeling is meaningless at current scale (Rs 4.5L deals vs Rs 50 Cr RDIF tickets). |
| Automated TRL assessment via AI | TRL assessments require domain expert judgment and external validation. AI cannot substitute. |

---

## Appendix: File Inventory

| File | Purpose |
|------|---------|
| `/types/products.ts` | Canonical TypeScript types, enums, constants, TRL level definitions |
| `/lib/services/solutions/products-service.ts` | ProductsService class -- CRUD, TRL, validations, RDIF prerequisites, stats |
| `/lib/services/solutions/rdif-service.ts` | RDIFService class -- readiness calculations, bridge status, milestones |
| `/hooks/solutions/use-products.ts` | React Query hooks for all product/TRL/RDIF operations |
| `/lib/query-keys.ts` | Query key definitions under `solutionsHubKeys.products` |
| `/app/(routes)/solutions/products/page.tsx` | Products list page |
| `/app/(routes)/solutions/products/new/page.tsx` | Create product page |
| `/app/(routes)/solutions/products/[id]/page.tsx` | Product detail page with 5 tabs |
| `/app/(routes)/solutions/_components/trl-badge.tsx` | TRL level badge component |
| `/app/(routes)/solutions/_components/trl-progress.tsx` | TRL 1-9 progress visualization |
| `/app/(routes)/solutions/_components/rdif-scorecard.tsx` | RDIF circular progress + checklist |
| `/app/(routes)/solutions/_components/solutions-dashboard.tsx` | Modified dashboard with Products & TRL card |
| `/supabase/migrations/20260210130001_create_trl_product_tables.sql` | Database migration (tables, RLS, indexes, triggers, seed data) |

### Related Files (Context)

| File | Relationship |
|------|-------------|
| `/lib/services/solutions/types.ts` | Existing solutions types -- `Solution` interface now includes `retained_ip` and `ip_retention_notes` fields |
| `/Vaults/JKKNKB/.../RDIF/FST-Team-Recalibration-Analysis.md` | The strategic analysis that drove this entire module's design |

---

*Spec Version: 1.0*
*Created: 2026-02-10*
*Module Status: Service layer and hooks production-ready. Pages use mock data pending hook wiring.*
