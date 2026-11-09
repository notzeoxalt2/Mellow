import { ArrowLeftRight, ChevronRight, ExternalLink, Palette, Users } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { SiApplemusic, SiSpotify, SiYoutubemusic } from 'react-icons/si';
import { LogoMark } from '@/components/icons/LogoMark';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { useExtension } from '@/extension/useExtension';
import { openYtSignIn, useRefreshYtAuth, useSetConnected, useYtAuth } from '@/extension/useYtAuth';
import { useParty } from '@/party/useParty';
import { useHistorySettings } from '@/playback/historyReporting';
import { Select } from '@/components/Select';
import { AUTOMIX_BARS } from '@/playback/automix/choices';
import { CROSSFADE_CHOICES, usePlayer } from '@/state/player';
import { readAppearancePreferences, updateAppearancePreferences } from '@/lib/appearance';
import { getActiveThemeId, getThemeById, isDynamicAccentSyncEnabled, setDynamicAccentSync } from '@/lib/themeManager';
import { AppleMusicIntegration, AppleMusicToggles, CanvasToggle, LyricSourcesAccess, MusicServiceToggles, SpotifyIntegration, Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const LyricsSettings = lazy(() => import('@/shell/LyricsSettings').then((m) => ({ default: m.LyricsSettings })));

/** An integration's coloured glyph, as on the Extension page. */
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
  suffix,
  onChange,
}: {
  label: string;
  detail: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={settingsUi.controlRow}>
      <span className={settingsUi.rowText}>
        <span>{label}</span>
        <span className={settingsUi.rowDetail}>{detail}</span>
      </span>
      <span className="flex w-[220px] flex-none items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="min-w-0 flex-1 cursor-pointer"
          style={{ accentColor: 'var(--theme-accent)' }}
          aria-label={label}
        />
        <output className="w-10 text-right type-callout tabular-nums text-secondary">
          {value}{suffix}
        </output>
      </span>
    </label>
  );
}

function youtubeText(auth: ReturnType<typeof useYtAuth>): string {
  if (auth.state === 'checking') return 'Checking…';
  if (auth.state === 'unavailable') return 'Needs the extension';
  const { browserSignedIn, connected, signedIn, active } = auth.auth;
  if (!browserSignedIn) return 'Not signed in';
  if (!connected) return 'Disconnected';
  if (signedIn && active) return active.name;
  return auth.auth.problem ? 'Sign-in needs attention' : 'Checking account';
}

function YouTubeMusicIntegration() {
  const auth = useYtAuth();
  const refresh = useRefreshYtAuth();
  const connect = useSetConnected();
  if (auth.state !== 'ready') return <span className={settingsUi.value}>{youtubeText(auth)}</span>;
  const { browserSignedIn, connected, signedIn, problem, reauthRequired } = auth.auth;
  const action = !browserSignedIn
    ? { label: 'Sign In', run: openYtSignIn }
    : reauthRequired
        ? { label: 'Reconnect', run: openYtSignIn }
        : !connected
          ? {
              label: 'Connect',
              run: () => {
                connect.mutate(true);
                if (!signedIn) openYtSignIn();
              },
            }
          : problem || !signedIn
            ? { label: 'Retry', run: () => refresh.mutate() }
            : null;
  return (
    <span className={settingsUi.value}>
      <span title={problem ?? undefined}>{youtubeText(auth)}</span>
      {action && (
        <button
          className={settingsUi.inlineButton}
          onClick={action.run}
          disabled={refresh.isPending || connect.isPending}
        >
          {refresh.isPending || connect.isPending ? 'Checking…' : action.label}
        </button>
      )}
    </span>
  );
}

