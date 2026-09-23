// src/config/techniqueOptions.ts
// Stage 6.5: "How is it made?" technique options, by craft category.
// Icon cards in the Describe step; the same list backs the voice 'choice' field.
// Add a new craft's techniques here — nothing else needs to change.

import type { LucideIcon } from 'lucide-react';
import { Axe, Disc3, Puzzle, Cog, CircleDot, Hand, Shapes, Flame, Hammer, PenTool, Grid3x3, Stamp, Feather } from 'lucide-react';
import type { IdentifiedProductCategory } from '../types';
import type { VoiceFieldChoice } from '../types/voice';

export interface TechniqueOption {
  /** Stable id: saved to products.technique and used as the voice choice id. */
  id: string;
  icon: LucideIcon;
  en: string;
  hi: string;
  mr: string;
}

const handCarved: TechniqueOption = { id: 'hand-carved', icon: Axe, en: 'Hand-carved', hi: 'हाथ से नक्काशी', mr: 'हाताने कोरीव काम' };
const handTurnedLathe: TechniqueOption = { id: 'hand-turned-lathe', icon: Disc3, en: 'Hand-turned (lathe)', hi: 'खराद पर घुमाकर', mr: 'खरादीवर वळवून' };
const handJoined: TechniqueOption = { id: 'hand-joined', icon: Puzzle, en: 'Hand-joined', hi: 'हाथ से जोड़ा गया', mr: 'हाताने जोडलेले' };
const partlyMachine: TechniqueOption = { id: 'partly-machine', icon: Cog, en: 'Partly machine', hi: 'आंशिक मशीन से', mr: 'अंशतः यंत्राने' };

/**
 * Woodwork/Furniture: hand-carved, hand-turned (lathe), hand-joined, partly machine
 * Pottery: wheel-thrown, hand-built, moulded
 * Brasscraft/Metal: hand-cast (lost-wax/dhokra), hand-beaten, engraved, partly machine
 * Textile: handloom-woven, hand-block printed, hand-embroidered, partly machine
 */
export const TECHNIQUE_OPTIONS_BY_CATEGORY: Record<IdentifiedProductCategory, TechniqueOption[]> = {
  Woodwork: [handCarved, handTurnedLathe, handJoined, partlyMachine],
  Furniture: [handCarved, handTurnedLathe, handJoined, partlyMachine],
  Pottery: [
    { id: 'wheel-thrown', icon: CircleDot, en: 'Wheel-thrown', hi: 'चाक पर बनाया गया', mr: 'चाकावर घडवलेले' },
    { id: 'hand-built', icon: Hand, en: 'Hand-built', hi: 'हाथ से बनाया गया', mr: 'हाताने घडवलेले' },
    { id: 'moulded', icon: Shapes, en: 'Moulded', hi: 'सांचे में ढाला गया', mr: 'साच्यात ओतलेले' },
  ],
  Brasscraft: [
    { id: 'hand-cast', icon: Flame, en: 'Hand-cast (lost-wax/dhokra)', hi: 'हाथ से ढाला (लॉस्ट-वैक्स/ढोकरा)', mr: 'हाताने ओतलेले (लॉस्ट-वॅक्स/ढोकरा)' },
    { id: 'hand-beaten', icon: Hammer, en: 'Hand-beaten', hi: 'हाथ से पीटा गया', mr: 'हाताने ठोकलेले' },
    { id: 'engraved', icon: PenTool, en: 'Engraved', hi: 'नक्काशी की गई', mr: 'कोरीव काम केलेले' },
    partlyMachine,
  ],
  Metal: [
    { id: 'hand-cast', icon: Flame, en: 'Hand-cast (lost-wax/dhokra)', hi: 'हाथ से ढाला (लॉस्ट-वैक्स/ढोकरा)', mr: 'हाताने ओतलेले (लॉस्ट-वॅक्स/ढोकरा)' },
    { id: 'hand-beaten', icon: Hammer, en: 'Hand-beaten', hi: 'हाथ से पीटा गया', mr: 'हाताने ठोकलेले' },
    { id: 'engraved', icon: PenTool, en: 'Engraved', hi: 'नक्काशी की गई', mr: 'कोरीव काम केलेले' },
    partlyMachine,
  ],
  Textile: [
    { id: 'handloom-woven', icon: Grid3x3, en: 'Handloom-woven', hi: 'हथकरघा बुनाई', mr: 'हातमागावर विणलेले' },
    { id: 'hand-block-printed', icon: Stamp, en: 'Hand-block printed', hi: 'हाथ से छपाई (ब्लॉक प्रिंट)', mr: 'हाताने ठसा छपाई' },
    { id: 'hand-embroidered', icon: Feather, en: 'Hand-embroidered', hi: 'हाथ की कढ़ाई', mr: 'हाताने भरतकाम' },
    partlyMachine,
  ],
};

/** Techniques for a category, or [] if the category has none configured. */
export function getTechniqueOptions(category: IdentifiedProductCategory | null | undefined): TechniqueOption[] {
  if (!category) return [];
  return TECHNIQUE_OPTIONS_BY_CATEGORY[category] ?? [];
}

/** Same options as VoiceFieldChoice[], for the voice 'choice' field fallback. */
export function techniqueVoiceChoices(category: IdentifiedProductCategory | null | undefined): VoiceFieldChoice[] {
  return getTechniqueOptions(category).map((t) => ({ id: t.id, label_en: t.en, label_hi: t.hi }));
}
