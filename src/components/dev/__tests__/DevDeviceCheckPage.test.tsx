import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DevDeviceCheckPage } from '../DevDeviceCheckPage';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => 'web'),
  },
  registerPlugin: vi.fn(() => ({
    getDeviceCapabilities: vi.fn().mockResolvedValue({
      bridgeConnected: true,
      platform: 'android',
      architecture: 'arm64-v8a',
      deviceModel: 'Pixel 8 Pro',
      androidVersion: '14',
      runtime: 'NNAPI',
      npuAvailable: true,
      gpuAvailable: true,
    }),
  })),
}));

describe('DevDeviceCheckPage Component', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders device check header and route label', async () => {
    const root = createRoot(container);
    const onBack = vi.fn();

    await act(async () => {
      root.render(<DevDeviceCheckPage onBack={onBack} />);
    });

    expect(container.textContent).toContain('Device Check');
    expect(container.textContent).toContain('/dev/device-check');
    expect(container.textContent).toContain('VITE_ENABLE_DEV_TOOLS Active');
    expect(container.textContent).toContain('Capacitor Native Bridge');
    expect(container.textContent).toContain('Device Hardware Specs');
    expect(container.textContent).toContain('Hardware Sensor Tests');
    expect(container.textContent).toContain('Voice Input Test Suite');

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onBack when back button is clicked', async () => {
    const root = createRoot(container);
    const onBack = vi.fn();

    await act(async () => {
      root.render(<DevDeviceCheckPage onBack={onBack} />);
    });

    const backButton = container.querySelector('button[aria-label="Back to home"]') as HTMLButtonElement;
    expect(backButton).not.toBeNull();

    await act(async () => {
      backButton.click();
    });

    expect(onBack).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('triggers onNavigateToVoiceInput when Open /dev/voice-input button is clicked', async () => {
    const root = createRoot(container);
    const onBack = vi.fn();
    const onNavigateToVoiceInput = vi.fn();

    await act(async () => {
      root.render(
        <DevDeviceCheckPage
          onBack={onBack}
          onNavigateToVoiceInput={onNavigateToVoiceInput}
        />
      );
    });

    const voiceInputButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Open /dev/voice-input')
    );
    expect(voiceInputButton).toBeDefined();

    await act(async () => {
      voiceInputButton?.click();
    });

    expect(onNavigateToVoiceInput).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });
});
