import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/PageHeader';
import {
  SPICETIFY_THEMES,
  getActiveThemeId,
  applyTheme,
  isDynamicAccentSyncEnabled,
  setDynamicAccentSync,
  type SpicetifyTheme,
} from '@/lib/themeManager';
import { Check, ExternalLink, Palette, Music } from 'lucide-react';

export default function ThemesPage() {
  const [activeThemeId, setActiveThemeId] = useState<string>(getActiveThemeId);
  const [dynamicSync, setDynamicSync] = useState<boolean>(isDynamicAccentSyncEnabled);
  const [customHex, setCustomHex] = useState<string>('');

  useEffect(() => {
    const handleUpdate = () => {
      setActiveThemeId(getActiveThemeId());
      setDynamicSync(isDynamicAccentSyncEnabled());
    };
    window.addEventListener('mellow:theme-changed', handleUpdate);
    return () => window.removeEventListener('mellow:theme-changed', handleUpdate);
  }, []);

  const handleSelectTheme = (theme: SpicetifyTheme) => {
    applyTheme(theme.id);
    setActiveThemeId(theme.id);
  };

  const handleToggleDynamic = () => {
    const next = !dynamicSync;
    setDynamicSync(next);
    setDynamicAccentSync(next);
  };

  const handleApplyCustomHex = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customHex.trim()) return;
    const hex = customHex.startsWith('#') ? customHex.trim() : `#${customHex.trim()}`;
    document.documentElement.style.setProperty('--theme-accent', hex);
    document.documentElement.style.setProperty('--keyColor', hex);
    document.documentElement.style.setProperty('--theme-accent-glow', `${hex}66`);
  };

  return (
    <div className="px-5 sm:px-8 max-w-7xl mx-auto pb-16">
      <PageHeader title="Themes" />

      {/* Header Info Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white/[0.04] to-white/[0.01] border border-white/[0.08] p-6 mb-8 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <p className="type-caption-2 font-semibold uppercase tracking-[0.16em] text-tertiary">Appearance · Community themes</p>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Customize Your Atmosphere
            </h2>
            <p className="text-sm text-secondary leading-relaxed">
              Choose from legendary community palettes inspired by{' '}
              <a
                href="https://github.com/spicetify/spicetify-themes"
                target="_blank"
                rel="noreferrer"
                className="text-(--theme-accent) hover:underline inline-flex items-center gap-1 font-medium"
              >
                spicetify-themes
                <ExternalLink size={12} />
              </a>
              , or let Mellow dynamically vibe with the artwork of whatever you’re playing.
            </p>
          </div>

          {/* Dynamic Sync Toggle */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <div className="size-10 rounded-lg bg-(--theme-accent)/20 text-(--theme-accent) grid place-items-center flex-none">
              <Music size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Music Accent Sync</div>
              <div className="text-xs text-secondary">Match accent to playing artwork</div>
            </div>
            <button
              onClick={handleToggleDynamic}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ml-auto ${
                dynamicSync ? 'bg-(--theme-accent)' : 'bg-white/20'
              }`}
              role="switch"
              aria-checked={dynamicSync}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  dynamicSync ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Themes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {SPICETIFY_THEMES.map((theme) => {
          const isActive = activeThemeId === theme.id;
          return (
            <button
              type="button"
              key={theme.id}
              onClick={() => handleSelectTheme(theme)}
              aria-pressed={isActive}
              aria-label={`${isActive ? 'Currently using' : 'Use'} ${theme.name} theme`}
              className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow] duration-200 ${
                isActive ? 'ring-1 ring-white/[0.05]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
              }`}
              style={{
                backgroundColor: theme.colors.cardBg,
                borderColor: isActive ? `${theme.colors.accent}99` : undefined,
                boxShadow: isActive ? `0 12px 34px ${theme.colors.accent}14` : undefined,
              }}
            >
              {/* Header Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-white group-hover:text-(--theme-accent) transition-colors">
                    {theme.name}
                  </h3>
                  {isActive && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-secondary">
                      <Check size={12} strokeWidth={3} />
                      Selected
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/50">{theme.author}</div>
                <p className="text-xs text-secondary line-clamp-2 leading-relaxed">
                  {theme.description}
                </p>
              </div>

              {/* Mini Preview Box */}
              <div
                className="rounded-xl p-3 border border-white/[0.08] shadow-inner space-y-2.5 mb-4"
                style={{ backgroundColor: theme.colors.bg }}
              >
                <div className="flex items-center justify-between text-[11px] text-white/60">
                  <span className="truncate">Sample Track</span>
                  <span style={{ color: theme.colors.accent }}>3:24</span>
                </div>
                {/* Mini Scrubber */}
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full w-2/3"
                    style={{ backgroundColor: theme.colors.accent }}
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex gap-1.5">
                    {theme.colors.swatches.map((color, idx) => (
                      <span
                        key={idx}
                        className="size-3.5 rounded-full border border-white/20 shadow-xs"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-secondary">Aa</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-tertiary">
                <span>{isActive ? 'Current theme' : 'Select to apply'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Accent Color Palette Picker */}
      <div className="mt-12 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-2 text-white font-semibold text-sm">
          <Palette size={16} className="text-(--theme-accent)" />
          <span>Quick Accent Color Override</span>
        </div>
        <p className="text-xs text-secondary mb-4">
          Want a specific custom color? Enter any hex code below (e.g.{' '}
          <code className="text-white">#1ed760</code>, <code className="text-white">#a855f7</code>,{' '}
          <code className="text-white">#38bdf8</code>, <code className="text-white">#f43f5e</code>):
        </p>
        <form onSubmit={handleApplyCustomHex} className="flex gap-3">
          <input
            type="text"
            placeholder="#1ed760"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-xs font-mono focus:outline-none focus:border-(--theme-accent) flex-1"
          />
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
          >
            Apply Accent
          </button>
        </form>
      </div>
    </div>
  );
}
