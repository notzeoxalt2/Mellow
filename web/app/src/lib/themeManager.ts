export interface SpicetifyTheme {
  id: string;
  name: string;
  author: string;
  description: string;
  colors: {
    bg: string;
    cardBg: string;
    sidebarBg: string;
    playerBg: string;
    accent: string;
    accentGlow: string;
    textPrimary: string;
    textSecondary: string;
    swatches: string[];
  };
  isDynamic?: boolean;
}

export const SPICETIFY_THEMES: SpicetifyTheme[] = [
  {
    id: 'dynamic',
    name: 'Mellow Dynamic',
    author: 'Mellow Core',
    description: 'Adapts color accents and ambient atmospheric glow dynamically with currently playing music.',
    isDynamic: true,
    colors: {
      bg: '#0c0d12',
      cardBg: '#15161f',
      sidebarBg: '#0c0d12',
      playerBg: '#12131a',
      // Mellow's own wave mark is violet. Artwork sampling takes over while
      // something is playing, so the idle chrome should stay on-brand instead
      // of flashing Spotify green when there is no current cover to sample.
      accent: '#9b55f5',
      accentGlow: 'rgba(155, 85, 245, 0.34)',
      textPrimary: '#ffffff',
      textSecondary: '#a1a1aa',
      swatches: ['#0c0d12', '#9b55f5', '#c47dff', '#6b75ff'],
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    author: 'Catppuccin Community',
    description: 'The beloved soothing pastel theme with dark base and soft lavender-mauve accents.',
    colors: {
      bg: '#1e1e2e',
      cardBg: '#181825',
      sidebarBg: '#11111b',
      playerBg: '#181825',
      accent: '#cba6f7',
      accentGlow: 'rgba(203, 166, 247, 0.38)',
      textPrimary: '#cdd6f4',
      textSecondary: '#a6adc8',
      swatches: ['#1e1e2e', '#11111b', '#cba6f7', '#f5c2e7', '#94e2d5'],
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    author: 'morpheusthewhite',
    description: 'Celebrates the glowing neon lights of downtown Tokyo under midnight rain.',
    colors: {
      bg: '#1a1b26',
      cardBg: '#24283b',
      sidebarBg: '#16161e',
      playerBg: '#1f2335',
      accent: '#7aa2f7',
      accentGlow: 'rgba(122, 162, 247, 0.40)',
      textPrimary: '#c0caf5',
      textSecondary: '#9aa5ce',
      swatches: ['#1a1b26', '#24283b', '#7aa2f7', '#bb9af7', '#7dcfff'],
    },
  },
  {
    id: 'bloom',
    name: 'Bloom',
    author: 'encave',
    description: 'Vivid neon glow with deep glassmorphism and modern punchy accents.',
    colors: {
      bg: '#0b0d14',
      cardBg: '#131624',
      sidebarBg: '#07080d',
      playerBg: '#101320',
      accent: '#9d4edd',
      accentGlow: 'rgba(157, 78, 221, 0.42)',
      textPrimary: '#ffffff',
      textSecondary: '#a5b4fc',
      swatches: ['#0b0d14', '#131624', '#9d4edd', '#00f5d4', '#ff007f'],
    },
  },
  {
    id: 'sleek',
    name: 'Sleek (Spotify Green)',
    author: 'Spicetify Team',
    description: 'True pitch black OLED background with iconic Spotify emerald green accents.',
    colors: {
      bg: '#000000',
      cardBg: '#121212',
      sidebarBg: '#000000',
      playerBg: '#121212',
      accent: '#1ed760',
      accentGlow: 'rgba(30, 215, 96, 0.40)',
      textPrimary: '#ffffff',
      textSecondary: '#b3b3b3',
      swatches: ['#000000', '#121212', '#1ed760', '#ffffff'],
    },
  },
  {
    id: 'nord',
    name: 'Nord Frost',
    author: 'Arctic Ice Studio',
    description: 'An arctic, north-bluish clean and elegant dark palette for deep focus.',
    colors: {
      bg: '#2e3440',
      cardBg: '#3b4252',
      sidebarBg: '#242933',
      playerBg: '#3b4252',
      accent: '#88c0d0',
      accentGlow: 'rgba(136, 192, 208, 0.38)',
      textPrimary: '#eceff4',
      textSecondary: '#d8dee9',
      swatches: ['#2e3440', '#3b4252', '#88c0d0', '#81a1c1', '#a3be8c'],
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    author: 'Zeno Rocha',
    description: 'The famous vampire dark theme with vibrant neon pink and purple highlights.',
    colors: {
      bg: '#282a36',
      cardBg: '#383a59',
      sidebarBg: '#21222c',
      playerBg: '#343746',
      accent: '#ff79c6',
      accentGlow: 'rgba(255, 121, 198, 0.40)',
      textPrimary: '#f8f8f2',
      textSecondary: '#6272a4',
      swatches: ['#282a36', '#44475a', '#ff79c6', '#bd93f9', '#50fa7b'],
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    author: 'morhetz',
    description: 'Warm, earthy retro groove palette that protects eyes during night listening.',
    colors: {
      bg: '#282828',
      cardBg: '#3c3836',
      sidebarBg: '#1d2021',
      playerBg: '#32302f',
      accent: '#fe8019',
      accentGlow: 'rgba(254, 128, 25, 0.40)',
      textPrimary: '#ebdbb2',
      textSecondary: '#a89984',
      swatches: ['#282828', '#3c3836', '#fe8019', '#fabd2f', '#8ec07c'],
    },
  },
  {
    id: 'comfy',
    name: 'Comfy',
    author: 'Comfy Community',
    description: 'Cozy, warm charcoal layout with pastel coral highlights and soft aesthetics.',
    colors: {
      bg: '#181820',
      cardBg: '#22222e',
      sidebarBg: '#13131a',
      playerBg: '#1e1e28',
      accent: '#ff7597',
      accentGlow: 'rgba(255, 117, 151, 0.38)',
      textPrimary: '#ffffff',
      textSecondary: '#b4befe',
      swatches: ['#181820', '#22222e', '#ff7597', '#b4befe', '#f5e0dc'],
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    author: 'Rosé Pine Community',
    description: 'All natural pine, faux fur, and gentle soho vibes.',
    colors: {
      bg: '#191724',
      cardBg: '#26233a',
      sidebarBg: '#1f1d2e',
      playerBg: '#211f35',
      accent: '#ebbcba',
      accentGlow: 'rgba(235, 188, 186, 0.38)',
      textPrimary: '#e0def4',
      textSecondary: '#908caa',
      swatches: ['#191724', '#26233a', '#ebbcba', '#31748f', '#f6c177'],
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    author: 'Night City',
    description: 'High-tech void dark with electric neon pink and cyan highlights.',
    colors: {
      bg: '#07070f',
      cardBg: '#131226',
      sidebarBg: '#040409',
      playerBg: '#100f22',
      accent: '#ff007f',
      accentGlow: 'rgba(255, 0, 127, 0.42)',
      textPrimary: '#ffffff',
      textSecondary: '#00f0ff',
      swatches: ['#07070f', '#131226', '#ff007f', '#00f0ff', '#ffe600'],
    },
  },
  {
    id: 'burnt-sienna',
    name: 'Burnt Sienna',
    author: 'Spicetify Community',
    description: 'Warm espresso and terracotta tones for rich acoustic vibes.',
    colors: {
      bg: '#1a1412',
      cardBg: '#281f1b',
      sidebarBg: '#120e0d',
      playerBg: '#221a17',
      accent: '#d96b43',
      accentGlow: 'rgba(217, 107, 67, 0.40)',
      textPrimary: '#f5e8e2',
      textSecondary: '#ab958d',
      swatches: ['#1a1412', '#281f1b', '#d96b43', '#f0a35b'],
    },
  },
];

const STORAGE_KEY = 'mellow:active-theme';
const DYNAMIC_SYNC_KEY = 'mellow:dynamic-accent-sync';

function rgbComponents(color: string): string | null {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
    return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16)).join(', ');
  }
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  return rgb ? `${rgb[1]}, ${rgb[2]}, ${rgb[3]}` : null;
}

export function getThemeById(themeId: string): SpicetifyTheme {
  return SPICETIFY_THEMES.find((theme) => theme.id === themeId) ?? SPICETIFY_THEMES[0]!;
}

/** Apply the selected theme's accent or the accent extracted from playing artwork. */
export function applyThemeAccent(accent: string, glow: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--theme-accent', accent);
  root.style.setProperty('--theme-accent-glow', glow);
  root.style.setProperty('--keyColor', accent);
  root.style.setProperty('--keyColorBG', accent);
  root.style.setProperty('--selectionColor', accent);
  const rgb = rgbComponents(accent);
  if (rgb) root.style.setProperty('--keyColor-rgb', rgb);
  root.style.setProperty('--keyColor-rollover', `color-mix(in srgb, ${accent} 82%, white)`);
  root.style.setProperty('--keyColor-pressed', `color-mix(in srgb, ${accent} 72%, black)`);
}

export function getActiveThemeId(): string {
  if (typeof window === 'undefined') return 'dynamic';
  return localStorage.getItem(STORAGE_KEY) || 'dynamic';
}

export function isDynamicAccentSyncEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(DYNAMIC_SYNC_KEY);
  // Artwork matching is the default across palettes. The listener can still
  // turn it off explicitly in Settings to keep a fixed theme accent.
  return val === null ? true : val === 'true';
}

export function setDynamicAccentSync(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DYNAMIC_SYNC_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent('mellow:theme-changed'));
}

export function applyTheme(themeId: string): void {
  if (typeof window === 'undefined') return;
  const theme = getThemeById(themeId);
  localStorage.setItem(STORAGE_KEY, theme.id);

  const root = document.documentElement;
  root.style.setProperty('--app-bg', theme.colors.bg);
  root.style.setProperty('--card-bg', theme.colors.cardBg);
  root.style.setProperty('--sidebar-bg', theme.colors.sidebarBg);
  root.style.setProperty('--player-bg', theme.colors.playerBg);
  root.style.setProperty('--systemPrimary', theme.colors.textPrimary);
  root.style.setProperty('--systemSecondary', theme.colors.textSecondary);
  applyThemeAccent(theme.colors.accent, theme.colors.accentGlow);

  window.dispatchEvent(new CustomEvent('mellow:theme-changed', { detail: { themeId: theme.id } }));
}

export function initTheme(): void {
  if (typeof window === 'undefined') return;
  applyTheme(getActiveThemeId());
}
