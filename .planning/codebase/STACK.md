# Technology Stack

**Analysis Date:** 2026-03-22

## Languages

**Primary:**
- TypeScript 5.x - All application code (frontend, backend, services, types)

**Secondary:**
- JavaScript - Configuration files (`postcss.config.mjs`, occasional scripts)
- SQL - Database schema, functions, policies, triggers (`supabase/setup/`)

## Runtime

**Environment:**
- Node.js 20.x (declared via `@types/node: ^20`)

**Package Manager:**
- npm (primary — `package-lock.json` present)
- bun (secondary — `bun.lock` present, likely used for faster installs)
- Lockfiles: Both `package-lock.json` and `bun.lock` are present

## Frameworks

**Core:**
- Next.js ^16.2.0 (App Router) - Full-stack React framework; all pages under `app/`
- React ^19.2.4 + React DOM ^19.2.4 - UI rendering

**Build/Dev:**
- Turbopack - Default bundler in Next.js 16 (enabled by default, `turbopack: {}` in `next.config.ts`)
- Webpack - Used only for SW compilation via `@serwist/next` plugin (production only)
- TypeScript compiler (`tsc`) - Type checking via `npm run typecheck`

**PWA:**
- Serwist (`@serwist/next` ^9.5.6, `serwist` ^9.5.6) - Service worker and PWA support
  - SW source: `app/sw.ts` → output: `public/sw.js`
  - Disabled in development, enabled in production
  - Offline fallback page at `/offline`

**Testing:**
- No test framework detected in `package.json`; `__tests__/` directory exists

## UI Framework & Component Libraries

**Styling:**
- Tailwind CSS ^3.4.1 - Utility-first CSS; config at `tailwind.config.ts`
- PostCSS ^8 - CSS processing; config at `postcss.config.mjs`
- `tailwind-merge` ^2.6.0 - Merges Tailwind classes safely
- `tailwindcss-animate` ^1.0.7 - Animation utilities
- `class-variance-authority` ^0.7.0 - Typed variant component API

**Component Library:**
- shadcn/ui (config at `components.json`) - Based on Radix UI primitives
- Full Radix UI suite: accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, popover, select, tabs, toast, tooltip, and more
- Lucide React ^0.453.0 - Icon set (primary)
- `@tabler/icons-react` ^3.33.0 - Secondary icon set
- `react-icons` ^5.4.0 - Additional icons

**Animation:**
- Framer Motion ^11.18.2 (`framer-motion`)
- Motion ^12.23.15 (`motion` — Framer Motion v12 standalone)

## Data Fetching & State Management

**Server State:**
- TanStack Query (`@tanstack/react-query`) ^5.72.1 - Async data fetching with caching
- SWR ^2.2.5 - Alternative data-fetching hook (used in some areas)

**Client State:**
- Zustand ^5.0.0 - Lightweight global state management

**Data Tables:**
- TanStack Table (`@tanstack/react-table`) ^8.20.5 - Headless table logic

## Forms

- React Hook Form ^7.61.0 - Form state management
- `@hookform/resolvers` ^3.10.0 - Zod integration for RHF
- Zod ^3.25.76 - Schema validation (used for forms, API validation, env checks)

## Rich Text / Content

