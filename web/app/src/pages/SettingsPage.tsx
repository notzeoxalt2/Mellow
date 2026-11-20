import { ArrowDownCircle, CheckCircle2, ChevronRight, Download, FolderDown, RefreshCw, Sparkles, Users } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { MdOutlineExtension } from 'react-icons/md';
import { SiApplemusic, SiSpotify, SiYoutubemusic } from 'react-icons/si';
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

function RangeControl({
  label,
  detail,
  value,
  min,
  max,
  suffix = '%',
  onChange,
}: {
  label: string;
  detail?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={settingsUi.controlRow}>
      <span className={settingsUi.rowText}>
        <span>{label}</span>
        {detail && <span className={settingsUi.rowDetail}>{detail}</span>}
      </span>
      <span className="flex w-[210px] flex-none items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="min-w-0 flex-1 cursor-pointer accent-(--theme-accent)"
          aria-label={label}
        />
        <output className="w-12 text-right type-callout tabular-nums text-secondary">
          {value}{suffix}
        </output>
      </span>
    </label>
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

function DesktopUpdatesSection() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'up-to-date' | 'update-available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);
  const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI?.isDesktop;

  useEffect(() => {
    if (!isDesktop || !window.electronAPI) return;

    const unsubAvail = window.electronAPI.onUpdateAvailable?.((info) => {
      setUpdateInfo(info);
      setStatus('update-available');
    });

    const unsubProg = window.electronAPI.onUpdateProgress?.((prog) => {
      setProgress(prog);
      setStatus('downloading');
    });

    const unsubDone = window.electronAPI.onUpdateDownloaded?.(() => {
      setStatus('downloaded');
    });

    return () => {
      unsubAvail?.();
      unsubProg?.();
      unsubDone?.();
    };
  }, [isDesktop]);

  if (!isDesktop) return null;

  const handleCheck = async () => {
    if (!window.electronAPI?.checkForUpdates) return;
    setChecking(true);
    setErrorMsg('');
    try {
      const res = await window.electronAPI.checkForUpdates();
      setChecking(false);
      if (res.available) {
        setUpdateInfo(res);
        setStatus('update-available');
      } else {
        setStatus('up-to-date');
      }
    } catch (e: any) {
      setChecking(false);
      setStatus('error');
      setErrorMsg(e.message || 'Failed to check for updates');
    }
  };

  const handleDownload = async () => {
    if (!window.electronAPI?.downloadUpdate || !updateInfo?.assetUrl) return;
    setStatus('downloading');
    setErrorMsg('');
    const res = await window.electronAPI.downloadUpdate(updateInfo.assetUrl);
    if (!res.ok) {
      setStatus('error');
      setErrorMsg(res.error || 'Failed to download installer');
    }
  };

  return (
    <>
      <h2 className={settingsUi.sectionHeader}>Mellow Desktop Updates</h2>
      <section className={settingsUi.group}>
        <div className={settingsUi.row}>
          <div className={settingsUi.rowText}>
            <span>Desktop Version</span>
            <span className={settingsUi.rowDetail}>Mellow v1.1.0 for Windows</span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer"
            onClick={handleCheck}
            disabled={checking || status === 'downloading'}
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
            <span>{checking ? 'Checking…' : 'Check for Updates'}</span>
          </button>
        </div>

        {status === 'up-to-date' && (
          <div className={`${settingsUi.row} text-green-400 gap-2`}>
            <CheckCircle2 size={16} />
            <span className="text-xs">Mellow is up to date! You are running the latest version.</span>
          </div>
        )}

        {status === 'update-available' && (
          <div className={`${settingsUi.row} flex-col items-start gap-2 py-3 bg-white/[0.04]`}>
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-semibold text-white">Update Available: {updateInfo?.version || 'Newer version'}</span>
              <button
                type="button"
                className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] bg-(--theme-accent) hover:brightness-110 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer shadow-sm"
                onClick={handleDownload}
              >
                <ArrowDownCircle size={13} />
                <span>Download & Install</span>
              </button>
            </div>
            {updateInfo?.notes && (
              <p className="text-[11px] text-secondary max-h-24 overflow-y-auto w-full whitespace-pre-wrap">{updateInfo.notes}</p>
            )}
          </div>
        )}

        {status === 'downloading' && (
          <div className={`${settingsUi.row} flex-col items-start gap-1.5 py-3 bg-white/[0.04]`}>
            <div className="flex justify-between w-full text-xs">
              <span>Downloading update…</span>
              <span>{Math.round(progress.percent)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-(--theme-accent) transition-all duration-200"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className={`${settingsUi.row} justify-between items-center py-3 bg-green-500/10`}>
            <span className="text-xs text-green-400 font-medium">Update downloaded! Restart to apply.</span>
            <button
              type="button"
              className="px-3 py-1.5 rounded-[8px] bg-green-600 hover:bg-green-500 text-xs font-medium text-white transition-all cursor-pointer shadow-sm"
              onClick={() => window.electronAPI?.quitAndInstallUpdate?.()}
            >
              Restart & Update
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className={`${settingsUi.row} text-red-400 text-xs`}>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className={`${settingsUi.row} justify-between items-center py-2.5 border-t border-white/[0.06]`}>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white">Windows Installer (.exe)</span>
            <span className="text-[11px] text-secondary">Download or open the standalone Mellow Setup package</span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 text-xs font-medium text-white transition-all cursor-pointer border border-white/10"
            onClick={() => (window as any).electronAPI?.openInstaller?.()}
          >
            <Download size={13} />
            <span>Open Installer</span>
          </button>
        </div>
      </section>
    </>
  );
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
              value={present ? `v${(extension as any)?.extension?.info?.version ?? '1.1.0'}` : 'Not installed'}
            />
          )}
        </section>

        {/* ---- 2. Appearance, Ambient Glow & Sliders ---- */}
        <h2 className={settingsUi.sectionHeader}>Appearance & Ambient Glow</h2>
        <section className={settingsUi.group}>
          <Toggle
            label="Ambient Artwork Mesh (Full Screen)"
            detail="Smooth WebGL Gaussian blur backdrop in the full screen player (matching the web experience)."
            checked={appearance.fullScreenPlayerAmbient}
            onChange={(on) => update({ fullScreenPlayerAmbient: on })}
          />
          <RangeControl
            label="Artwork Glow"
            detail="Spreads album artwork colors across the player and backdrops."
            value={appearance.artworkGlow}
            min={0}
            max={100}
            onChange={(artworkGlow) => update({ artworkGlow })}
          />
          <RangeControl
            label="Sidebar Glow"
            detail="Ambient lighting behind the navigation sidebar."
            value={appearance.sidebarGlowStrength}
            min={0}
            max={100}
            onChange={(sidebarGlowStrength) => update({ sidebarGlowStrength })}
          />
          <RangeControl
            label="Player Bar Glow"
            detail="Subtle dynamic glow under the floating glass player pill."
            value={appearance.playerBarGlowStrength}
            min={0}
            max={100}
            onChange={(playerBarGlowStrength) => update({ playerBarGlowStrength })}
          />
          <RangeControl
            label="Glass Blur"
            detail="Frosted glass blur intensity for header and floating controls."
            value={appearance.glassBlur}
            min={0}
            max={36}
            suffix="px"
            onChange={(glassBlur) => update({ glassBlur })}
          />
          <Toggle
            label="Auto Beat Sync"
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
            label="Smart Gaming & Memory Saver"
            detail="Automatically pauses background video decoders and heavy animations when Mellow is minimized or you are gaming in another window."
            checked={appearance.smartMemorySaving}
            onChange={(on) => update({ smartMemorySaving: on })}
          />
          <label className={settingsUi.controlRow}>
            <span>Visuals & Video Preference</span>
            <Select<'spotify' | 'youtube' | 'auto'>
              label="Visuals & Video Preference"
              value={appearance.videoPreference}
              options={[
                { value: 'spotify', label: 'Spotify Canvas (Looping Visual)' },
                { value: 'youtube', label: 'YouTube Official Music Video' },
                { value: 'auto', label: 'Smart Auto' },
              ]}
              onChange={(value) => update({ videoPreference: value })}
            />
          </label>
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

        {/* ---- 5. Sound Quality & Audio Formats ---- */}
        <h2 className={settingsUi.sectionHeader}>Sound Quality & Formats</h2>
        <section className={settingsUi.group}>
          <label className={settingsUi.controlRow}>
            <span>Streaming Audio Format</span>
            <Select<'lossless-hires' | 'lossless-cd' | 'opus-256' | 'aac-256' | 'saver-96'>
              label="Streaming Audio Format"
              value={appearance.audioQualityFormat}
              options={[
                { value: 'lossless-hires', label: 'Hi-Res Lossless (FLAC 24-bit / 192kHz)' },
                { value: 'lossless-cd', label: 'Lossless CD Quality (FLAC 16-bit / 44.1kHz)' },
                { value: 'opus-256', label: 'High Quality (Opus 256kbps VBR)' },
                { value: 'aac-256', label: 'High Quality (AAC 256kbps)' },
                { value: 'saver-96', label: 'Data Saver (Opus 96kbps)' },
              ]}
              onChange={(value) => update({ audioQualityFormat: value })}
            />
          </label>
          <Toggle
            label="EBU R128 Loudness Normalization"
            detail="Matches perceived volume across all songs (-14 LUFS standard), eliminating jarring jumps between loud and quiet tracks."
            checked={appearance.soundCheck}
            onChange={(on) => update({ soundCheck: on })}
          />
          <Toggle
            label="Smart Ahead Preload (Zero-Gap Playback)"
            detail="Pre-buffers the upcoming song on the second audio deck while you listen, guaranteeing instant 0.0s playback start on track advance."
            checked={appearance.preloadUpcoming}
            onChange={(on) => update({ preloadUpcoming: on })}
          />
          <div className={settingsUi.controlRow}>
            <span>Bit-Perfect Audio Output</span>
            <span className="type-[500_12px/16px] text-tertiary">Exclusive Hardware Clock • DRC Dynamic Range Compression Bypassed</span>
          </div>
        </section>

        {/* ---- Offline Downloads ---- */}
        <h2 className={settingsUi.sectionHeader}>Offline Downloads</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.row}>
            <div className={settingsUi.rowText}>
              <span>Storage Location</span>
              <span className={settingsUi.rowDetail}>%USERPROFILE%\Music\Mellow (High-bitrate audio with synchronized .lrc lyrics)</span>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-medium text-white transition-all cursor-pointer"
              onClick={() => {
                if (window.electronAPI?.openDownloadsFolder) {
                  window.electronAPI.openDownloadsFolder();
                }
              }}
            >
              <FolderDown size={14} />
              <span>Open Downloads Folder</span>
            </button>
          </div>
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

        {/* ---- 7. Desktop Updates ---- */}
        <DesktopUpdatesSection />
      </div>

      {lyrics && (
        <Suspense fallback={null}>
          <LyricsSettings onClose={() => setLyrics(false)} />
        </Suspense>
      )}
    </div>
  );
}
