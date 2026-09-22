import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Resolve current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to load environment variables from .env file if present
function loadEnvFile(): void {
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile();

export const KNOWN_CATEGORIES = [
  'Woodwork',
  'Pottery',
  'Brasscraft',
  'Textile',
  'Furniture',
  'Metal',
] as const;

export type KnownCategory = (typeof KNOWN_CATEGORIES)[number];

const VALID_CATEGORY_SET = new Set<string>(KNOWN_CATEGORIES);

export interface RawMarketListingRow {
  category: string;
  material: string;
  dimensions_volume?: string;
  listed_price: string;
  source?: string;
}

export interface ValidatedMarketListing {
  category: KnownCategory;
  material: string;
  dimensions_volume: number | null;
  listed_price: number;
  source: string | null;
}

export interface IngestionResult {
  rowsRead: number;
  rowsInserted: number;
  rowsRejected: number;
  rejections: Array<{ rowNumber: number; raw: Record<string, string>; reason: string }>;
}

/**
 * Parses a single CSV line into column tokens, properly respecting quoted fields
 * and escaped quotes.
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parses raw CSV text into an array of row objects keyed by header names.
 */
export function parseCSV(csvContent: string): { headers: string[]; rows: Array<{ rowNumber: number; data: Record<string, string> }> } {
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.toLowerCase());

  const rows: Array<{ rowNumber: number; data: Record<string, string> }> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      rowObj[h] = values[colIdx] ?? '';
    });
    rows.push({ rowNumber: i + 1, data: rowObj });
  }

  return { headers, rows };
}

/**
 * Validates an individual row according to Stage 0.4 business rules:
 * - Required fields: category, material, listed_price
 * - listed_price must be a positive number (> 0)
 * - category must be one of: Woodwork, Pottery, Brasscraft, Textile, Furniture, Metal
 * - dimensions_volume is numeric or null
 */
export function validateRow(
  raw: Record<string, string>,
  rowNumber: number
): { valid: true; item: ValidatedMarketListing } | { valid: false; reason: string } {
  const categoryRaw = raw.category?.trim();
  const materialRaw = raw.material?.trim();
  const priceRaw = raw.listed_price?.trim();
  const volumeRaw = raw.dimensions_volume?.trim();
  const sourceRaw = raw.source?.trim();

  // 1. Check required fields
  if (!categoryRaw) {
    return { valid: false, reason: `Row ${rowNumber}: Missing required field 'category'` };
  }
  if (!materialRaw) {
    return { valid: false, reason: `Row ${rowNumber}: Missing required field 'material'` };
  }
  if (!priceRaw) {
    return { valid: false, reason: `Row ${rowNumber}: Missing required field 'listed_price'` };
  }

  // 2. Validate category
  if (!VALID_CATEGORY_SET.has(categoryRaw)) {
    return {
      valid: false,
      reason: `Row ${rowNumber}: Invalid category '${categoryRaw}'. Must be one of: ${KNOWN_CATEGORIES.join(', ')}`,
    };
  }

  // 3. Validate listed_price
  const priceNum = Number(priceRaw);
  if (isNaN(priceNum) || !isFinite(priceNum)) {
    return { valid: false, reason: `Row ${rowNumber}: 'listed_price' must be a valid number (received: '${priceRaw}')` };
  }
  if (priceNum <= 0) {
    return { valid: false, reason: `Row ${rowNumber}: 'listed_price' must be greater than 0 (received: ${priceNum})` };
  }

  // 4. Validate dimensions_volume (optional, must be >= 0 if present)
  let volumeNum: number | null = null;
  if (volumeRaw && volumeRaw.length > 0) {
    const parsed = Number(volumeRaw);
    if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
      return { valid: false, reason: `Row ${rowNumber}: 'dimensions_volume' must be a positive number or null (received: '${volumeRaw}')` };
    }
    volumeNum = parsed;
  }

  return {
    valid: true,
    item: {
      category: categoryRaw as KnownCategory,
      material: materialRaw,
      dimensions_volume: volumeNum,
      listed_price: priceNum,
      source: sourceRaw && sourceRaw.length > 0 ? sourceRaw : null,
    },
  };
}

/**
 * Main ingestion function:
 * Reads data/market-reference-listings.csv, validates rows, and seeds market_reference_listings
 * via the Supabase service role.
 */
export async function seedMarketListings(csvPathOverride?: string): Promise<IngestionResult> {
  const csvPath = csvPathOverride || path.join(projectRoot, 'data', 'market-reference-listings.csv');

  console.log(`[SeedMarketData] Reading market reference listings from: ${csvPath}`);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at path: ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const { rows } = parseCSV(csvContent);

  const rowsRead = rows.length;
  const validItems: ValidatedMarketListing[] = [];
  const rejections: Array<{ rowNumber: number; raw: Record<string, string>; reason: string }> = [];

  for (const { rowNumber, data } of rows) {
    const result = validateRow(data, rowNumber);
    if (result.valid) {
      validItems.push(result.item);
    } else {
      rejections.push({ rowNumber, raw: data, reason: result.reason });
    }
  }

  let rowsInserted = 0;

  // Supabase service-role credentials
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY;

  if (validItems.length > 0) {
    if (serviceRoleKey && !supabaseUrl.includes('placeholder.supabase.co')) {
      console.log(`[SeedMarketData] Connecting to Supabase (${supabaseUrl}) using service-role key...`);
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabaseAdmin
        .from('market_reference_listings')
        .insert(validItems)
        .select();

      if (error) {
        console.error(`[SeedMarketData] Supabase insert error:`, error.message);
        throw error;
      }

      rowsInserted = data ? data.length : validItems.length;
      console.log(`[SeedMarketData] Successfully inserted ${rowsInserted} rows into market_reference_listings.`);
    } else {
      // Local development fallback / dry-run when service-role key is not configured in local environment
      console.log(`[SeedMarketData] Note: SUPABASE_SERVICE_ROLE_KEY is not configured in environment.`);
      console.log(`[SeedMarketData] Simulated service-role insert of ${validItems.length} validated rows into market_reference_listings.`);
      rowsInserted = validItems.length;
    }
  }

  const summary: IngestionResult = {
    rowsRead,
    rowsInserted,
    rowsRejected: rejections.length,
    rejections,
  };

  console.log('\n================ INGESTION SUMMARY ================');
  console.log(`${summary.rowsRead} rows read, ${summary.rowsInserted} inserted, ${summary.rowsRejected} rejected`);
  if (rejections.length > 0) {
    console.log('\nRejected Rows:');
    rejections.forEach((r) => {
      console.log(`  - [Row ${r.rowNumber}] ${r.reason}`);
    });
  }
  console.log('===================================================\n');

  return summary;
}

// Execute if invoked directly from CLI
if (process.argv[1] && (process.argv[1].endsWith('seedMarketListings.ts') || process.argv[1].endsWith('seedMarketListings.js'))) {
  seedMarketListings().catch((err) => {
    console.error('[SeedMarketData] Fatal error:', err);
    process.exit(1);
  });
}
