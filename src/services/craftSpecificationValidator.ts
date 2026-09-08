import type { CraftSpecification } from '../types/copilot';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateCraftSpecification(spec: CraftSpecification): ValidationResult {
  const errors: string[] = [];

  // Dimensions Validation
  if (spec.length_ft !== null && spec.length_ft <= 0) {
    errors.push("Length must be a positive number.");
  }
  if (spec.width_ft !== null && spec.width_ft <= 0) {
    errors.push("Width must be a positive number.");
  }
  if (spec.height_ft !== null && spec.height_ft <= 0) {
    errors.push("Height must be a positive number.");
  }

  // Basic sanity limits (could be expanded based on product category later)
  if (spec.length_ft !== null && spec.length_ft > 20) {
    errors.push("Requested length exceeds standard manufacturing bounds (max 20 ft).");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
