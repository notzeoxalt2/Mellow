import { ChevronRight, Sparkles, Users } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { MdOutlineExtension } from 'react-icons/md';
import { SiApplemusic, SiDiscord, SiSpotify, SiYoutubemusic } from 'react-icons/si';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { Select } from '@/components/Select';
import { useExtension } from '@/extension/useExtension';
import { useYtAuth } from '@/extension/useYtAuth';
import {
  readAppearancePreferences,
  updateAppearancePreferences,
  type AppearancePreferences,
} from '@/lib/appearance';
import { useParty } from '@/party/useParty';
import { AUTOMIX_BARS } from '@/playback/automix/choices';
import { useHistorySettings } from '@/playback/historyReporting';
import { CROSSFADE_CHOICES, usePlayer } from '@/state/player';
import {
  AppleMusicIntegration,
  AppleMusicToggles,
  CanvasToggle,
  LyricSourcesAccess,
  SpotifyIntegration,
  Toggle,
} from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const LyricsSettings = lazy(() => import('@/shell/LyricsSettings').then((m) => ({ default: m.LyricsSettings })));

/** An integration's coloured glyph, matching Apple / extension styling. */
function Glyph({ Icon, color, ink }: { Icon: ComponentType<{ size?: number }>; color: string; ink?: string }) {
  return (
    <span className={settingsUi.integrationIcon} style={{ backgroundColor: color, ...(ink && { color: ink }) }}>
      <Icon size={15} />
    </span>
  );
}

/** A row that opens a page of its own. */
function LinkRow({ to, icon, title, value }: { to: string; icon?: ReactNode; title: string; value?: string | null }) {
  return (
    <PrefetchLink to={to} className={`${icon ? settingsUi.integration : settingsUi.integrationPlain} ${settingsUi.linkRow}`}>
      {icon}
      <span className={settingsUi.integrationName}>{title}</span>
      <span className={settingsUi.value}>
        {value}
        <ChevronRight size={16} />
      </span>
    </PrefetchLink>
  );
}

function youtubeText(auth: ReturnType<typeof useYtAuth>): string {
  if (auth.state === 'checking') return 'Checking…';
  if (auth.state === 'unavailable') return 'Needs the extension';
  const { browserSignedIn, connected, active } = auth.auth;
  if (!browserSignedIn) return 'Not signed in';
  if (!connected) return 'Disconnected';
  return active ? active.name : 'Signed in';
}

