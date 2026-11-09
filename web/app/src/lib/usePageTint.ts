import { useEffect } from 'react';
import type { ArtworkColor } from './artworkColor';

/**
 * Tints the top ambient hero region of detail pages with the artwork's color.
 * The app permanently maintains dark mode readability.
 */
export function usePageTint(color: { background: string; dark?: boolean; accent?: string } | null) {
  useEffect(() => {
    const page = document.getElementById('scrollable-page');
    const root = document.documentElement;
    if (!color) return;

    root.style.setProperty('--page-tint', color.background);
    if (color.accent) {
      root.style.setProperty('--page-accent', color.accent);
    }
    root.dataset.tint = 'dark';
    if (page) {
      page.style.setProperty('--page-tint', color.background);
      page.dataset.tint = 'dark';
    }
    return () => {
      root.style.removeProperty('--page-tint');
      root.style.removeProperty('--page-accent');
      delete root.dataset.tint;
      if (page) {
        page.style.removeProperty('--page-tint');
        delete page.dataset.tint;
      }
    };
  }, [color]);
}