/**
 * Settings (SettingsSheet on the phone): the account and its integrations,
 * Listen Together, playback and lyrics, in the same grouped rows.
 */
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
      setErrorMsg(res.error || 'Failed to download update');
    }
  };

  const handleInstall = () => {
    window.electronAPI?.quitAndInstallUpdate?.();
  };

  const handleOpenGitHub = () => {
    window.electronAPI?.openReleaseUrl?.(updateInfo?.releaseUrl || 'https://github.com/notzeoxalt2/Mellow/releases');
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <>
      <h2 className={settingsUi.sectionHeader}>Desktop App & Updates</h2>
      <section className={settingsUi.group}>
        <div className={settingsUi.row}>
          <span className={settingsUi.rowText}>
            <span>Mellow Desktop</span>
            <span className={settingsUi.rowDetail}>
              Version {updateInfo?.currentVersion || '1.0.0'} (Windows x64)
            </span>
          </span>
          <div className="flex items-center gap-2">
            {status === 'idle' && (
              <button
                type="button"
                className={settingsUi.inlineButton}
                onClick={handleCheck}
                disabled={checking}
              >
                {checking ? 'Checking…' : 'Check for Updates'}
              </button>
            )}
            {status === 'up-to-date' && (
              <span className={settingsUi.value}>
                <span className={settingsUi.dot} />
                Up to date
                <button
                  type="button"
                  className={settingsUi.inlineButton}
                  onClick={handleCheck}
                  disabled={checking}
                >
                  {checking ? 'Checking…' : 'Check Again'}
                </button>
              </span>
            )}
          </div>
        </div>

        {status === 'update-available' && updateInfo && (
          <div className="flex flex-col gap-3 px-4 py-3 bg-quaternary/40 border-t border-hairline">
            <div className="flex items-center justify-between">
              <span className="type-title-3 font-semibold text-emerald-400">
                Update Available: v{updateInfo.latestVersion}
              </span>
              <button
                type="button"
                onClick={handleOpenGitHub}
                className="text-secondary hover:text-primary type-callout inline-flex items-center gap-1"
              >
                Release Notes <ExternalLink size={13} />
              </button>
            </div>
            {updateInfo.releaseNotes && (
              <p className="type-callout text-secondary whitespace-pre-wrap max-h-24 overflow-y-auto rounded bg-black/20 p-2">
                {updateInfo.releaseNotes}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-[8px] bg-key px-4 py-1.5 type-callout-emphasized text-white hover:opacity-90"
              >
                Download Update {formatBytes(updateInfo.assetSize) ? `(${formatBytes(updateInfo.assetSize)})` : ''}
              </button>
            </div>
          </div>
        )}

        {status === 'downloading' && (
          <div className="flex flex-col gap-2 px-4 py-3 border-t border-hairline">
            <div className="flex items-center justify-between type-callout">
              <span className="text-primary font-medium">Downloading update…</span>
              <span className="text-secondary tabular-nums">
                {progress.percent}% ({formatBytes(progress.transferred)} / {formatBytes(progress.total)})
              </span>
            </div>
            <div className="w-full bg-quaternary h-2 rounded-full overflow-hidden">
              <div
                className="bg-key h-full transition-all duration-200"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline bg-emerald-500/10">
            <div className="flex flex-col">
              <span className="type-title-3 font-semibold text-emerald-400">
                Update Ready to Install
              </span>
              <span className="type-callout text-secondary">
                Restart Mellow now to apply the new version.
              </span>
            </div>
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-[8px] bg-emerald-500 px-4 py-1.5 type-callout-emphasized text-white hover:bg-emerald-600"
            >
              Restart & Install
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-hairline text-red-400">
            <span className="type-callout">{errorMsg || 'Failed to update.'}</span>
            <button
              type="button"
              className={settingsUi.inlineButton}
              onClick={handleCheck}
            >
              Retry
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleOpenGitHub}
          className={`${settingsUi.integrationPlain} ${settingsUi.linkRow}`}
        >
          <span className={settingsUi.integrationName}>GitHub Releases</span>
          <span className={settingsUi.value}>
            notzeoxalt2/Mellow
            <ExternalLink size={14} />
          </span>
        </button>
      </section>
      <p className={settingsUi.footer}>
        Mellow automatically checks for updates in the background. Install updates with a single click.
      </p>
    </>
  );
}

export default function SettingsPage() {
  const extension = useExtension();
  const party = useParty();
  const autoplay = usePlayer((s) => s.autoplay);
  const crossfadeSec = usePlayer((s) => s.crossfadeSec);
  const automix = usePlayer((s) => s.automix);
  const automixBars = usePlayer((s) => s.automixBars);
  const showNerdStats = usePlayer((s) => s.showNerdStats);
  const shareHistory = useHistorySettings((s) => s.share);
  const setShareHistory = useHistorySettings((s) => s.setShare);
  const { setAutoplay, setCrossfade, setAutomix, setAutomixBars, setShowNerdStats } = usePlayer.getState();
  const [lyrics, setLyrics] = useState(false);
  const [appearance, setAppearance] = useState(readAppearancePreferences);
  const [dynamicAccent, setDynamicAccent] = useState(isDynamicAccentSyncEnabled);
  const [windowsAccentWarning, setWindowsAccentWarning] = useState('');
  const present = extension.state === 'present';

  useEffect(() => {
    const refresh = () => {
      setAppearance(readAppearancePreferences());
      setDynamicAccent(isDynamicAccentSyncEnabled());
    };
    window.addEventListener('mellow:appearance-changed', refresh);
    window.addEventListener('mellow:theme-changed', refresh);
    const onAccentStatus = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setWindowsAccentWarning(typeof detail === 'string' ? detail : '');
    };
    window.addEventListener('mellow:windows-accent-status', onAccentStatus);
    return () => {
      window.removeEventListener('mellow:appearance-changed', refresh);
      window.removeEventListener('mellow:theme-changed', refresh);
      window.removeEventListener('mellow:windows-accent-status', onAccentStatus);
    };
  }, []);

  const updateAppearance = (patch: Parameters<typeof updateAppearancePreferences>[0]) => {
    setAppearance(updateAppearancePreferences(patch));
  };
  const activeTheme = getThemeById(getActiveThemeId());

  return (
    <div className={settingsUi.centered}>
      <PageHeader title="Settings" />
      <div className={settingsUi.body}>
        <h2 className={settingsUi.sectionHeader}>Account & Integrations</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiYoutubemusic} color="#ffffff" ink="#ff0033" />
            <span className={settingsUi.integrationName}>YouTube Music</span>
            <YouTubeMusicIntegration />
          </div>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiSpotify} color="#1ed760" />
            <span className={settingsUi.integrationName}>Spotify</span>
            {present ? <SpotifyIntegration /> : <span className={settingsUi.value}>Needs the extension</span>}
          </div>
          <LinkRow
            to="/extension"
            icon={<Glyph Icon={LogoMark} color="#7028d8" />}
            title="BitChord Extension"
            value={present ? `v${extension.extension.info.version}` : 'Not installed'}
          />
          <LinkRow
            to="/sync"
            icon={<Glyph Icon={ArrowLeftRight} color="#636366" />}
            title="Spotify playlist sync"
            value="Manage synced playlists"
          />
        </section>
        <h2 className={settingsUi.sectionHeader}>Music Services</h2>
        <section className={settingsUi.group}>
          <MusicServiceToggles />
        </section>
        <section className={`${settingsUi.group} mt-3 empty:hidden`}>
          <Toggle
            label="Share Listening Activity to YouTube"
            detail={
              present && !extension.extension.info.capabilities.includes('yt.stats')
                ? 'Update the BitChord extension to share: this version can’t send plays to YouTube.'
                : 'Songs you play here go to your YouTube Music history and shape its recommendations.'
            }
            checked={shareHistory}
            onChange={setShareHistory}
          />
          <CanvasToggle />
        </section>

        <h2 className={settingsUi.sectionHeader}>Apple Music</h2>
        <section className={settingsUi.group}>
          <div className={settingsUi.integration}>
            <Glyph Icon={SiApplemusic} color="#fa2d48" />
            <span className={settingsUi.integrationName}>Extension Access</span>
            {present ? <AppleMusicIntegration /> : <span className={settingsUi.value}>Needs the extension</span>}
          </div>
          <AppleMusicToggles />
        </section>
        <p className={settingsUi.footer}>From Apple Music’s public pages. No Apple Music account or sign-in needed.</p>

        <h2 className={settingsUi.sectionHeader}>Listen Together</h2>
        <section className={settingsUi.group}>
          <LinkRow
            to="/settings/listen-together"
            icon={<Glyph Icon={Users} color="#fa2d48" />}
            title="Listen Together"
            value={party.code ? `In party ${party.code}` : 'Listen in sync with friends'}
          />
        </section>

        <h2 className={settingsUi.sectionHeader}>Appearance</h2>
        <section className={settingsUi.group}>
          <LinkRow
            to="/themes"
            icon={<Glyph Icon={Palette} color={activeTheme.colors.accent} ink="#111318" />}
            title="Theme palette"
            value={activeTheme.name}
          />
          <Toggle
            label="Match colors to the music"
            detail="Use the playing artwork for accents and the soft background glow."
            checked={dynamicAccent}
            onChange={(enabled) => {
              setDynamicAccent(enabled);
              setDynamicAccentSync(enabled);
            }}
          />
          <Toggle
            label="Artwork background"
            detail="Tint the page with album and playlist artwork, like Apple Music."
            checked={appearance.artworkBackdrop}
            onChange={(enabled) => updateAppearance({ artworkBackdrop: enabled })}
          />
          <label className={settingsUi.controlRow}>
            <span className={settingsUi.rowText}>
              <span>Now Playing background</span>
              <span className={settingsUi.rowDetail}>Choose the original dark panel or a soft backdrop that follows the current cover.</span>
            </span>
            <Select
              label="Now Playing background"
              value={appearance.playerArtworkAmbient ? 'artwork' : 'default'}
              options={[
                { value: 'default', label: 'Original dark' },
                { value: 'artwork', label: 'Artwork ambient' },
              ] as const}
              onChange={(value) => updateAppearance({ playerArtworkAmbient: value === 'artwork' })}
            />
          </label>
          {appearance.playerArtworkAmbient && (
            <>
              <RangeControl
                label="Now Playing artwork glow"
                detail="Adjust how much of the current cover colors the right-side panel."
                value={appearance.nowPlayingPanelGlow}
                min={0}
                max={60}
                suffix="%"
                onChange={(nowPlayingPanelGlow) => updateAppearance({ nowPlayingPanelGlow })}
              />
              <RangeControl
                label="Now Playing glow spread"
                detail="Control how far the cover wash reaches across the panel."
                value={appearance.nowPlayingPanelGlowSpread}
                min={24}
                max={100}
                suffix="%"
                onChange={(nowPlayingPanelGlowSpread) => updateAppearance({ nowPlayingPanelGlowSpread })}
              />
              <RangeControl
                label="Now Playing glow blur"
                detail="Higher blur softens the colors; Gaming mode limits this for performance."
                value={appearance.nowPlayingPanelGlowBlur}
                min={8}
                max={96}
                suffix="px"
                onChange={(nowPlayingPanelGlowBlur) => updateAppearance({ nowPlayingPanelGlowBlur })}
              />
            </>
          )}
          <label className={settingsUi.controlRow}>
            <span className={settingsUi.rowText}>
              <span>Full-screen player background</span>
              <span className={settingsUi.rowDetail}>Keep the original dark player by default, or let the current cover fill the backdrop.</span>
            </span>
            <Select
              label="Full-screen player background"
              value={appearance.fullScreenPlayerAmbient ? 'artwork' : 'default'}
              options={[
                { value: 'default', label: 'Original dark' },
                { value: 'artwork', label: 'Artwork ambient' },
              ] as const}
              onChange={(value) => updateAppearance({ fullScreenPlayerAmbient: value === 'artwork' })}
            />
          </label>
          {appearance.fullScreenPlayerAmbient && (
            <RangeControl
              label="Full-screen ambient blur"
              detail="Tune the softness of the enlarged cover behind the player. Gaming mode caps the blur."
              value={appearance.fullScreenAmbientBlur}
              min={16}
              max={140}
              suffix="px"
              onChange={(fullScreenAmbientBlur) => updateAppearance({ fullScreenAmbientBlur })}
            />
          )}
          {appearance.artworkBackdrop && (
            <RangeControl
              label="Background glow"
              detail="Set how strongly the current artwork colors wash across the app."
              value={appearance.artworkGlow}
              min={0}
              max={100}
              suffix="%"
              onChange={(artworkGlow) => updateAppearance({ artworkGlow })}
            />
          )}
          {appearance.artworkBackdrop && (
            <RangeControl
              label="Ambient spread"
              detail="Set how broadly artwork color reaches across pages and the search glass."
              value={appearance.ambientSpread}
              min={40}
              max={120}
              suffix="%"
              onChange={(ambientSpread) => updateAppearance({ ambientSpread })}
            />
          )}
          <RangeControl
            label="Player artwork bloom"
            detail="Set the soft halo beneath the cover in the full-screen player, separately from the page background."
            value={appearance.fullScreenArtworkGlow}
            min={0}
            max={100}
            suffix="%"
            onChange={(fullScreenArtworkGlow) => updateAppearance({ fullScreenArtworkGlow })}
          />
          <RangeControl
            label="Sidebar edge glow"
            detail="Set the soft music-colored light along the navigation edge."
            value={appearance.edgeGlow}
            min={0}
            max={100}
            suffix="%"
            onChange={(edgeGlow) => updateAppearance({ edgeGlow })}
          />
          <RangeControl
            label="Sidebar glow spread"
            detail="Widen or tighten the music-colored light along the navigation edge."
            value={appearance.edgeGlowSpread}
            min={12}
            max={80}
            suffix="px"
            onChange={(edgeGlowSpread) => updateAppearance({ edgeGlowSpread })}
          />
          <label className={settingsUi.controlRow}>
            <span className={settingsUi.rowText}>
              <span>Glow color</span>
              <span className={settingsUi.rowDetail}>Follow the cover, use a calm gray, or a frosted white.</span>
            </span>
            <Select
              label="Glow color"
              value={appearance.glowColorMode}
              options={[
                { value: 'music', label: 'Match music' },
                { value: 'gray', label: 'Soft gray' },
                { value: 'glass', label: 'Frosted glass' },
                { value: 'custom', label: 'Custom color' },
              ] as const}
              onChange={(glowColorMode) => updateAppearance({ glowColorMode })}
            />
          </label>
          {appearance.glowColorMode === 'custom' && (
            <label className={settingsUi.controlRow}>
              <span className={settingsUi.rowText}>
                <span>Ambient color</span>
                <span className={settingsUi.rowDetail}>Choose one tint for the page glow, search glass, window chrome and sidebar edge.</span>
              </span>
              <input
                aria-label="Ambient color"
                type="color"
                value={appearance.customGlowColor}
                onChange={(event) => updateAppearance({ customGlowColor: event.currentTarget.value })}
                className="size-9 cursor-pointer rounded-[8px] border border-white/15 bg-transparent p-1"
              />
            </label>
          )}
          {appearance.artworkBackdrop && (
            <Toggle
              label="Slow ambient motion"
              detail="A gentle, low-cost pulse in the color glow. Album artwork itself stays still."
              checked={appearance.ambientGlowMotion}
              onChange={(ambientGlowMotion) => updateAppearance({ ambientGlowMotion })}
            />
          )}
          {appearance.artworkBackdrop && appearance.ambientGlowMotion && (
            <>
              <RangeControl
                label="Glow movement"
                detail="Adjust the slow opacity pulse; it does not animate the artwork or use audio analysis."
                value={appearance.ambientGlowAmount}
                min={0}
                max={100}
                suffix="%"
                onChange={(ambientGlowAmount) => updateAppearance({ ambientGlowAmount })}
              />
              <RangeControl
                label="Glow movement speed"
                detail="Set how slowly the ambient light drifts. Slower movement uses fewer visual updates."
                value={appearance.ambientMotionSpeed}
                min={10}
                max={100}
                suffix="%"
                onChange={(ambientMotionSpeed) => updateAppearance({ ambientMotionSpeed })}
              />
            </>
          )}
          <Toggle
            label="Glass controls"
            detail="Use translucent, blurred surfaces for search, window controls and the floating player."
            checked={appearance.glassEnabled}
            onChange={(enabled) => updateAppearance({ glassEnabled: enabled })}
          />
          {appearance.glassEnabled && (
            <>
              <RangeControl
                label="Glass opacity"
                detail="Raise it for clearer controls; lower it for more transparency."
                value={appearance.glassOpacity}
                min={55}
                max={94}
                suffix="%"
                onChange={(glassOpacity) => updateAppearance({ glassOpacity })}
              />
              <RangeControl
                label="Glass blur"
                detail="Adjust how softly the page shows through."
                value={appearance.glassBlur}
                min={0}
                max={36}
                suffix="px"
                onChange={(glassBlur) => updateAppearance({ glassBlur })}
              />
            </>
          )}
          <Toggle
            label="Gaming mode"
            detail="Reduce background blur and pause video visuals to leave more room for games."
            checked={appearance.lowResourceMode}
            onChange={(enabled) => updateAppearance({ lowResourceMode: enabled })}
          />
          <Toggle
            label="Experimental: Windows accent sync"
            detail="Tint Windows taskbar and window accents from the playing cover while Mellow is open. Your previous colors are restored when Mellow closes; taskbar tint depends on Windows color settings."
            checked={appearance.windowsAccentSync}
            onChange={(windowsAccentSync) => {
              setWindowsAccentWarning('');
              updateAppearance({ windowsAccentSync });
            }}
          />
          {windowsAccentWarning && (
            <p className="px-4 pb-3 type-callout text-secondary" role="status">
              {windowsAccentWarning} Switch this option off and on to retry.
            </p>
          )}
        </section>
        <p className={settingsUi.footer}>Tune glass, artwork color, motion and gaming mode here. Your choices are saved on this device.</p>

        <h2 className={settingsUi.sectionHeader}>Playback</h2>
        <section className={settingsUi.group}>
          <Toggle
            label="Play music videos"
            detail={appearance.lowResourceMode
              ? 'Gaming mode pauses video visuals. Turn it off to allow music videos again.'
              : 'Off keeps audio and static artwork only. You can still open the full-screen player.'}
            checked={appearance.playMusicVideos}
            onChange={(enabled) => updateAppearance({ playMusicVideos: enabled })}
          />
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
            detail="See the active codec, bitrate and sample rate in the full-screen player. Mellow selects the highest-bitrate supported YouTube stream and prefers Opus when available; the source sets the quality ceiling."
            checked={showNerdStats}
            onChange={setShowNerdStats}
          />
        </section>
        {automix && (
          <p className={settingsUi.footer}>
            Automix finds each song’s tempo, key and phrases, then blends on the beat: the next song is time-stretched to match, and
            the bass swaps over halfway. Where it can, it loops a few instrumental bars of each song and ramps the tempo between
            them. Songs it can’t read in time play to the end and crossfade. Based on AutoMix by David Finnegan (AGPL-3.0).
          </p>
        )}

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
            {present ? <LyricSourcesAccess /> : <span className={settingsUi.value}>Needs the extension</span>}
          </div>
        </section>

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
