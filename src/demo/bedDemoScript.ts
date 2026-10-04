// src/demo/bedDemoScript.ts
import type { ProductAiIdentification } from '../types/product';
import type { PhotoIdentificationResult } from '../services/productIdentificationService';
import type { OnlineEstimate } from '../services/priceEstimateService';
import type { ListingResult } from '../types/product';

export const bedDemoScript = {
  identifyProductPhotos: {
    identification: {
      item_name: 'Bed',
      material: 'Sheesham Wood',
      category: 'Furniture',
      shape_profile: 'box',
      complexity: 'medium',
      complexity_reason: 'Standard joinery and carvings',
      finish: 'polished',
      visible_features: ['Brass Fittings', 'Carved headboard'],
      confidence: 0.92,
      short_description: 'A polished Sheesham Wood bed with brass fittings.',
      item_name_spoken: 'Bed',
      material_spoken: 'Sheesham Wood',
    } as ProductAiIdentification,
    raw: {},
    usedImageIds: ['demo_image_1'],
    coverImageId: 'demo_image_1',
    retriedWithCoverOnly: false,
  } as PhotoIdentificationResult,

  voiceAnswers: {
    item_type: 'Bed',
    dimensions: '6.5 × 5 × 3.5 ft',
    technique: 'Hand carved and assembled with mortise and tenon joints.',
    materials: 'Sheesham wood and brass.',
    condition: 'New, polished finish.',
    style: 'Traditional Indian',
    origin: 'Rajasthan, India',
    age: 'Newly crafted',
    primary_material: 'Sheesham Wood'
  } as Record<string, string>,

  estimatePrice: {
    status: 'ok',
    low: 25000,
    high: 35000,
    listings: [
      { title: 'Sheesham Wood King Bed', price: 28000, source_url: 'https://example.com/1', source_title: 'Example Store' },
      { title: 'Traditional Brass Fitted Bed', price: 32000, source_url: 'https://example.com/2', source_title: 'Example Store' },
      { title: 'Wooden Carved Bed', price: 26000, source_url: 'https://example.com/3', source_title: 'Example Store' }
    ],
    sources: [
      { url: 'https://example.com/1', title: 'Example Store' }
    ]
  } as OnlineEstimate,

  generateListing: {
    title_en: 'Handcrafted Sheesham Wood Bed with Brass Fittings',
    title_hi: 'शीशम की लकड़ी का हाथ से बना बेड (पीतल की फिटिंग के साथ)',
    seo_caption_en: 'Traditional Indian Sheesham wood bed featuring elegant brass fittings.',
    seo_caption_hi: 'पारंपरिक भारतीय शीशम की लकड़ी का बेड जिसमें सुंदर पीतल की फिटिंग है।',
    highlights_en: ['Solid Sheesham Wood', 'Brass Fittings', 'Hand Carved', 'Polished Finish'],
    highlights_hi: ['ठोस शीशम की लकड़ी', 'पीतल की फिटिंग', 'हाथ से नक्काशीदार', 'पॉलिश फ़िनिश'],
    description_en: 'A beautifully handcrafted Sheesham Wood bed featuring traditional Indian carving techniques and elegant brass fittings. Finished with a high-quality polish for durability and style. Perfect for traditional or fusion style bedrooms.',
    description_hi: 'पारंपरिक भारतीय नक्काशी तकनीक और सुरुचिपूर्ण पीतल की फिटिंग वाला एक खूबसूरती से हस्तनिर्मित शीशम की लकड़ी का बेड। यह बेडरूम के लिए एकदम सही है।',
    search_tags: ['Sheesham Wood Bed', 'Handcrafted Furniture', 'Traditional Indian Bed', 'Wooden Bed'],
    summary_spoken: 'यह एक शीशम की लकड़ी का बेड है जो हाथ से नक्काशीदार है।'
  } as ListingResult
};
