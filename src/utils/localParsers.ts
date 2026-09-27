// src/utils/localParsers.ts
// Stage 6.6b: Local parsing for artisan typed numbers and dimensions.
// No AI call for numbers or dimensions; supports Devanagari numerals (०-९) and shape-aware dimensions.

import type { DimensionKey, VoiceDimensionsValue } from '../types/voice';

/**
 * Converts Devanagari numerals (०-९, U+0966 to U+096F) to standard ASCII digits (0-9).
 */
export function devanagariToAscii(str: string): string {
  if (!str) return '';
  return str.replace(/[\u0966-\u096F]/g, (char) =>
    String(char.charCodeAt(0) - 0x0966)
  );
}

/**
 * Parses a locally entered number string, converting Devanagari digits if present.
 * Accepts integers, decimals, and ignores commas or extra spacing.
 * Returns null if the input cannot be parsed as a valid finite number.
 */
export function parseLocalNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }

  const trimmed = input.trim();
  if (!trimmed) return null;

  const asciiStr = devanagariToAscii(trimmed).replace(/,/g, '').trim();
  // Match signed or unsigned integer or decimal number
  const match = asciiStr.match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export type RawDimensionInputs = Partial<Record<DimensionKey, string>>;

/**
 * Validates and parses locally entered craft dimensions.
 * Requires a valid unit ('ft' | 'in' | 'cm' | 'm') and all required dimension keys for the shape.
 * Parses numbers locally (accepting Devanagari digits).
 * Returns VoiceDimensionsValue or null if required inputs are incomplete or invalid.
 */
export function parseLocalDimensions(
  inputs: RawDimensionInputs,
  unit: 'ft' | 'in' | 'cm' | 'm' | null | undefined,
  approximate: boolean = false,
  requiredKeys: DimensionKey[] = ['length', 'width', 'height']
): VoiceDimensionsValue | null {
  if (!unit || !['ft', 'in', 'cm', 'm'].includes(unit)) {
    return null;
  }

  const result: VoiceDimensionsValue = {
    length: null,
    width: null,
    height: null,
    diameter: null,
    thickness: null,
    unit,
    approximate: Boolean(approximate),
  };

  // Every required key must parse to a strictly positive number
  for (const key of requiredKeys) {
    const rawVal = inputs[key];
    const parsed = parseLocalNumber(rawVal);
    if (parsed === null || parsed <= 0) {
      return null;
    }
    result[key] = parsed;
  }

  // Parse optional keys if entered
  const allKeys: DimensionKey[] = ['length', 'width', 'height', 'diameter', 'thickness'];
  for (const key of allKeys) {
    if (!requiredKeys.includes(key)) {
      const rawVal = inputs[key];
      if (rawVal !== undefined && rawVal !== null && rawVal.trim() !== '') {
        const parsed = parseLocalNumber(rawVal);
        if (parsed !== null && parsed > 0) {
          result[key] = parsed;
        }
      }
    }
  }

  return result;
}
