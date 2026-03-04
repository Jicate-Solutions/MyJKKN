#!/usr/bin/env bash
# =============================================================
# IMS Data Migration: Old Project → Staging Project
# Created: 2026-03-03
#
# Usage:
#   1. Fill in the 4 variables below
#   2. chmod +x scripts/migrate-to-staging.sh
#   3. bash scripts/migrate-to-staging.sh
#
# Requirements:
#   - pg_dump and psql installed (PostgreSQL client tools)
#     Windows: download from https://www.postgresql.org/download/windows/
#              select only "Command Line Tools" component
#   - Network access to both Supabase project DBs
# =============================================================

set -euo pipefail

# ──────────────────────────────────────────────────────────
# 1. FILL THESE IN before running
# ──────────────────────────────────────────────────────────

OLD_DB_PASSWORD="REPLACE_WITH_OLD_PROJECT_DB_PASSWORD"
STAGING_DB_PASSWORD="REPLACE_WITH_STAGING_DB_PASSWORD"

OLD_DB_REF="zwiasdpodeirxnybwvuw"
STAGING_DB_REF="hhprjbgknupaplivtoib"

# ──────────────────────────────────────────────────────────
# 2. Derived connection strings (do not edit)
# ──────────────────────────────────────────────────────────

OLD_DB="postgresql://postgres:${OLD_DB_PASSWORD}@db.${OLD_DB_REF}.supabase.co:5432/postgres"
NEW_DB="postgresql://postgres:${STAGING_DB_PASSWORD}@db.${STAGING_DB_REF}.supabase.co:5432/postgres"

DUMP_FILE="ims_data_$(date +%Y%m%d_%H%M%S).sql"

# ──────────────────────────────────────────────────────────
# 3. IMS tables to export (20 tables)
# ──────────────────────────────────────────────────────────

IMS_TABLES=(
  ims_units
  ims_item_categories
  ims_items
  ims_unit_conversions
  ims_suppliers
  ims_stock_summary
  ims_stock_batches
  ims_goods_received_notes
  ims_grn_items
  ims_indent_requests
  ims_indent_request_items
  ims_stock_issues
  ims_sales
  ims_sale_items
  ims_financial_transactions
  ims_stores
  ims_upi_qr_payments
  ims_sale_number_counters
  ims_shifts
  ims_department_consumption
)

# Build -t flags for pg_dump
TABLE_FLAGS=""
for t in "${IMS_TABLES[@]}"; do
  TABLE_FLAGS="$TABLE_FLAGS -t public.$t"
done

# ──────────────────────────────────────────────────────────
# 4. Export
# ──────────────────────────────────────────────────────────

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 3: Exporting IMS data from old project..."
echo "Output file: $DUMP_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# shellcheck disable=SC2086
pg_dump "$OLD_DB" \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  $TABLE_FLAGS \
  > "$DUMP_FILE"

LINES=$(wc -l < "$DUMP_FILE")
echo "✓ Export complete. $LINES lines written to $DUMP_FILE"

# ──────────────────────────────────────────────────────────
# 5. Import
# ──────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 4: Importing IMS data into staging..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Disable RLS during import so FK resolution works across institution boundaries
psql "$NEW_DB" -c "SET session_replication_role = 'replica';" || true
psql "$NEW_DB" < "$DUMP_FILE"
psql "$NEW_DB" -c "SET session_replication_role = 'origin';" || true

echo "✓ Import complete."

# ──────────────────────────────────────────────────────────
# 6. Quick row count verification
# ──────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 7: Row count verification in staging..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

psql "$NEW_DB" <<'SQL'
SELECT
  'ims_items'                  AS table_name, COUNT(*) AS rows FROM ims_items
UNION ALL SELECT 'ims_stores',               COUNT(*) FROM ims_stores
UNION ALL SELECT 'ims_sales',                COUNT(*) FROM ims_sales
UNION ALL SELECT 'ims_stock_summary',        COUNT(*) FROM ims_stock_summary
UNION ALL SELECT 'ims_goods_received_notes', COUNT(*) FROM ims_goods_received_notes
UNION ALL SELECT 'ims_units',                COUNT(*) FROM ims_units
ORDER BY table_name;
SQL

echo ""
echo "✓ Migration complete! Review the row counts above."
echo ""
echo "Next steps:"
echo "  1. Update .env.local with staging credentials (see Phase 6 in STAGING_MIGRATION.md)"
echo "  2. Run: npm run dev"
echo "  3. Verify login, stores, inventory, sales"
echo "  4. Delete old Supabase project only after verification"
