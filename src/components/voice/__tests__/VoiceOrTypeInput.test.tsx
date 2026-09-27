// src/components/voice/__tests__/VoiceOrTypeInput.test.tsx
// Stage 6.6b: Component test suite for VoiceOrTypeInput across all field types.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceOrTypeInput } from '../VoiceOrTypeInput';
import type { VoiceFieldSpec } from '../../../types/voice';
import * as voiceService from '../../../services/voiceTranscriptionService';

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function submitForm(element: HTMLElement) {
  const form = element.closest('form') || (element.tagName === 'FORM' ? (element as HTMLFormElement) : null);
  if (form) {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  } else {
    element.click();
  }
}

describe('VoiceOrTypeInput Component (Stage 6.6b)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('Number field typing path', () => {
    const numberField: VoiceFieldSpec = {
      key: 'labor_days',
      type: 'number',
      question_en: 'How many days did it take to make?',
    };

    it('parses ASCII numbers locally without AI call and triggers onValueConfirmed directly without confirm step', async () => {
      const onValueConfirmed = vi.fn();
      const transcribeSpy = vi.spyOn(voiceService, 'transcribeTextForField');

      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={numberField}
            speakingLanguage="hi"
            onValueConfirmed={onValueConfirmed}
          />
        );
      });

      const input = container.querySelector(
        '[data-testid="voice-or-type-number-input"]'
      ) as HTMLInputElement;
      const submit = container.querySelector(
        '[data-testid="voice-or-type-number-submit"]'
      ) as HTMLButtonElement;

      expect(input).not.toBeNull();
      expect(submit).not.toBeNull();

      await act(async () => {
        setInputValue(input, '14');
      });

      await act(async () => {
        submitForm(submit);
      });

      expect(transcribeSpy).not.toHaveBeenCalled();
      expect(onValueConfirmed).toHaveBeenCalledWith(14);
      // No confirmation modal rendered for local parsing
      expect(document.querySelector('[data-testid="voice-or-type-confirm-modal"]')).toBeNull();
    });

    it('parses Devanagari numerals locally (e.g. १२ -> 12)', async () => {
      const onValueConfirmed = vi.fn();

      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={numberField}
            speakingLanguage="hi"
            onValueConfirmed={onValueConfirmed}
          />
        );
      });

      const input = container.querySelector(
        '[data-testid="voice-or-type-number-input"]'
      ) as HTMLInputElement;
      const submit = container.querySelector(
        '[data-testid="voice-or-type-number-submit"]'
      ) as HTMLButtonElement;

      await act(async () => {
        setInputValue(input, '१२');
      });

      await act(async () => {
        submitForm(submit);
      });

      expect(onValueConfirmed).toHaveBeenCalledWith(12);
    });

    it('shows an error message when input is not a valid number', async () => {
      const onValueConfirmed = vi.fn();

      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={numberField}
            speakingLanguage="hi"
            onValueConfirmed={onValueConfirmed}
          />
        );
      });

      const input = container.querySelector(
        '[data-testid="voice-or-type-number-input"]'
      ) as HTMLInputElement;
      const submit = container.querySelector(
        '[data-testid="voice-or-type-number-submit"]'
      ) as HTMLButtonElement;

      await act(async () => {
        setInputValue(input, 'not-a-number');
      });

      await act(async () => {
        submitForm(submit);
      });

      expect(onValueConfirmed).not.toHaveBeenCalled();
      expect(container.textContent).toContain('कृपया सही संख्या लिखें');
    });
  });

  describe('Dimensions field typing path', () => {
    const dimField: VoiceFieldSpec = {
      key: 'dimensions',
      type: 'dimensions',
      question_en: 'What are the dimensions?',
      dimension_keys: ['length', 'width', 'height'],
    };

    it('renders boxes for shape required keys, parses locally, handles unit chips and approx toggle', async () => {
      const onValueConfirmed = vi.fn();

      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={dimField}
            shapeProfile="box"
            speakingLanguage="hi"
            onValueConfirmed={onValueConfirmed}
          />
        );
      });

      const lenInput = container.querySelector(
        '[data-testid="dimension-input-length"]'
      ) as HTMLInputElement;
      const widInput = container.querySelector(
        '[data-testid="dimension-input-width"]'
      ) as HTMLInputElement;
      const hgtInput = container.querySelector(
        '[data-testid="dimension-input-height"]'
      ) as HTMLInputElement;

      expect(lenInput).not.toBeNull();
      expect(widInput).not.toBeNull();
      expect(hgtInput).not.toBeNull();
      expect(container.querySelector('[data-testid="dimension-input-diameter"]')).toBeNull();

      // Enter dimensions (using Devanagari numerals for length)
      await act(async () => {
        setInputValue(lenInput, '१०');
        setInputValue(widInput, '15');
        setInputValue(hgtInput, '5.5');
      });

      // Select unit 'in'
      const inChip = container.querySelector(
        '[data-testid="dimension-unit-in"]'
      ) as HTMLButtonElement;
      await act(async () => {
        inChip.click();
      });

      // Toggle approx
      const approxToggle = container.querySelector(
        '[data-testid="dimension-approximate-toggle"]'
      ) as HTMLInputElement;
      await act(async () => {
        approxToggle.click();
      });

      // Submit
      const submit = container.querySelector(
        '[data-testid="dimension-submit-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        submitForm(submit);
      });

      expect(onValueConfirmed).toHaveBeenCalledWith({
        length: 10,
        width: 15,
        height: 5.5,
        diameter: null,
        thickness: null,
        unit: 'in',
        approximate: true,
      });
      expect(document.querySelector('[data-testid="voice-or-type-confirm-modal"]')).toBeNull();
    });

    it('renders only round shape keys (height, diameter) when shapeProfile is round', async () => {
      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={dimField}
            shapeProfile="round"
            speakingLanguage="hi"
            onValueConfirmed={vi.fn()}
          />
        );
      });

      expect(container.querySelector('[data-testid="dimension-input-height"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="dimension-input-diameter"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="dimension-input-length"]')).toBeNull();
      expect(container.querySelector('[data-testid="dimension-input-width"]')).toBeNull();
    });
  });

  describe('Choice field typing path', () => {
    const choiceField: VoiceFieldSpec = {
      key: 'technique',
      type: 'choice',
      question_en: 'What technique did you use?',
      choices: [{ id: 'hand_loom', label_en: 'Hand Loom' }],
    };

    it('does not render typing input for choice fields (typing not needed)', async () => {
      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={choiceField}
            speakingLanguage="hi"
            onValueConfirmed={vi.fn()}
          />
        );
      });

      expect(container.querySelector('[data-testid="voice-or-type-number-input"]')).toBeNull();
      expect(container.querySelector('[data-testid="voice-or-type-text-input"]')).toBeNull();
      expect(container.querySelector('[data-testid="dimension-submit-btn"]')).toBeNull();
      // Primary mic is rendered
      expect(container.querySelector('[data-testid="voice-input-mic-button"]')).not.toBeNull();
    });
  });

  describe('Text and Long_Text field typing path', () => {
    const textField: VoiceFieldSpec = {
      key: 'story',
      type: 'text',
      question_en: 'Tell us the story of this piece',
      question_hi: 'इस कृति की कहानी बताएं',
    };

    it('sends typed text to transcribeTextForField and shows confirm modal for translation', async () => {
      const onValueConfirmed = vi.fn();

      // Explicitly mock invoke at boundary
      vi.spyOn(voiceService, 'transcribeTextForField').mockResolvedValueOnce({
        status: 'ok',
        transcript_original: 'यह मिट्टी का मटका मेरे दादाजी की तकनीक से बना है',
        value: {
          original: 'यह मिट्टी का मटका मेरे दादाजी की तकनीक से बना है',
          en: 'This clay pot is made using my grandfather technique',
        },
        value_display_en: 'This clay pot is made using my grandfather technique',
        value_display_hi: 'यह मिट्टी का मटका मेरे दादाजी की तकनीक से बना है',
        value_display_spoken: 'यह मिट्टी का मटका मेरे दादाजी की तकनीक से बना है',
        confidence: 0.95,
      });

      await act(async () => {
        root.render(
          <VoiceOrTypeInput
            field={textField}
            speakingLanguage="hi"
            onValueConfirmed={onValueConfirmed}
          />
        );
      });

      const input = container.querySelector(
        '[data-testid="voice-or-type-text-input"]'
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.getAttribute('lang')).toBe('hi');

      await act(async () => {
        setInputValue(input, 'यह मिट्टी का मटका मेरे दादाजी की तकनीक से बना है');
      });

      const submit = container.querySelector(
        '[data-testid="voice-or-type-text-submit"]'
      ) as HTMLButtonElement;

      await act(async () => {
        submitForm(submit);
      });

      // Confirm modal should be rendered in the document
      const confirmModal = document.querySelector('[data-testid="voice-or-type-confirm-modal"]');
      expect(confirmModal).not.toBeNull();
      expect(confirmModal?.textContent).toContain(
        'This clay pot is made using my grandfather technique'
      );

      // Click "Yes, correct"
      const yesBtn = document.querySelector(
        '[data-testid="voice-or-type-confirm-yes"]'
      ) as HTMLButtonElement;

      await act(async () => {
        yesBtn.click();
      });

      expect(onValueConfirmed).toHaveBeenCalledWith({
        original: 'यह मिट्टी का मटका मेरे दादाजी की तकनीक से बना है',
        en: 'This clay pot is made using my grandfather technique',
      });
      expect(document.querySelector('[data-testid="voice-or-type-confirm-modal"]')).toBeNull();
    });
  });
});
