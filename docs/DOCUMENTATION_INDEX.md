# MyJKKN Documentation Index

> Central index of all documentation files organized by date and category

---

## Overview

This index tracks all documentation in the MyJKKN project following the naming convention:
`YYYY-MM-DD-CATEGORY-title.md`

### Categories
- **MODULE**: Module-specific documentation
- **FEATURE**: Feature implementation documentation
- **FIX**: Bug fix documentation
- **GUIDE**: How-to guides
- **ARCHITECTURE**: System design documentation
- **API**: API documentation
- **PLAN**: Implementation plans

---

## Features

### SAML SSO Integration
**Date**: 2026-02-03
**Category**: Feature
**Status**: Implemented

**Description**: SAML 2.0 Identity Provider implementation for MathWorks SSO integration. Enables MyJKKN to act as a SAML IdP, allowing external Service Providers (like MathWorks) to authenticate users through MyJKKN.

**Documentation Files**:
- `docs/features/2026-02-03-FEATURE-saml-idp-implementation.md` - Complete implementation documentation
- `docs/plans/2026-02-03-PLAN-saml-idp-implementation.md` - Implementation plan with 14 tasks
- `docs/guides/2026-02-03-GUIDE-saml-configuration.md` - Configuration guide for admins
- `docs/api/2026-02-03-API-saml-endpoints.md` - SAML endpoint documentation

**Related Modules**:
- Authentication & Authorization
- User Management
- Institution Management
- Session Management

**Key Components**:
- SAML IdP Service (`lib/services/saml/saml-idp-service.ts`)
- Service Provider Management (`lib/services/saml/saml-service-provider-service.ts`)
- Session Management (`lib/services/saml/saml-session-service.ts`)
- Database Schema (`supabase/setup/01_tables.sql` - saml_service_providers, saml_sessions)
- API Endpoints (`app/api/saml/*`)
- Admin UI (`app/(routes)/admin/saml/service-providers/*`)

**Technical Stack**:
- samlify library (v2.8.12)
- SAML 2.0 protocol
- RSA-SHA256 signatures
- SHA256 digests
- Certificate-based authentication

**Security Features**:
- Certificate-based message signing
- Metadata validation
- Session management with TTL
- Nonce validation
- Institution-based access control

---

## Modules

<!-- Module documentation entries will be added here as they are created -->

---

## Fixes

<!-- Bug fix documentation entries will be added here as they are created -->

---

## Guides

<!-- Guide documentation entries will be added here as they are created -->

---

## Architecture

<!-- Architecture documentation entries will be added here as they are created -->

---

## API Documentation

<!-- API documentation entries will be added here as they are created -->

---

## Plans

<!-- Implementation plan entries will be added here as they are created -->

---

## Maintenance

### Adding New Documentation

1. Check this index first - does documentation already exist?
2. If exists → UPDATE the existing file
3. If new → Use appropriate template from `docs/templates/`
4. Follow naming convention: `YYYY-MM-DD-CATEGORY-title.md`
5. Update this index with the new entry
6. NEVER create duplicate documentation files

### Templates Available

- `docs/templates/MODULE_TEMPLATE.md` - For module documentation
- `docs/templates/FEATURE_TEMPLATE.md` - For feature documentation
- `docs/templates/FIX_TEMPLATE.md` - For bug fix documentation
- `docs/templates/API_TEMPLATE.md` - For API documentation
- `docs/templates/GUIDE_TEMPLATE.md` - For how-to guides

---

## Related Documentation

- **[Context Index](./context/INDEX.md)** - Module and entity reference documentation
- **[MYJKKN_CONTEXT.md](./MYJKKN_CONTEXT.md)** - High-level system overview
- **[CLAUDE.md](../CLAUDE.md)** - AI development guide
- **[SQL_FILE_INDEX.md](../supabase/SQL_FILE_INDEX.md)** - Database schema reference

---

*Last Updated: 2026-02-03*
*Index Version: 1.0*
