/**
 * School Data Classification Script
 *
 * Automatically classifies schools and extracts location data from school names
 * in the learners_profiles table.
 *
 * Usage:
 *   npx tsx scripts/classify-school-data.ts --dry-run    # Preview changes
 *   npx tsx scripts/classify-school-data.ts              # Apply changes
 *   npx tsx scripts/classify-school-data.ts --help       # Show help
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

// School type classification patterns
const SCHOOL_TYPE_PATTERNS = {
  government: [
    /^G\s*\(/i,           // G(B)HSS, G(G)HSS
    /^G[BG]?HSS$/i,       // GHSS, GBHSS, GGHSS
    /^GOVT/i,             // GOVT, GOVERNMENT
    /GOVERNMENT/i,        // Government Higher Secondary School
    /^G\s+MODEL/i,        // G MODEL
    /^MODEL\s+S/i,        // MODEL S (often government)
    /^PUMS/i,             // Panchayat Union Middle School
    /^ADW/i,              // Adi Dravidar Welfare
  ],
  aided: [
    /AIDED/i,
    /^ST\./i,             // St. Mary's (often aided)
    /MUNICIPAL/i,
  ],
  private: [
    /MATRIC/i,
    /^SRI\s/i,
    /^SHRI\s/i,
    /VIDYALAYA/i,
    /INTERNATIONAL/i,
    /PUBLIC\s+SCHOOL/i,
    /ACADEMY/i,
    /CONVENT/i,
  ],
  cbse: [
    /CBSE/i,
    /KENDRIYA\s+VIDYALAYA/i,
    /KV\s/i,
    /CENTRAL\s+SCHOOL/i,
  ],
  icse: [
    /ICSE/i,
    /ANGLO/i,
  ],
  state_board: [
    /STATE\s+BOARD/i,
  ],
};

// Common districts in Tamil Nadu (can be expanded)
const TAMIL_NADU_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur',
  'Krishnagiri', 'Madurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur',
  'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
  'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur',
  'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram',
  'Virudhunagar',
];

// School name to district mappings (common patterns)
const SCHOOL_DISTRICT_KEYWORDS: Record<string, string> = {
  'NAMAKKAL': 'Namakkal',
  'SALEM': 'Salem',
  'ERODE': 'Erode',
  'COIMBATORE': 'Coimbatore',
  'TIRUPPUR': 'Tiruppur',
  'KRISHNAGIRI': 'Krishnagiri',
  'DHARMAPURI': 'Dharmapuri',
  'TIRUCHIRAPPALLI': 'Tiruchirappalli',
  'TRICHY': 'Tiruchirappalli',
  'MADURAI': 'Madurai',
  'CHENNAI': 'Chennai',
  'VELLORE': 'Vellore',
  'THANJAVUR': 'Thanjavur',
  'TIRUNELVELI': 'Tirunelveli',
  'KANYAKUMARI': 'Kanyakumari',
};

interface ClassificationResult {
  schoolType: string | null;
  confidence: 'high' | 'medium' | 'low';
  district: string | null;
}

/**
 * Classify a school based on its name
 */
function classifySchool(schoolName: string): ClassificationResult {
  const result: ClassificationResult = {
    schoolType: null,
    confidence: 'low',
    district: null,
  };

  if (!schoolName || schoolName === 'UNKNOWN SCHOOL' || schoolName.trim() === '') {
    return result;
  }

  const upperName = schoolName.toUpperCase();

  // Classify school type
  for (const [type, patterns] of Object.entries(SCHOOL_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(schoolName)) {
        result.schoolType = type;
        result.confidence = 'high';
        break;
      }
    }
    if (result.schoolType) break;
  }

  // If no match, try to infer from keywords
  if (!result.schoolType) {
    if (upperName.includes('HSS') || upperName.includes('HIGH SCHOOL')) {
      result.schoolType = 'government'; // Most HSS are government
      result.confidence = 'medium';
    } else if (upperName.includes('SCHOOL')) {
      result.schoolType = 'private'; // Generic "school" likely private
      result.confidence = 'low';
    }
  }

  // Extract district from school name
  for (const [keyword, district] of Object.entries(SCHOOL_DISTRICT_KEYWORDS)) {
    if (upperName.includes(keyword)) {
      result.district = district;
      break;
    }
  }

  // Try to match full district names
  if (!result.district) {
    for (const district of TAMIL_NADU_DISTRICTS) {
      if (upperName.includes(district.toUpperCase())) {
        result.district = district;
        break;
      }
    }
  }

  return result;
}

/**
 * Get unique schools from database
 */
async function getUniqueSchools() {
  console.log('\n📚 Fetching unique schools from database...\n');

  const { data, error } = await supabase
    .from('learners_profiles')
    .select('last_school')
    .in('lifecycle_status', ['active', 'graduated', 'alumni'])
    .not('last_school', 'is', null);

  if (error) {
    console.error('❌ Error fetching schools:', error);
    process.exit(1);
  }

  // Get unique school names and count students per school
  const schoolCounts = new Map<string, number>();
  data?.forEach(row => {
    const school = row.last_school || '';
    schoolCounts.set(school, (schoolCounts.get(school) || 0) + 1);
  });

  return schoolCounts;
}

/**
 * Classify all schools and show preview
 */
