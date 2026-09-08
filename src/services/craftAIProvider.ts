import { MultimodalCraftRequest, CraftSpecification } from '../types/copilot';

export interface CraftAIProvider {
  analyzeRequest(request: MultimodalCraftRequest): Promise<CraftSpecification>;
}

export class MockCraftAIProvider implements CraftAIProvider {
  async analyzeRequest(request: MultimodalCraftRequest): Promise<CraftSpecification> {
    // Simulate network/processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const combinedInput = `
      ${request.text || ''} 
      ${request.voiceTranscript || ''}
      ${request.referenceImage ? 'reference image provided' : ''}
    `.toLowerCase();

    // Start with nulls to ensure we don't invent information
    const spec: CraftSpecification = {
      product: null,
      category: null,
      material: null,
      length_ft: null,
      width_ft: null,
      height_ft: null,
      seating_capacity: null,
      finish: null,
      style: null,
      features: [],
      notes: null,
    };

    // Very basic keyword matching for mock demonstration
    if (combinedInput.includes("dining table") || combinedInput.includes("table")) {
      spec.product = "Dining Table";
      spec.category = "Furniture";
    }

    if (combinedInput.includes("teak") || combinedInput.includes("sagwan")) {
      spec.material = "Sagwan Teak";
    } else if (combinedInput.includes("sheesham")) {
      spec.material = "Sheesham Wood";
    }

    // Extract length if "X ft" or "X feet" is present
    const lengthMatch = combinedInput.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)/);
    if (lengthMatch) {
      spec.length_ft = parseFloat(lengthMatch[1]);
    }

    // Extract capacity
    const capacityMatch = combinedInput.match(/for (\d+)\s*people/);
    if (capacityMatch) {
      spec.seating_capacity = parseInt(capacityMatch[1], 10);
    } else if (combinedInput.includes("6 seater") || combinedInput.includes("6-seater")) {
      spec.seating_capacity = 6;
    }

    if (combinedInput.includes("natural")) {
      spec.finish = "Natural Finish";
    }

    if (combinedInput.includes("carved legs")) {
      spec.features.push("Carved Legs");
    }
    if (combinedInput.includes("brass inlay")) {
      spec.features.push("Brass Inlay");
    }

    // Capture unparsed raw text as notes if needed
    if (request.text) {
        spec.notes = request.text;
    }

    return spec;
  }
}

// Global provider selection
let currentProvider: CraftAIProvider = new MockCraftAIProvider();

export function getCraftAIProvider(): CraftAIProvider {
  return currentProvider;
}

export function setCraftAIProvider(provider: CraftAIProvider) {
  currentProvider = provider;
}