export default function SettingsPage() {
  const extension = useExtension();
  const yt = useYtAuth();
  const party = useParty();
  const autoplay = usePlayer((s) => s.autoplay);
  const crossfadeSec = usePlayer((s) => s.crossfadeSec);
  const automix = usePlayer((s) => s.automix);
  const automixBars = usePlayer((s) => s.automixBars);
  const showNerdStats = usePlayer((s) => s.showNerdStats);
  const shareHistory = useHistorySettings((s) => s.share);
  const setShareHistory = useHistorySettings((s) => s.setShare);
  const { setAutoplay, setCrossfade, setAutomix, setAutomixBars, setShowNerdStats } = usePlayer.getState();

  const [appearance, setAppearance] = useState<AppearancePreferences>(readAppearancePreferences);
  const [lyrics, setLyrics] = useState(false);
  const present = extension.state === 'present';
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  useEffect(() => {
    const onAppChange = () => setAppearance(readAppearancePreferences());
    window.addEventListener('mellow:appearance-changed', onAppChange);
    return () => window.removeEventListener('mellow:appearance-changed', onAppChange);
  }, []);

  const update = (patch: Partial<AppearancePreferences>) => {
    const updated = updateAppearancePreferences(patch);
    setAppearance(updated);
  };

  return (
    <div className={settingsUi.centered}>
      <PageHeader title="Settings" />
      <div className={settingsUi.body}>
        {/* ---- 1. Account & Integrations ---- */}
        <h2 className={settingsUi.sectionHeader}>Account & Integrations</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiYoutubemusic} color="#ffffff" ink="#ff0033" />
            <span className={settingsUi.integrationName}>YouTube Music</span>
            <span className={settingsUi.value}>{youtubeText(yt)}</span>
          </div>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiSpotify} color="#1ed760" />
            <span className={settingsUi.integrationName}>Spotify</span>
            {present || isDesktop ? <SpotifyIntegration /> : <span className={settingsUi.value}>Needs the extension</span>}
          </div>
          {isDesktop && (
            <Toggle
              label="Apple Music Discord Presence"
              detail="Shows authentic 'Listening to Apple Music' with song, artist, album and progress on your Discord profile."
              checked={appearance.appleMusicRpc}
              onChange={(on) => update({ appleMusicRpc: on })}
            />
          )}
          <Toggle
            label="Dual-Sync Playlists & Favorites"
            detail="Automatically synchronizes newly favorited songs and created playlists across both YouTube Music and Spotify."
            checked={appearance.dualSync}
            onChange={(on) => update({ dualSync: on })}
          />
          {!isDesktop && (
            <LinkRow
              to="/extension"
              icon={<Glyph Icon={MdOutlineExtension} color="#636366" />}
              title="BitChord Extension"
              value={present ? `v${extension.extension.info.version}` : 'Not installed'}
            />
          )}
        </section>

        {/* ---- 2. Appearance & Ambient Glow ---- */}
        <h2 className={settingsUi.sectionHeader}>Appearance & Ambient Glow</h2>
        <section className={settingsUi.group}>
          <Toggle
            label="Ambient Artwork Mesh (Full Screen)"
            detail="Smooth WebGL Gaussian blur backdrop in the full screen player (matching the web experience)."
            checked={appearance.fullScreenPlayerAmbient}
            onChange={(on) => update({ fullScreenPlayerAmbient: on })}
          />
          <Toggle
            label="Player Bar Glow"
            detail="Subtle dynamic glow under the floating glass player pill."
            checked={appearance.playerBarGlow}
            onChange={(on) => update({ playerBarGlow: on })}
          />
          {appearance.playerBarGlow && (
            <label className={settingsUi.controlRow}>
              <span>Glow Intensity ({appearance.playerBarGlowStrength}%)</span>
              <input
                type="range"
                min="10"
                max="100"
                value={appearance.playerBarGlowStrength}
                onChange={(e) => update({ playerBarGlowStrength: Number(e.target.value) })}
                className="h-1.5 w-36 accent-(--theme-accent) cursor-pointer"
              />
            </label>
          )}
          <Toggle
            label="Music Beat Sync"
            detail="Gently pulses the logo and glow in rhythm with the music."
            checked={appearance.musicBeatSync}
            onChange={(on) => update({ musicBeatSync: on })}
          />
          {isDesktop && (
            <Toggle
              label="Sync Windows Accent Color"
              detail="Matches your Windows system accent color to the currently playing song's artwork."
              checked={appearance.windowsAccentSync}
              onChange={(on) => {
                update({ windowsAccentSync: on });
                window.electronAPI?.setWindowsAccentSync?.(on);
              }}
            />
          )}
          <Toggle
            label="Low Resource Mode"
            detail="Limits background GPU work for maximum battery life and high gaming performance."
            checked={appearance.lowResourceMode}
            onChange={(on) => update({ lowResourceMode: on })}
          />
        </section>

        {/* ---- 3. Apple Music Public Catalog ---- */}
        <h2 className={settingsUi.sectionHeader}>Apple Music</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiApplemusic} color="#fa2d48" />
            <span className={settingsUi.integrationName}>Browse Artwork & Catalog</span>
            {present || isDesktop ? <AppleMusicIntegration /> : <span className={settingsUi.value}>Needs the extension</span>}
          </div>
          <AppleMusicToggles />
          <CanvasToggle />
        </section>
        <p className={settingsUi.footer}>From Apple Music’s public pages. No Apple Music account or sign-in needed.</p>

        {/* ---- 4. Playback ---- */}
        <h2 className={settingsUi.sectionHeader}>Playback</h2>
        <section className={settingsUi.group}>
          <Toggle
            label="AutoPlay"
            detail="When the queue ends, keep playing similar music."
            checked={autoplay}
            onChange={setAutoplay}
          />
          <label className={settingsUi.controlRow}>
            <span>Crossfade</span>
            <Select<number | 'automix'>
              label="Crossfade"
              value={automix ? 'automix' : crossfadeSec}
              options={[
                ...CROSSFADE_CHOICES.map((seconds) => ({ value: seconds, label: seconds === 0 ? 'Off' : `${seconds} seconds` })),
                { value: 'automix', label: 'Automix' },
              ]}
              onChange={(value) => (value === 'automix' ? setAutomix(true) : setCrossfade(value))}
            />
          </label>
          {automix && (
            <label className={settingsUi.controlRow}>
              <span>Blend Length</span>
              <Select
                label="Blend Length"
                value={automixBars}
                options={AUTOMIX_BARS.map((bars) => ({ value: bars, label: `Up to ${bars} bars` }))}
                onChange={setAutomixBars}
              />
            </label>
          )}
          <Toggle
            label="Show Stats for Nerds"
            detail="Codec, bitrate and sample rate under the artist in the full-screen player, and what Automix is doing."
            checked={showNerdStats}
            onChange={setShowNerdStats}
          />
          <Toggle
            label="Share Listening Activity to YouTube"
            detail="Songs you play here go to your YouTube Music history and shape its recommendations."
            checked={shareHistory}
            onChange={setShareHistory}
          />
        </section>

        {/* ---- 5. Listen Together ---- */}
        <h2 className={settingsUi.sectionHeader}>Listen Together</h2>
        <section className={settingsUi.group}>
          <LinkRow
            to="/settings/listen-together"
            icon={<Glyph Icon={Users} color="#fa2d48" />}
            title="Listen Together"
            value={party.code ? `In party ${party.code}` : 'Listen in sync with friends'}
          />
        </section>

        {/* ---- 6. Lyrics ---- */}
        <h2 className={settingsUi.sectionHeader}>Lyrics</h2>
        <section className={settingsUi.group}>
          <button className={`${settingsUi.integrationPlain} ${settingsUi.linkRow}`} onClick={() => setLyrics(true)}>
            <span className={settingsUi.integrationName}>Lyric Sources</span>
            <span className={settingsUi.value}>
              Order, sources, syllable timing
              <ChevronRight size={16} />
            </span>
          </button>
          <div className={settingsUi.integrationPlain}>
            <span className={settingsUi.integrationName}>Lyric Sources Access</span>
            {present || isDesktop ? <LyricSourcesAccess /> : <span className={settingsUi.value}>Needs the extension</span>}
          </div>
        </section>
      </div>

      {lyrics && (
        <Suspense fallback={null}>
          <LyricsSettings onClose={() => setLyrics(false)} />
        </Suspense>
      )}
    </div>
  );
}