- Tiptap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-underline`) ^2.27.2 - Rich text editor

## Charts & Data Visualization

- Chart.js ^4.5.0 + `react-chartjs-2` ^5.3.0
- Recharts ^2.15.4

## Date & Time

- `date-fns` ^3.6.0 - Date utility functions
- `date-fns-tz` ^3.2.0 - Timezone support
- Moment.js ^2.30.1 - Legacy usage (present but `date-fns` preferred)

## File & Export

- ExcelJS ^4.4.0 - Excel file generation
- xlsx ^0.20.3 (from SheetJS CDN) - Excel parsing
- jsPDF ^3.0.4 + `jspdf-autotable` ^5.0.2 - PDF generation (browser-only, excluded from server bundle via `serverExternalPackages`)
- `json2csv` ^6.0.0-alpha.2 - CSV export
- PapaParse ^5.5.2 - CSV parsing
- `file-saver` ^2.0.5 - Browser file download
- `html2canvas` ^1.4.1 - Screenshot to canvas

## Authentication & Cryptography

- `jose` ^6.0.12 - JWT creation/verification (used in LTI JWT service, RS256 signing)
- `jsonwebtoken` ^9.0.2 - JWT legacy usage
- `samlify` ^2.10.2 - SAML 2.0 IdP implementation (SAML SSO)
- `js-cookie` ^3.0.5 - Cookie management
- Node.js `crypto` module - HMAC signatures, key hashing

## Utilities

- `axios` ^1.7.7 - HTTP client (used in some service integrations)
- `uuid` ^11.0.1 - UUID generation
- `clsx` ^2.1.1 - Conditional class names
- `dotenv` ^16.4.7 - `.env` file loading
- `qrcode` ^1.5.4 - QR code generation
- `react-qr-scanner` ^1.0.0-alpha.11 - QR code scanning via camera
- `canvas-confetti` + `react-confetti` - Confetti animations
- `react-dropzone` ^14.3.5 - Drag-and-drop file upload
- `react-big-calendar` ^1.19.4 - Calendar component
- `embla-carousel-react` + `embla-carousel-autoplay` - Carousel/slider
- `react-window` ^2.2.5 - Virtualized list rendering
- `react-resizable-panels` ^2.1.5 - Resizable panel layouts
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` - Drag-and-drop
- `vaul` ^1.1.0 - Drawer component
- `cmdk` ^1.0.0 - Command menu
- `rough-notation` ^0.5.1 - Annotation/highlight effects
- `react-hot-toast` ^2.4.1 + `sonner` ^1.7.4 - Toast notifications
- `react-markdown` + `remark-gfm` + `react-syntax-highlighter` - Markdown rendering

## MCP (Model Context Protocol)

- `@modelcontextprotocol/sdk` ^1.27.1 - MCP server SDK
- `mcp-handler` ^1.0.7 - MCP HTTP handler (partially superseded by direct SDK usage)
- MCP server embedded in Next.js at `app/api/mcp/[transport]/route.ts`

## AI / LLM

- `@anthropic-ai/sdk` ^0.68.0 - Anthropic Claude API client
- `@vercel/speed-insights` ^1.2.0 - Vercel performance monitoring

## Push Notifications

- `web-push` ^3.6.7 - Web Push API (VAPID) for browser push notifications

## Configuration

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2017, module resolution: bundler
- Path alias: `@/*` maps to project root
- Strict mode: temporarily disabled during Next.js 16 migration (all strict flags `false`)
- Build errors ignored: `typescript.ignoreBuildErrors: true` in `next.config.ts`

**Next.js:**
- Config: `next.config.ts`
- `cacheComponents: true` (Cache Components for server-side caching, Next.js 16.1.1)
- `serverExternalPackages`: `jspdf`, `jspdf-autotable`, `fflate` (browser-only, excluded from SSR bundle)
- `transpilePackages`: `@supabase/ssr`, `@supabase/supabase-js` (prevents Turbopack HMR issues)
- `optimizePackageImports`: `lucide-react`, `react-icons`, `@radix-ui/react-icons`, `date-fns`, `react-hot-toast`
- Image remote hostname: `kvizhngldtiuufknvehv.supabase.co`
- Custom cache headers per route group (root, auth, SW, PWA assets)

**Linting:**
- ESLint ^8 + `eslint-config-next` ^16.2.0
- Config: standard Next.js ESLint config (no custom `.eslintrc` detected)

**shadcn/ui:**
- Config: `components.json`

## Platform Requirements

**Development:**
- Node.js 20+
- npm or bun
- HTTPS local dev supported via `proxy.ts` + `certs/` (self-signed via `selfsigned` devDep)

**Production:**
- Vercel (configured via `vercel.json`)
- Region: `bom1` (Mumbai, India)
- Git deployment disabled in `vercel.json` (manual deploy only)
- Framework: `nextjs`

---

*Stack analysis: 2026-03-22*
