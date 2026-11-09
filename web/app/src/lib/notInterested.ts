const STORAGE_KEY = 'mellow:not-interested:v1';
const EVENT_NAME = 'mellow:not-interested-updated';

function readIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function getNotInterestedIds(): Set<string> {
  return new Set(readIds());
}

/** Hide this recommendation from Mellow's home feed on this device. */
export function markNotInterested(id: string): void {
  if (!id) return;
  const ids = getNotInterestedIds();
  if (ids.has(id)) return;
  ids.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Keep the current view responsive if storage is unavailable.
  }
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeNotInterested(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener('storage', listener);
  };
}