async function classifyAndPreview(dryRun: boolean) {
  const schoolCounts = await getUniqueSchools();

  console.log(`📊 Found ${schoolCounts.size} unique schools\n`);
  console.log('─'.repeat(100));

  const classifications = new Map<string, ClassificationResult>();
  const stats = {
    total: schoolCounts.size,
    classified: 0,
    withDistrict: 0,
    unknown: 0,
    byType: {} as Record<string, number>,
    byConfidence: { high: 0, medium: 0, low: 0 },
  };

  // Classify each school
  for (const [schoolName, studentCount] of schoolCounts) {
    const classification = classifySchool(schoolName);
    classifications.set(schoolName, classification);

    if (classification.schoolType) {
      stats.classified++;
      stats.byType[classification.schoolType] = (stats.byType[classification.schoolType] || 0) + 1;
      stats.byConfidence[classification.confidence]++;
    } else {
      stats.unknown++;
    }

    if (classification.district) {
      stats.withDistrict++;
    }
  }

  // Show statistics
  console.log('\n📈 Classification Statistics:\n');
  console.log(`Total Schools:        ${stats.total}`);
  console.log(`Classified:           ${stats.classified} (${((stats.classified / stats.total) * 100).toFixed(1)}%)`);
  console.log(`With District:        ${stats.withDistrict} (${((stats.withDistrict / stats.total) * 100).toFixed(1)}%)`);
  console.log(`Unknown:              ${stats.unknown} (${((stats.unknown / stats.total) * 100).toFixed(1)}%)`);

  console.log('\n📊 By School Type:');
  Object.entries(stats.byType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`  ${type.padEnd(15)} ${count.toString().padStart(4)} schools`);
    });

  console.log('\n🎯 By Confidence Level:');
  console.log(`  High:   ${stats.byConfidence.high} schools`);
  console.log(`  Medium: ${stats.byConfidence.medium} schools`);
  console.log(`  Low:    ${stats.byConfidence.low} schools`);

  // Show sample classifications
  console.log('\n📋 Sample Classifications (Top 20 schools by student count):\n');
  console.log('─'.repeat(100));
  console.log('School Name'.padEnd(40) + 'Students'.padStart(10) + 'Type'.padStart(15) + 'District'.padStart(20) + 'Conf.');
  console.log('─'.repeat(100));

  const topSchools = Array.from(schoolCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [schoolName, count] of topSchools) {
    const classification = classifications.get(schoolName)!;
    const displayName = schoolName.length > 38 ? schoolName.substring(0, 35) + '...' : schoolName;
    const type = classification.schoolType || 'unknown';
    const district = classification.district || 'N/A';
    const conf = classification.confidence[0].toUpperCase();

    console.log(
      displayName.padEnd(40) +
      count.toString().padStart(10) +
      type.padStart(15) +
      district.padStart(20) +
      `  ${conf}`
    );
  }
  console.log('─'.repeat(100));

  // Apply updates if not dry run
  if (!dryRun) {
    console.log('\n🔄 Applying classifications to database...\n');

    let updated = 0;
    let errors = 0;

    for (const [schoolName, classification] of classifications) {
      if (!classification.schoolType && !classification.district) {
        continue; // Skip if nothing to update
      }

      const updates: any = {};
      if (classification.schoolType) {
        updates.school_type = classification.schoolType;
      }
      if (classification.district) {
        updates.school_district = classification.district;
      }

      const { error } = await supabase
        .from('learners_profiles')
        .update(updates)
        .eq('last_school', schoolName)
        .in('lifecycle_status', ['active', 'graduated', 'alumni']);

      if (error) {
        console.error(`❌ Error updating "${schoolName}":`, error.message);
        errors++;
      } else {
        updated++;
        if (updated % 10 === 0) {
          process.stdout.write(`   Updated ${updated} schools...\r`);
        }
      }
    }

    console.log(`\n✅ Successfully updated ${updated} schools`);
    if (errors > 0) {
      console.log(`⚠️  ${errors} errors occurred`);
    }

    // Show final verification
    const { data: verification } = await supabase
      .from('learners_profiles')
      .select('school_type, school_district')
      .in('lifecycle_status', ['active', 'graduated', 'alumni'])
      .not('school_type', 'is', null);

    if (verification) {
      console.log(`\n📊 Final Database Status:`);
      console.log(`   Records with school_type: ${verification.length}`);
      console.log(`   Records with district: ${verification.filter(r => r.school_district).length}`);
    }
  } else {
    console.log('\n🔍 DRY RUN - No changes were made to the database');
    console.log('   Run without --dry-run to apply these classifications');
  }

  console.log('\n✨ Classification complete!\n');
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
📚 School Data Classification Script

Automatically classifies schools in the learners_profiles table based on naming patterns.

Usage:
  npx tsx scripts/classify-school-data.ts [options]

Options:
  --dry-run    Preview classifications without making changes
  --help, -h   Show this help message

Classifications:
  - Government schools (GHSS, G(B)HSS, etc.)
  - Private schools (Matriculation, International, etc.)
  - CBSE schools
  - ICSE schools
  - Aided schools
  - State Board schools

Also extracts district information from school names where possible.
  `);
  process.exit(0);
}

console.log('🚀 School Data Classification Script\n');
if (dryRun) {
  console.log('🔍 Running in DRY RUN mode - no changes will be made\n');
}

classifyAndPreview(dryRun)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
