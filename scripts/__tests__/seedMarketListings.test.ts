import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  parseCSVLine,
  parseCSV,
  validateRow,
  seedMarketListings,
  KNOWN_CATEGORIES,
} from '../seedMarketListings';

describe('Market Listing Ingestion Pipeline (Stage 0.4)', () => {
  describe('parseCSVLine() & parseCSV()', () => {
    it('correctly parses comma-separated values including quoted fields and escaped quotes', () => {
      const line = 'Woodwork,Teak Wood,4500,2499.00,"SAMPLE DATA - Handcarved Teak Elephant 8in"';
      const parsed = parseCSVLine(line);
      expect(parsed).toEqual([
        'Woodwork',
        'Teak Wood',
        '4500',
        '2499.00',
        'SAMPLE DATA - Handcarved Teak Elephant 8in',
      ]);
    });

    it('parses CSV content into header-keyed objects', () => {
      const csv = `category,material,dimensions_volume,listed_price,source\nWoodwork,Teak Wood,4500,2499.00,"Source A"`;
      const { headers, rows } = parseCSV(csv);
      expect(headers).toEqual(['category', 'material', 'dimensions_volume', 'listed_price', 'source']);
      expect(rows.length).toBe(1);
      expect(rows[0].data.category).toBe('Woodwork');
      expect(rows[0].data.material).toBe('Teak Wood');
      expect(rows[0].data.listed_price).toBe('2499.00');
    });
  });

  describe('validateRow() business rules', () => {
    it('accepts valid rows across all 6 known categories', () => {
      for (const cat of KNOWN_CATEGORIES) {
        const raw = {
          category: cat,
          material: 'Sample Material',
          dimensions_volume: '1500',
          listed_price: '1200.00',
          source: 'Sample Source',
        };
        const result = validateRow(raw, 2);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.item.category).toBe(cat);
          expect(result.item.material).toBe('Sample Material');
          expect(result.item.dimensions_volume).toBe(1500);
          expect(result.item.listed_price).toBe(1200);
        }
      }
    });

    it('allows null dimensions_volume when field is omitted or empty', () => {
      const raw = {
        category: 'Pottery',
        material: 'Clay',
        dimensions_volume: '',
        listed_price: '550.00',
        source: '',
      };
      const result = validateRow(raw, 3);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.item.dimensions_volume).toBeNull();
        expect(result.item.source).toBeNull();
      }
    });

    it('rejects row when required fields are missing', () => {
      const missingCategory = { category: '', material: 'Brass', listed_price: '100' };
      expect(validateRow(missingCategory, 4).valid).toBe(false);

      const missingMaterial = { category: 'Brasscraft', material: '', listed_price: '100' };
      expect(validateRow(missingMaterial, 5).valid).toBe(false);

      const missingPrice = { category: 'Brasscraft', material: 'Brass', listed_price: '' };
      expect(validateRow(missingPrice, 6).valid).toBe(false);
    });

    it('rejects unknown or invalid categories', () => {
      const invalidCat = { category: 'PlasticCraft', material: 'Plastic', listed_price: '250' };
      const res = validateRow(invalidCat, 7);
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.reason).toContain("Invalid category 'PlasticCraft'");
      }
    });

    it('rejects listed_price <= 0 or non-numeric prices', () => {
      const zeroPrice = { category: 'Metal', material: 'Iron', listed_price: '0.00' };
      const resZero = validateRow(zeroPrice, 8);
      expect(resZero.valid).toBe(false);

      const negativePrice = { category: 'Metal', material: 'Iron', listed_price: '-50' };
      const resNeg = validateRow(negativePrice, 9);
      expect(resNeg.valid).toBe(false);

      const nanPrice = { category: 'Metal', material: 'Iron', listed_price: 'Free' };
      const resNan = validateRow(nanPrice, 10);
      expect(resNan.valid).toBe(false);
    });
  });

  describe('seedMarketListings() execution against sample CSV', () => {
    it('successfully processes sample CSV and reports 10 rows read, 10 inserted, 0 rejected', async () => {
      const sampleCsvPath = path.resolve(process.cwd(), 'data', 'market-reference-listings.csv');
      const result = await seedMarketListings(sampleCsvPath);

      expect(result.rowsRead).toBe(10);
      expect(result.rowsInserted).toBe(10);
      expect(result.rowsRejected).toBe(0);
      expect(result.rejections).toHaveLength(0);
    });
  });
});
