// src/__tests__/AppModeCameraVisibility.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';

/**
 * MOCK BOUNDARY STATEMENT:
 * KaragirStoreContext is mocked to supply a pre-authenticated storeData so
 * the header's buyer/artisan mode toggle can flip to 'artisan' directly,
 * without exercising the real Supabase-backed login/registration flow
 * (no live Supabase session exists in this test environment).
 */
vi.mock('../context/KaragirStoreContext', async () => {
  const actual = await vi.importActual<typeof import('../context/KaragirStoreContext')>(
    '../context/KaragirStoreContext'
  );
  return {
    ...actual,
    KaragirStoreProvider: ({ children }: { children: React.ReactNode }) => children,
    useKaragirStore: () => ({
      isAuthModalOpen: false,
      setIsAuthModalOpen: vi.fn(),
      isWizardOpen: false,
      setIsWizardOpen: vi.fn(),
      storeData: { id: 'artisan-test-1', categories: [], works: [] },
      loginArtisan: vi.fn(),
      registerArtisan: vi.fn(),
      saveStoreProfile: vi.fn(),
      addWorkItem: vi.fn(),
      logout: vi.fn(),
      allStores: {},
    }),
  };
});

describe('Stage 5.2: Search-bar camera icon is buyer-mode only (App level)', () => {
  it('shows the camera icon in buyer mode and hides it after switching to artisan mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });

    // Default mode is 'buyer' -> MobileHome (and its camera icon) is rendered.
    expect(container.querySelector('[data-testid="search-bar-camera-button"]')).not.toBeNull();

    const modeToggle = container.querySelector(
      'header button[title="Switch to Artisan Portal"]'
    ) as HTMLButtonElement;
    expect(modeToggle).not.toBeNull();

    await act(async () => {
      modeToggle.click();
    });

    // MobileHome is only rendered when mode === 'buyer' (see src/App.tsx),
    // so the camera icon must be gone once in artisan mode.
    expect(container.querySelector('[data-testid="search-bar-camera-button"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
