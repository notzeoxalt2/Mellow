import { useEffect, useState } from 'react';
import { artworkAtPixels } from './artwork';

export interface ArtworkColor {
  /** The ambient background tone for subtle top header glow. */
  background: string;
  /** The vibrant saturated accent color for playing track, equalizer, and controls. */
  accent?: string;
  /** Glowing shadow color for accent elements. */
  accentGlow?: string;
  /** Whether the background is dark (always true for Mellow). */
  dark: boolean;
}

const cache = new Map<string, ArtworkColor>();
const CACHE_LIMIT = 128;

function remember(url: string, value: ArtworkColor): void {
  cache.delete(url);
  cache.set(url, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

async function loadImageData(url: string): Promise<ImageData> {
  const pixelSrc = artworkAtPixels(url, 60);
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.decoding = 'async';
    image.src = pixelSrc;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 12;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, 12, 12);
    return context.getImageData(0, 0, 12, 12);
  } catch {
    // Direct blob fallback in case image tag has CORS restriction
    const res = await fetch(pixelSrc, { mode: 'cors' });
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 12;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0, 12, 12);
    return context.getImageData(0, 0, 12, 12);
  }
}

/**
 * Extracts both a deep atmospheric background tint and a punchy vibrant
 * accent color from the album artwork so Mellow dynamically vibes with the music.
 */
async function measure(url: string): Promise<ArtworkColor> {
  const { data } = await loadImageData(url);
  // One colorful pixel (often a tiny logo) should not recolor the whole app.
  // Vote by hue across the sleeve, giving mid-lightness, saturated pixels more weight.
  const bins = Array.from({ length: 24 }, () => ({ weight: 0, r: 0, g: 0, b: 0, count: 0 }));
  let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 128) continue;
    rTotal += r; gTotal += g; bTotal += b; count++;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.18 || l < 0.12 || l > 0.88) continue;
    const bin = bins[Math.min(23, Math.floor(h * 24))]!;
    const weight = s * (1 - Math.abs(l - 0.5));
    bin.weight += weight;
    bin.r += r * weight; bin.g += g * weight; bin.b += b * weight; bin.count++;
  }
  const strongest = bins.reduce((best, bin) => bin.weight > best.weight ? bin : best, bins[0]!);
  const averageLuminance = (0.2126 * rTotal + 0.7152 * gTotal + 0.0722 * bTotal) / Math.max(1, count) / 255;
  // A bright, mostly white sleeve should keep the chrome light and neutral.
  // Small saturated details (a logo, face, or colored type) can otherwise
  // dominate the hue vote and turn an almost-white cover green or red.
  const isBrightSleeve = averageLuminance >= 0.72;
  // Require the same hue to occupy a meaningful part of the sleeve. A tiny
  // logo or corner accent on a white cover should not tint the whole chrome.
  const hasDominantColor = !isBrightSleeve && strongest.weight > 2 && strongest.count >= Math.max(8, Math.ceil(count * 0.07));
  const hue = hasDominantColor
    ? rgbToHsl(strongest.r / strongest.weight, strongest.g / strongest.weight, strongest.b / strongest.weight)[0]
    : rgbToHsl(rTotal / Math.max(1, count), gTotal / Math.max(1, count), bTotal / Math.max(1, count))[0];
  const neutralLightness = Math.min(0.16, Math.max(0.075, 0.075 + averageLuminance * 0.085));
  const [bgR, bgG, bgB] = hasDominantColor
    ? hslToRgb(hue, 0.3, 0.085)
    : hslToRgb(0, 0, neutralLightness);
  const result: ArtworkColor = { background: `rgb(${bgR}, ${bgG}, ${bgB})`, dark: true };
  // Leave near-monochrome sleeves without a saturated accent; the shell uses
  // a quiet neutral while still following their dark/light background tone.
  if (hasDominantColor) {
    const [h, s, l] = rgbToHsl(strongest.r / strongest.weight, strongest.g / strongest.weight, strongest.b / strongest.weight);
    const [ar, ag, ab] = hslToRgb(h, Math.min(0.72, Math.max(0.42, s)), Math.min(0.61, Math.max(0.47, l)));
    result.accent = `rgb(${ar}, ${ag}, ${ab})`;
    result.accentGlow = `rgba(${ar}, ${ag}, ${ab}, 0.24)`;
  }
  return result;
}

export function useArtworkColor(url: string | null | undefined): ArtworkColor | null {
  const [measured, setMeasured] = useState<{ url: string; color: ArtworkColor } | null>(() => {
    const cached = url ? cache.get(url) : undefined;
    return url && cached ? { url, color: cached } : null;
  });
  useEffect(() => {
    if (!url) { setMeasured(null); return; }
    const known = cache.get(url);
    if (known) { setMeasured({ url, color: known }); return; }
    let live = true;
    measure(url)
      .then((measured) => {
        remember(url, measured);
        if (live) setMeasured({ url, color: measured });
      })
      .catch(() => {
        // The artwork backdrop is rendered from the actual image; keep the
        // theme's chosen accent if extraction is blocked by CORS.
        if (live) setMeasured({ url, color: { background: 'rgb(18, 18, 22)', dark: true } });
      });
    return () => {
      live = false;
    };
  }, [url]);
  return url && measured?.url === url ? measured.color : (url ? cache.get(url) ?? null : null);
}
