// supabase/functions/_shared/riskyClaimsConfig.ts
/**
 * Configuration of risky promotional claims that must never be fabricated by the AI.
 * (Stage 6.6: No-Fabrication Rules).
 *
 * Any of these claims (in English or Hindi) found in the generated listing will fail
 * validation UNLESS the term is present in the artisan's own raw story or care instructions.
 */

export interface RiskyClaimDefinition {
  id: string;
  label: string;
  patterns: RegExp[];
}

export const RISKY_CLAIMS: RiskyClaimDefinition[] = [
  {
    id: 'antique',
    label: 'antique',
    patterns: [
      /\bantique(?:s)?\b/i,
      /\bantiquity\b/i,
      /प्राचीन/i,
      /एंटीक/i,
      /पुरातन/i,
    ],
  },
  {
    id: 'vintage',
    label: 'vintage',
    patterns: [
      /\bvintage\b/i,
      /विंटेज/i,
    ],
  },
  {
    id: 'heritage',
    label: 'heritage',
    patterns: [
      /\bheritage\b/i,
      /विरासत/i,
      /धरोहर/i,
    ],
  },
  {
    id: 'eco_friendly',
    label: 'eco-friendly',
    patterns: [
      /\beco[\s-]?friendly\b/i,
      /\benvironmentally[\s-]?friendly\b/i,
      /इको[\s-]?फ्रेंडली/i,
      /पर्यावरण[\s-]?अनुकूल/i,
      /पर्यावरण के अनुकूल/i,
    ],
  },
  {
    id: 'organic',
    label: 'organic',
    patterns: [
      /\borganic\b/i,
      /जैविक/i,
      /ऑर्गेनिक/i,
    ],
  },
  {
    id: 'sustainable',
    label: 'sustainable',
    patterns: [
      /\bsustainable\b/i,
      /\bsustainability\b/i,
      /सस्टेनेबल/i,
      /टिकाऊ विकास/i,
    ],
  },
  {
    id: 'certified',
    label: 'certified',
    patterns: [
      /\bcertified\b/i,
      /\bcertification\b/i,
      /सर्टिफाइड/i,
      /प्रमाणित/i,
      /सनद/i,
    ],
  },
  {
    id: 'gi_tag',
    label: 'GI tag',
    patterns: [
      /\bgi[\s-]?tag(?:ged)?\b/i,
      /\bgeographical[\s-]indication\b/i,
      /जीआई[\s-]?टैग/i,
      /जी\.?आई\.?[\s-]?टैग/i,
      /भौगोलिक संकेत/i,
    ],
  },
  {
    id: 'award_winning',
    label: 'award-winning',
    patterns: [
      /\baward[\s-]?winning\b/i,
      /\bawarded\b/i,
      /पुरस्कार विजेता/i,
      /पुरस्कृत/i,
    ],
  },
  {
    id: 'generations',
    label: 'generations',
    patterns: [
      /\bgeneration(?:s)?\b/i,
      /पीढ़ियों/i,
      /पीढ़ी/i,
      /पुश्तों/i,
    ],
  },
  {
    id: 'centuries',
    label: 'centuries',
    patterns: [
      /\bcentur(?:y|ies)\b/i,
      /सदियों/i,
      /सदी/i,
      /शताब्दी/i,
    ],
  },
  {
    id: 'hundred_percent',
    label: '100%',
    patterns: [
      /\b100\s*%/i,
      /\b100\s*percent\b/i,
      /१००\s*%/i,
      /शत[\s-]?प्रतिशत/i,
      /सौ प्रतिशत/i,
    ],
  },
  {
    id: 'guaranteed',
    label: 'guaranteed',
    patterns: [
      /\bguarantee(?:d)?\b/i,
      /\bwarranty\b/i,
      /गारंटी/i,
      /वारंटी/i,
      /गारंटीकृत/i,
    ],
  },
];
