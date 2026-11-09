import type { Bridge, DetectedExtension } from '@bitchord/shared/bridge';
import { queryClient } from '@/lib/queryClient';
import { extensionQueryKey } from './useExtension';

let desktopBridgeInstance: Bridge | null = null;

export function getDesktopBridge(): Bridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as any).electronAPI;
  if (!api?.isDesktop || !api?.bridgeCall) return null;

  if (!desktopBridgeInstance) {
    desktopBridgeInstance = {
      transport: 'relay',
      async call(method, params) {
        const resp = await api.bridgeCall(method, params);
        if (resp && resp.ok) return resp.result;
        throw new Error(resp?.error?.message ?? `Desktop bridge call ${method} failed`);
      },
      subscribe(listener) {
        if (api.onBridgeEvent) {
          return api.onBridgeEvent(listener);
        }
        return () => {};
      },
    };
  }
  return desktopBridgeInstance;
}

/** The detected extension's bridge, for code outside React; null when it isn't installed. */
export function getBridge(): Bridge | null {
  const desktop = getDesktopBridge();
  if (desktop) return desktop;
  return queryClient.getQueryData<DetectedExtension | null>(extensionQueryKey)?.bridge ?? null;
}
