import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DatasetCollector } from '../DatasetCollector';

// Mock Supabase client to prevent actual network calls during unit test
vi.mock('../../../lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'test-id' }, error: null }),
        }),
      }),
      delete: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: 'test-path' }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://test.storage/${path}` } }),
        remove: () => Promise.resolve({ error: null }),
      }),
    },
  },
}));

describe('DatasetCollector Component (Stage 0.3)', () => {
  it('renders the dataset collector screen and empty-state gallery (0 samples)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<DatasetCollector />);
    });

    // Verify main headings and DEV badge
    expect(container.textContent).toContain('AI Dataset Collector');
    expect(container.textContent).toContain('Stage 0.3 · DEV');
    expect(container.textContent).toContain('Dataset Collection Progress');

    // Verify 0 samples starting empty state
    expect(container.textContent).toContain('0 Samples in Gallery');
    expect(container.textContent).toContain('0 / 300');

    // Verify all 6 required craft categories exist
    const requiredCategories = ['Woodwork', 'Pottery', 'Brasscraft', 'Textile', 'Furniture', 'Metal'];
    for (const cat of requiredCategories) {
      expect(container.textContent).toContain(cat);
      expect(container.textContent).toContain(`${cat} (0)`);
    }

    // Verify lighting options exist
    expect(container.textContent).toContain('Good Lighting');
    expect(container.textContent).toContain('Poor Lighting');
    expect(container.textContent).toContain('Mixed Lighting');

    // Verify background options exist
    expect(container.textContent).toContain('Clean Background');
    expect(container.textContent).toContain('Cluttered Background');

    // Verify file input
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute('accept')).toBe('image/*');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
