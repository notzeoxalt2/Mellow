import { detectExtension, type DetectedExtension } from '@bitchord/shared/bridge';
import { useQuery } from '@tanstack/react-query';
import { config } from '@/config';
import { queryClient } from '@/lib/queryClient';
import { getDesktopBridge } from './bridge';

export type ExtensionStatus =
  | { state: 'checking' }
  | { state: 'missing' }
  | { state: 'present'; extension: DetectedExtension };

export const extensionQueryKey = ['extension', 'detect'] as const;

export const DESKTOP_EXTENSION_INFO = {
  version: '1.0.0-mellow',
  protocol: 1,
  browser: 'chromium' as const,
  capabilities: ['yt', 'yt.auth', 'yt.stats', 'addon', 'lyrics', 'spotify'] as const,
};

/** Re-pings after a miss: an MV3 service worker waking from sleep can miss the first one. */
const RECHECKS = 4;
const RECHECK_MS = 1500;
/** After those, a still-missing extension is polled slowly, so one that wakes late is picked up. */
const SLOW_RECHECK_MS = 5000;

async function detect(): Promise<DetectedExtension | null> {
  const desktop = getDesktopBridge();
  if (desktop) {
    return {
      bridge: desktop,
      info: DESKTOP_EXTENSION_INFO as any,
    };
  }
  const known = queryClient.getQueryData<DetectedExtension | null>(extensionQueryKey) ?? null;
  const found = await detectExtension({ chromiumExtensionId: config.chromiumExtensionId });
  if (found || !known) return found;
  return (await detectExtension({ chromiumExtensionId: config.chromiumExtensionId, timeoutMs: 4000 })) ?? known;
}

export function getActiveExtension(): DetectedExtension | null {
  const desktop = getDesktopBridge();
  if (desktop) {
    return {
      bridge: desktop,
      info: DESKTOP_EXTENSION_INFO as any,
    };
  }
  return queryClient.getQueryData<DetectedExtension | null>(extensionQueryKey) ?? null;
}

export function useExtension(): ExtensionStatus {
  const desktop = getDesktopBridge();
  if (desktop) {
    const ext: DetectedExtension = {
      bridge: desktop,
      info: DESKTOP_EXTENSION_INFO as any,
    };
    if (!queryClient.getQueryData(extensionQueryKey)) {
      queryClient.setQueryData(extensionQueryKey, ext);
    }
    return {
      state: 'present',
      extension: ext,
    };
  }

  const query = useQuery({
    queryKey: extensionQueryKey,
    queryFn: detect,
    staleTime: 30_000,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      q.state.data === null ? (q.state.dataUpdateCount <= RECHECKS ? RECHECK_MS : SLOW_RECHECK_MS) : false,
  });
  if (query.isPending) return { state: 'checking' };
  if (!query.data) return { state: 'missing' };
  return { state: 'present', extension: query.data };
}
