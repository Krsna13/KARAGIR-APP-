// src/utils/__tests__/localParsers.test.ts
// Stage 6.6b: Real-logic tests for local number and dimension parsing.

import { describe, it, expect } from 'vitest';
import {
  devanagariToAscii,
  parseLocalNumber,
  parseLocalDimensions,
} from '../localParsers';

describe('localParsers (Stage 6.6b Real-Logic Tests)', () => {
  describe('devanagariToAscii', () => {
    it('converts all Devanagari numerals ० through ९', () => {
      expect(devanagariToAscii('०१२३४५६७८९')).toBe('0123456789');
    });

    it('leaves standard ascii characters and digits untouched', () => {
      expect(devanagariToAscii('123abc456')).toBe('123abc456');
    });

    it('converts mixed Devanagari and Latin numbers with decimals', () => {
      expect(devanagariToAscii('१५.५')).toBe('15.5');
    });
  });

  describe('parseLocalNumber', () => {
    it('parses ASCII integer and decimal numbers', () => {
      expect(parseLocalNumber('42')).toBe(42);
      expect(parseLocalNumber('3.14')).toBe(3.14);
      expect(parseLocalNumber('  100  ')).toBe(100);
      expect(parseLocalNumber(250)).toBe(250);
    });

    it('parses numbers with Indian commas', () => {
      expect(parseLocalNumber('1,00,000')).toBe(100000);
      expect(parseLocalNumber('५,०००')).toBe(5000);
    });

    it('parses Devanagari numerals locally without any network or AI call', () => {
      expect(parseLocalNumber('१२')).toBe(12);
      expect(parseLocalNumber('५.५')).toBe(5.5);
      expect(parseLocalNumber('०')).toBe(0);
      expect(parseLocalNumber('९९९')).toBe(999);
    });

    it('returns null for empty, whitespace, or invalid text', () => {
      expect(parseLocalNumber('')).toBeNull();
      expect(parseLocalNumber('   ')).toBeNull();
      expect(parseLocalNumber('not a number')).toBeNull();
      expect(parseLocalNumber(null)).toBeNull();
      expect(parseLocalNumber(undefined)).toBeNull();
    });
  });

  describe('parseLocalDimensions', () => {
    it('parses box shape required dimensions (length, width, height)', () => {
      const parsed = parseLocalDimensions(
        { length: '30', width: '20', height: '10' },
        'cm',
        false,
        ['length', 'width', 'height']
      );

      expect(parsed).toEqual({
        length: 30,
        width: 20,
        height: 10,
        diameter: null,
        thickness: null,
        unit: 'cm',
        approximate: false,
      });
    });

    it('parses Devanagari digits in dimensions and respects approximate flag', () => {
      const parsed = parseLocalDimensions(
        { length: '१०', width: '५.५', height: '२' },
        'in',
        true,
        ['length', 'width', 'height']
      );

      expect(parsed).toEqual({
        length: 10,
        width: 5.5,
        height: 2,
        diameter: null,
        thickness: null,
        unit: 'in',
        approximate: true,
      });
    });

    it('parses round shape dimensions (height, diameter)', () => {
      const parsed = parseLocalDimensions(
        { height: '15', diameter: '8' },
        'in',
        false,
        ['height', 'diameter']
      );

      expect(parsed).toEqual({
        length: null,
        width: null,
        height: 15,
        diameter: 8,
        thickness: null,
        unit: 'in',
        approximate: false,
      });
    });

    it('parses flat shape required dimensions (length, width) with optional thickness', () => {
      const parsed = parseLocalDimensions(
        { length: '120', width: '60', thickness: '2' },
        'cm',
        false,
        ['length', 'width']
      );

      expect(parsed).toEqual({
        length: 120,
        width: 60,
        height: null,
        diameter: null,
        thickness: 2,
        unit: 'cm',
        approximate: false,
      });
    });

    it('rejects if a required dimension is missing, zero, or negative', () => {
      expect(
        parseLocalDimensions(
          { length: '30', width: '' },
          'cm',
          false,
          ['length', 'width']
        )
      ).toBeNull();

      expect(
        parseLocalDimensions(
          { length: '30', width: '0' },
          'cm',
          false,
          ['length', 'width']
        )
      ).toBeNull();

      expect(
        parseLocalDimensions(
          { length: '30', width: '-5' },
          'cm',
          false,
          ['length', 'width']
        )
      ).toBeNull();
    });

    it('rejects if unit is missing or invalid', () => {
      expect(
        parseLocalDimensions(
          { length: '30', width: '20' },
          null as any,
          false,
          ['length', 'width']
        )
      ).toBeNull();

      expect(
        parseLocalDimensions(
          { length: '30', width: '20' },
          'yards' as any,
          false,
          ['length', 'width']
        )
      ).toBeNull();
    });
  });
});
