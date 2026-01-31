#!/bin/bash
# ============================================================================
# Pull Schema from Production to Staging (ONE-WAY, SCHEMA ONLY)
# ============================================================================
#
# ⛔ CRITICAL: This script NEVER writes to production!
#
# What it does:
#   ✅ READS schema from Production (tables, types, functions, triggers)
#   ✅ WRITES schema to Staging (after confirmation)
#
# What it does NOT do:
#   ❌ Never writes to Production
#   ❌ Never syncs data/records (only schema structure)
#   ❌ Never runs without confirmation
#
# Requirements:
# - Docker running (required for supabase db commands)
# - Supabase CLI installed
# - Logged in to Supabase CLI
#
# Usage:
#   ./scripts/pull-schema-from-production.sh
#   ./scripts/pull-schema-from-production.sh --dry-run  (preview only, no changes)
#
# ============================================================================

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project references
PRODUCTION_REF="kvizhngldtiuufknvehv"
STAGING_REF="hhprjbgknupaplivtoib"

# Temp file for diff
DIFF_FILE="/tmp/supabase-schema-diff-$(date +%Y%m%d-%H%M%S).sql"

# Parse arguments
DRY_RUN=false
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
    esac
done

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

confirm() {
    local prompt="$1"
    local response
    echo ""
    echo -e "${YELLOW}$prompt${NC}"
    read -p "Type 'yes' to continue, anything else to cancel: " response
    if [[ "$response" != "yes" ]]; then
        echo "Operation cancelled."
        exit 0
    fi
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

print_header "Pre-flight Checks"

# Check if Docker is running
print_info "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running!"
    echo ""
    echo "The Supabase CLI requires Docker for schema operations."
    echo "Please start Docker Desktop and try again."
    exit 1
fi
print_success "Docker is running"

# Check if Supabase CLI is installed
print_info "Checking Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    print_error "Supabase CLI not found!"
    echo ""
    echo "Install with: brew install supabase/tap/supabase"
    exit 1
fi
print_success "Supabase CLI found: $(supabase --version)"

# Check if logged in
print_info "Checking Supabase authentication..."
if ! supabase projects list > /dev/null 2>&1; then
    print_error "Not logged in to Supabase!"
    echo ""
    echo "Run: supabase login"
    exit 1
fi
print_success "Authenticated with Supabase"

# ============================================================================
# Safety Confirmation
# ============================================================================

print_header "Safety Confirmation"

echo -e "This script will:"
echo -e "  ${GREEN}READ${NC} from Production (${PRODUCTION_REF})"
echo -e "  ${YELLOW}WRITE${NC} to Staging (${STAGING_REF})"
echo ""
echo -e "${RED}PRODUCTION WILL NEVER BE MODIFIED${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "DRY RUN MODE - No changes will be applied"
fi

confirm "Do you understand and want to proceed?"

# ============================================================================
# Step 1: Link to Production and Generate Diff
# ============================================================================

print_header "Step 1: Generating Schema Diff from Production"

print_info "Linking to Production project..."
supabase link --project-ref "$PRODUCTION_REF"
print_success "Linked to Production"

print_info "Generating schema diff (this may take a moment)..."
# Generate diff comparing local migrations to remote production schema
# We use db diff to see what's in production that we don't have locally
if supabase db diff --linked > "$DIFF_FILE" 2>&1; then
    print_success "Schema diff generated: $DIFF_FILE"
else
    # Check if the diff is empty (no changes)
    if [[ ! -s "$DIFF_FILE" ]]; then
        print_info "No schema differences found - schemas are in sync!"
        rm -f "$DIFF_FILE"
        exit 0
    fi
    print_error "Failed to generate diff"
    exit 1
fi

# ============================================================================
# Step 2: Review the Diff
# ============================================================================

print_header "Step 2: Review Schema Changes"

if [[ ! -s "$DIFF_FILE" ]]; then
    print_info "No schema differences found - schemas are in sync!"
    rm -f "$DIFF_FILE"
    exit 0
fi

echo "Schema changes to be applied:"
echo ""
echo "----------------------------------------"
cat "$DIFF_FILE"
echo "----------------------------------------"
echo ""

LINES=$(wc -l < "$DIFF_FILE")
print_info "Total lines: $LINES"

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "DRY RUN - Stopping here. Diff saved to: $DIFF_FILE"
    exit 0
fi

# ============================================================================
# Step 3: Confirm Before Applying
# ============================================================================

print_header "Step 3: Apply Changes to Staging"

confirm "Do you want to apply these changes to STAGING ($STAGING_REF)?"

# ============================================================================
# Step 4: Link to Staging and Apply
# ============================================================================

print_info "Linking to Staging project..."
supabase link --project-ref "$STAGING_REF"
print_success "Linked to Staging"

print_info "Applying schema changes to Staging..."
if supabase db push --linked < "$DIFF_FILE" 2>&1; then
    print_success "Schema changes applied to Staging!"
else
    print_error "Failed to apply changes"
    echo ""
    echo "The diff file is preserved at: $DIFF_FILE"
    echo "You can manually review and apply it."
    exit 1
fi

# ============================================================================
# Step 5: Cleanup and Final State
# ============================================================================

print_header "Sync Complete"

# Keep linked to staging (safe state)
print_info "Keeping link to Staging (safe state)"
print_success "You are now linked to STAGING ($STAGING_REF)"

# Cleanup
rm -f "$DIFF_FILE"
print_success "Temporary files cleaned up"

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}SUCCESS: Schema synced from Production to Staging${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Test your changes on Staging"
echo "  2. Once verified, create a migration file for version control"
echo "  3. Apply to production via proper deployment process"
echo ""
