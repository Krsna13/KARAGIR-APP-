import type { CraftSpecification } from '../types/copilot';
import { PRIMARY_MATERIALS, SECONDARY_ACCENTS } from '../data/karagirPricingMockData';

export interface CampaignLauncherStateUpdate {
  displayLength?: number | string;
  displayWidth?: number | string;
  displayHeight?: number | string;
  primaryMaterial?: string;
  accentsToToggle?: string[]; // IDs to toggle
  customItemName?: string;
  aiDescription?: string;
}

export function mapSpecificationToCampaignState(spec: CraftSpecification): CampaignLauncherStateUpdate {
  const update: CampaignLauncherStateUpdate = {};

  if (spec.length_ft !== null) update.displayLength = spec.length_ft;
  if (spec.width_ft !== null) update.displayWidth = spec.width_ft;
  if (spec.height_ft !== null) update.displayHeight = spec.height_ft;

  if (spec.product) {
    update.customItemName = spec.product;
  }

  if (spec.material) {
    // Attempt to match the material to PRIMARY_MATERIALS
    const lowerMat = spec.material.toLowerCase();
    const matchedMat = PRIMARY_MATERIALS.find(m => 
      m.name.toLowerCase().includes(lowerMat) || lowerMat.includes(m.name.toLowerCase())
    );
    if (matchedMat) {
      update.primaryMaterial = matchedMat.name;
    }
  }

  if (spec.features && spec.features.length > 0) {
    update.accentsToToggle = [];
    spec.features.forEach(feature => {
      const lowerFeature = feature.toLowerCase();
      const matchedAccent = SECONDARY_ACCENTS.find(a => 
        a.name.toLowerCase().includes(lowerFeature) || lowerFeature.includes(a.name.toLowerCase())
      );
      if (matchedAccent && update.accentsToToggle) {
        update.accentsToToggle.push(matchedAccent.id);
      }
    });
  }

  // Construct a fallback AI description for the 3D generation text area if needed
  const descParts = [];
  if (spec.style) descParts.push(spec.style);
  if (spec.features.length > 0) descParts.push(spec.features.join(", "));
  if (spec.finish) descParts.push(`${spec.finish} polish`);
  if (descParts.length > 0) {
    update.aiDescription = descParts.join(" with ");
  }

  return update;
}
