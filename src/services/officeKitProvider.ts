import type { CraftHandoffPackage } from '../types/officeKit';
import { Capacitor } from '@capacitor/core';
import { v4 as uuidv4 } from 'uuid'; // Fallback logic for unique IDs if needed

type HandoffCallback = (pkg: CraftHandoffPackage) => void;

export interface OfficeKitProvider {
  isAvailable(): boolean;
  createHandoff(pkg: Omit<CraftHandoffPackage, 'version' | 'handoffId' | 'createdAt'>): CraftHandoffPackage;
  sendHandoff(pkg: CraftHandoffPackage): Promise<boolean>;
  onHandoffReceived(callback: HandoffCallback): () => void;
}

/**
 * MOCK PROVIDER for Browser / Laptop testing
 * Uses localStorage to simulate wireless Office Kit transfer between phone browser tab and laptop browser tab.
 */
export class MockOfficeKitProvider implements OfficeKitProvider {
  isAvailable(): boolean {
    return true; // We pretend it's available for Development Mode
  }

  createHandoff(pkg: Omit<CraftHandoffPackage, 'version' | 'handoffId' | 'createdAt'>): CraftHandoffPackage {
    return {
      ...pkg,
      version: "1.0",
      handoffId: `KAR-HO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      createdAt: new Date().toISOString()
    };
  }

  async sendHandoff(pkg: CraftHandoffPackage): Promise<boolean> {
    try {
      localStorage.setItem('kaaragir_office_kit_handoff', JSON.stringify(pkg));
      return true;
    } catch (e) {
      console.error("Failed to send mock handoff", e);
      return false;
    }
  }

  onHandoffReceived(callback: HandoffCallback): () => void {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'kaaragir_office_kit_handoff' && e.newValue) {
        try {
          const pkg: CraftHandoffPackage = JSON.parse(e.newValue);
          callback(pkg);
          // Optional: clear it after consumption to simulate one-time handoff
          localStorage.removeItem('kaaragir_office_kit_handoff');
        } catch (error) {
          console.error("Failed to parse incoming mock handoff", error);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }
}

/**
 * LOCAL PROVIDER for Actual Android/iQOO hardware
 * Bridges to the native capabilities (Pending implementation in KaaragirAINative).
 */
export class LocalOfficeKitProvider implements OfficeKitProvider {
  isAvailable(): boolean {
    // Usually checked natively, but we'll return false here since we lack real hardware verification currently.
    return false;
  }

  createHandoff(pkg: Omit<CraftHandoffPackage, 'version' | 'handoffId' | 'createdAt'>): CraftHandoffPackage {
    return {
      ...pkg,
      version: "1.0",
      handoffId: `KAR-HO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      createdAt: new Date().toISOString()
    };
  }

  async sendHandoff(pkg: CraftHandoffPackage): Promise<boolean> {
    console.warn("LocalOfficeKitProvider.sendHandoff requires physical hardware integration.");
    return false;
  }

  onHandoffReceived(callback: HandoffCallback): () => void {
    console.warn("LocalOfficeKitProvider.onHandoffReceived requires physical hardware integration.");
    return () => {};
  }
}

let currentOfficeKitProvider: OfficeKitProvider = Capacitor.isNativePlatform()
  ? new LocalOfficeKitProvider()
  : new MockOfficeKitProvider();

export function getOfficeKitProvider(): OfficeKitProvider {
  return currentOfficeKitProvider;
}

export function setOfficeKitProvider(provider: OfficeKitProvider) {
  currentOfficeKitProvider = provider;
}
